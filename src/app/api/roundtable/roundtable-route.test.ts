import { NextRequest } from "next/server";
import { POST as roundtablePost } from "@/app/api/roundtable/route";

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

describe("roundtable route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    createResponse.mockReset();
    createChatCompletion.mockReset();
  });

  it("starts a structured roundtable with participants and a first round", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        participants: [
          {
            name: "汉娜·阿伦特",
            mbti: "INTJ",
            stance: "创造力首先是公共世界中的新开端。",
            reason: "她能从行动与公共性切入创造问题。"
          },
          {
            name: "赫伯特·西蒙",
            mbti: "INTP",
            stance: "创造力可以被看作搜索与组合过程。",
            reason: "他代表认知科学和人工智能传统。"
          }
        ],
        round: {
          guidingQuestion: "我们应当如何定义 AI 的创造力？",
          utterances: [
            {
              speaker: "汉娜·阿伦特",
              action: "陈述",
              text: "如果没有新开端，只是重排材料，就不应轻易称作创造。",
              summary: "创造要求真正的新开端。"
            },
            {
              speaker: "赫伯特·西蒙",
              action: "质疑",
              text: "人类创造也大量依赖重组，关键在搜索空间和评价函数。",
              summary: "重组不自动排除创造。"
            }
          ],
          coreTension: "新开端与组合搜索的冲突",
          framework: "newness <-> search",
          nextQuestion: "创造力是否必须包含主体意图？"
        },
        status: "active"
      })
    });

    const response = await roundtablePost(
      new NextRequest("http://localhost/api/roundtable", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-rt-1",
          command: "start",
          topic: "AI 是否拥有真正的创造力？"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-rt-1",
      round: {
        coreTension: "新开端与组合搜索的冲突"
      },
      state: {
        topic: "AI 是否拥有真正的创造力？",
        currentQuestion: "创造力是否必须包含主体意图？",
        status: "active"
      }
    });
    expect(createResponse.mock.calls[0][0].input).toContain("李继刚");
    expect(createResponse.mock.calls[0][0].input).toContain("不得把圆桌输出写成 canonical 正 / 反 / 合");
  });

  it("uses chat completions for roundtable gemini models", async () => {
    createChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              participants: [
                {
                  name: "赫伯特·西蒙",
                  mbti: "INTP",
                  stance: "创造力可以被看作搜索与组合过程。",
                  reason: "他代表认知科学和人工智能传统。"
                }
              ],
              round: {
                guidingQuestion: "我们应当如何定义 AI 的创造力？",
                utterances: [
                  {
                    speaker: "赫伯特·西蒙",
                    action: "陈述",
                    text: "创造可以先被视为在问题空间内生成可评价的新组合。",
                    summary: "创造是可评价的新组合。"
                  }
                ],
                coreTension: "组合搜索与主体意图的冲突",
                framework: "search -> novelty -> judgment",
                nextQuestion: "没有主体意图的组合是否足够构成创造？"
              },
              status: "active"
            })
          }
        }
      ]
    });

    const response = await roundtablePost(
      new NextRequest("http://localhost/api/roundtable", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-rt-gemini",
          command: "start",
          topic: "AI 是否拥有真正的创造力？",
          model: "gemini-3.1-flash-lite-preview"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-rt-gemini",
      state: {
        currentQuestion: "没有主体意图的组合是否足够构成创造？",
        status: "active"
      }
    });
    expect(createResponse).not.toHaveBeenCalled();
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("concludes a roundtable with a knowledge network", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        participants: [
          {
            name: "汉娜·阿伦特",
            mbti: "INTJ",
            stance: "创造力首先是公共世界中的新开端。",
            reason: "她能从行动与公共性切入创造问题。"
          }
        ],
        conclusion: "讨论显示，AI 创造力的争议不在产物新颖性，而在主体、意图和世界承诺。",
        knowledgeNetwork: "AI creativity -> novelty -> intent",
        openQuestions: ["没有主体的创造是否只是拟制？"],
        status: "concluded"
      })
    });

    const response = await roundtablePost(
      new NextRequest("http://localhost/api/roundtable", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-rt-2",
          command: "conclude",
          state: {
            topic: "AI 是否拥有真正的创造力？",
            participants: [
              {
                name: "汉娜·阿伦特",
                mbti: "INTJ",
                stance: "创造力首先是公共世界中的新开端。",
                reason: "她能从行动与公共性切入创造问题。"
              }
            ],
            rounds: [],
            currentQuestion: "创造力是否必须包含主体意图？",
            nextQuestion: "创造力是否必须包含主体意图？",
            lastCoreTension: "新开端与组合搜索的冲突",
            status: "active"
          }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-rt-2",
      state: {
        status: "concluded",
        conclusion: "讨论显示，AI 创造力的争议不在产物新颖性，而在主体、意图和世界承诺。",
        knowledgeNetwork: "AI creativity -> novelty -> intent",
        openQuestions: ["没有主体的创造是否只是拟制？"]
      }
    });
  });

  it("returns a caller error with the requestId when the topic is missing", async () => {
    const response = await roundtablePost(
      new NextRequest("http://localhost/api/roundtable", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-rt-missing-topic",
          command: "start"
        })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-rt-missing-topic",
      error: "topic required"
    });
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("returns invalid_model_output with the requestId for malformed provider output", async () => {
    createResponse.mockResolvedValue({ output_text: "not-json" });

    const response = await roundtablePost(
      new NextRequest("http://localhost/api/roundtable", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-rt-invalid-output",
          command: "start",
          topic: "AI 是否拥有真正的创造力？"
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-rt-invalid-output",
      error: "invalid_model_output",
      details: "expected roundtable JSON object"
    });
  });

  it("uses the shared provider status when the roundtable provider is overloaded", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createResponse.mockRejectedValue(
      Object.assign(new Error("429 当前分组上游负载已饱和，请稍后再试"), { status: 429 })
    );

    const response = await roundtablePost(
      new NextRequest("http://localhost/api/roundtable", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-rt-overloaded",
          command: "start",
          topic: "AI 是否拥有真正的创造力？"
        })
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-rt-overloaded",
      error: "roundtable_failed",
      details: "provider_overloaded"
    });
  });
});
