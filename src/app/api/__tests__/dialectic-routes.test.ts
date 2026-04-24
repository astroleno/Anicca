import { NextRequest } from "next/server";
import { POST as branchesPost } from "@/app/api/branches/route";
import { POST as chatPost } from "@/app/api/chat/route";
import { POST as synthesisPost } from "@/app/api/synthesis/route";

const { createResponse } = vi.hoisted(() => ({
  createResponse: vi.fn()
}));

vi.mock("@/lib/openai/client", () => ({
  getDefaultModel: (model?: string) => model || "gpt-4o-mini",
  openai: {
    responses: {
      create: createResponse
    }
  }
}));

describe("dialectic routes", () => {
  beforeEach(() => {
    createResponse.mockReset();
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
          contextMessages: [{ role: "user", content: "旧入口已经漂移" }]
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
    expect(createResponse.mock.calls[0][0].input).toContain("旧入口已经漂移");
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
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-4",
      synthesis: { text: "重开主线", summary: "主线重开", label: "重开", stance: "合" }
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
});
