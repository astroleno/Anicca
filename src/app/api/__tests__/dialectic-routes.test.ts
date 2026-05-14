import { NextRequest } from "next/server";
import { POST as branchesPost } from "@/app/api/branches/route";
import { POST as chatPost } from "@/app/api/chat/route";
import { POST as synthesisPost } from "@/app/api/synthesis/route";

const { createResponse, createChatCompletion, openAiMock } = vi.hoisted(() => {
  const createResponse = vi.fn();
  const createChatCompletion = vi.fn();

  return {
    createResponse,
    createChatCompletion,
    openAiMock: {
      responses: {
        create: createResponse
      },
      chat: {
        completions: {
          create: createChatCompletion
        }
      }
    }
  };
});

vi.mock("@/lib/openai/client", () => ({
  getDefaultModel: (model?: string) => model || "gpt-4o-mini",
  getOpenAiClient: () => openAiMock,
  openai: openAiMock
}));

describe("dialectic routes", () => {
  beforeEach(() => {
    createResponse.mockReset();
    createChatCompletion.mockReset();
  });

  it("returns structured thesis and antithesis with echoed requestId", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
        antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-1",
          userText: "要不要继续",
          contextMessages: [
            { role: "system", content: "父链系统上下文" },
            { role: "user", content: "上一轮问题" },
            { role: "assistant", content: "继续：继续推进；暂停：暂停重构" }
          ],
          graph: {
            nodes: {
              hidden: {
                text: "route must not read graph payload"
              }
            }
          }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-1",
      thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
    });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(createResponse.mock.calls[0][0].input).toMatchInlineSnapshot(`
      "你负责为同一个问题生成一对结构化的正反分支。

      只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。

      schema={"thesis":{"text":"","summary":"","label":"","stance":"正"},"antithesis":{"text":"","summary":"","label":"","stance":"反"}}

      summary 必须是单行摘要，label 必须是简短标签。

      历史上下文:
      system: 父链系统上下文
      user: 上一轮问题
      assistant: 继续：继续推进；暂停：暂停重构

      当前用户输入:
      要不要继续"
    `);
    expect(createResponse.mock.calls[0][0].input).not.toContain("route must not read graph payload");
  });

  it("returns 502 when branches output is not valid JSON", async () => {
    createResponse.mockResolvedValue({
      output_text: "这里没有 JSON"
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-2",
          userText: "要不要继续"
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-2",
      error: "invalid_model_output"
    });
  });

  it("returns 502 when branches stance drifts from contract", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "合" },
        antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-3",
          userText: "要不要继续"
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-3",
      error: "invalid_model_output"
    });
  });

  it("returns structured synthesis with echoed requestId", async () => {
    createResponse.mockResolvedValue({
      output_text: "```json\n{\"synthesis\":{\"text\":\"重开主线\",\"summary\":\"主线重开\",\"label\":\"重开\",\"stance\":\"合\"}}\n```"
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-4",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" },
          contextMessages: [
            { role: "user", content: "母题：要不要继续" },
            { role: "assistant", content: "继续：继续推进；暂停：暂停重构" }
          ],
          graph: {
            nodes: {
              hidden: {
                text: "route must not read synthesis graph payload"
              }
            }
          }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-4",
      synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "合" }
    });
    expect(createResponse.mock.calls[0][0].input).toMatchInlineSnapshot(`
      "你负责把同一母题下的正与反整理成一个更高阶的合。

      只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。

      schema={"synthesis":{"text":"","summary":"","label":"","stance":"合"}}

      正:
      text=继续
      summary=继续推进
      label=继续

      反:
      text=暂停
      summary=暂停重构
      label=暂停

      历史上下文:
      user: 母题：要不要继续
      assistant: 继续：继续推进；暂停：暂停重构"
    `);
    expect(createResponse.mock.calls[0][0].input).not.toContain("route must not read synthesis graph payload");
  });

  it("returns 502 when synthesis payload shape is malformed", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "正" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-5",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-5",
      error: "invalid_model_output"
    });
  });

  it("returns 502 for chat provider-format failures", async () => {
    createResponse.mockResolvedValue({
      output: [{ content: [] }]
    });

    const response = await chatPost(
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "你好" }]
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_model_output"
    });
  });
});
