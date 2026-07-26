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
    vi.unstubAllEnvs();
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

      summary 必须是单行摘要，label 必须是 8 个字符以内的中文短标签；不要在 label 中写解释、冒号、下划线或长短语。

      历史上下文:
      system: 父链系统上下文
      user: 上一轮问题
      assistant: 继续：继续推进；暂停：暂停重构

      当前用户输入:
      要不要继续"
    `);
    expect(createResponse.mock.calls[0][0].input).not.toContain("route must not read graph payload");
  });

  it("normalizes branch labels and summaries for compact UI nodes", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "继续", summary: "继续推进\n但保留回退", label: "支持：跨设备同步", stance: "正" },
        antithesis: { text: "暂停", summary: "暂停重构", label: "受控分享更安全合规", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-compact-branches",
          userText: "要不要继续"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-compact-branches",
      thesis: { text: "继续", summary: "继续推进 但保留回退", label: "支持", stance: "正" },
      antithesis: { text: "暂停", summary: "暂停重构", label: "受控分享更安全合", stance: "反" }
    });
  });

  it("falls back pure ascii branch labels to stance labels", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "继续", summary: "继续推进", label: "fold_need", stance: "正" },
        antithesis: { text: "暂停", summary: "暂停重构", label: "fold_not", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-ascii-branches",
          userText: "要不要折叠"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      thesis: { label: "正向", stance: "正" },
      antithesis: { label: "反向", stance: "反" }
    });
  });

  it("strips redundant branch stance suffixes from labels", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "继续", summary: "继续推进", label: "存储选型正", stance: "正" },
        antithesis: { text: "暂停", summary: "暂停重构", label: "存储选型反", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-redundant-branch-suffix",
          userText: "要不要继续"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      thesis: { label: "存储选型", stance: "正" },
      antithesis: { label: "存储选型", stance: "反" }
    });
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

  it("returns 503 when the branches provider is overloaded", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createResponse.mockRejectedValue(
      Object.assign(new Error("429 当前分组上游负载已饱和，请稍后再试"), { status: 429 })
    );

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-overloaded",
          userText: "要不要继续"
        })
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-overloaded",
      error: "branches_failed",
      details: "provider_overloaded"
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

      summary 必须是单行摘要，label 必须是 8 个字符以内的中文短标签；不要在 label 中写解释、冒号、下划线或长短语。

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

  it("normalizes synthesis labels and summaries for compact UI nodes", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: {
          text: "重开主线",
          summary: "主线重开\n先做小步",
          label: "折中合：可选账号同步（隐私可控）",
          stance: "合"
        }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-compact-synthesis",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-compact-synthesis",
      synthesis: { text: "重开主线", summary: "主线重开 先做小步", label: "折中", stance: "合" }
    });
  });

  it("falls back pure ascii synthesis labels to a compact Chinese label", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: "重开主线", summary: "主线重开", label: "fold_adapt", stance: "合" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-ascii-synthesis",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synthesis: { label: "合流", stance: "合" }
    });
  });

  it("accepts synthesis stance at the top level when the nested branch omits it", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: "重开主线", summary: "主线重开", label: "重开" },
        stance: "合"
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-top-level-synthesis-stance",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "合" }
    });
  });

  it("accepts synthesis payloads that omit stance because the route implies 合", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: "重开主线", summary: "主线重开", label: "重开" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-missing-synthesis-stance",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "合" }
    });
  });

  it("strips redundant synthesis stance suffix but keeps protected words like 结合", async () => {
    createResponse.mockResolvedValueOnce({
      output_text: JSON.stringify({
        synthesis: { text: "重开主线", summary: "主线重开", label: "佛教框架合", stance: "合" }
      })
    });

    const firstResponse = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-redundant-synthesis-suffix",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      synthesis: { label: "佛教框架", stance: "合" }
    });

    createResponse.mockResolvedValueOnce({
      output_text: JSON.stringify({
        synthesis: { text: "重开主线", summary: "主线重开", label: "删归结合", stance: "合" }
      })
    });

    const secondResponse = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-protected-synthesis-suffix",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      synthesis: { label: "删归结合", stance: "合" }
    });
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

  it("returns 429 when the chat provider is rate limited", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createResponse.mockRejectedValue(Object.assign(new Error("Rate limit exceeded"), { status: 429 }));

    const response = await chatPost(
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "你好" }]
        })
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "chat_failed",
      details: "provider_rate_limited"
    });
  });
});
