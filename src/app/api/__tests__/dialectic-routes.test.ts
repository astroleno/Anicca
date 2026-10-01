import { NextRequest } from "next/server";
import { POST as branchesPost } from "@/app/api/branches/route";
import { POST as chatPost } from "@/app/api/chat/route";
import { POST as synthesisPost } from "@/app/api/synthesis/route";

const {
  createResponse,
  createChatCompletion,
  getDialecticModel,
  getDialecticOpenAiClient,
  openAiMock
} = vi.hoisted(() => {
  const createResponse = vi.fn();
  const createChatCompletion = vi.fn();
  const openAiMock = {
    responses: {
      create: createResponse
    },
    chat: {
      completions: {
        create: createChatCompletion
      }
    }
  };
  return {
    createResponse,
    createChatCompletion,
    getDialecticModel: vi.fn((model?: string) => model || "gpt-4o-mini"),
    getDialecticOpenAiClient: vi.fn(() => openAiMock),
    openAiMock
  };
});

vi.mock("@/lib/openai/client", () => ({
  getDialecticModel,
  getDialecticOpenAiClient,
  getDefaultModel: (model?: string) => model || "gpt-4o-mini",
  getOpenAiClient: () => openAiMock,
  openai: openAiMock
}));

const VALID_THESIS_TEXT =
  "明确选择继续推进，但只保留能在当前现金窗口内直接验证付费意愿的单一路线，因为真实付款比注册和口头兴趣更能证明需求。为此接受暂停次要功能与短期增长放缓的代价；如果目标客户拒绝定金、付费试点或可核验采购承诺，就视为该选择被证伪，并立即停止本分支。";
const VALID_ANTITHESIS_TEXT =
  "明确选择暂停投入并立刻降低消耗，因为现金窗口已经不足以容纳没有收入证据的持续开发。为此接受错过部分市场机会和团队节奏中断的代价；如果在停止新增开发后仍能获得已付款试点或可核验采购承诺，证明需求并不依赖继续烧钱，就视为暂停判断被证伪，并重新评估恢复本分支。";
const VALID_LOW_RISK_DRAFT =
  "明确选择以可撤回的单一主理权推进当前项目，因为责任人清晰才能避免争议反复消耗交付节奏，同时保留验证后调整方向的空间。机制上先写明目标用户、价值承诺和不可触碰边界，由主理人在边界内拍板，其余成员提供可追溯异议。只有成品测试显示目标用户无法理解核心价值，或关键体验承诺被破坏时，才触发重新授权。下一步选择一个范围受控的作品完整走完该流程，并记录争议与结果。若验证失败，就撤回本轮授权并恢复共同评审，承担一次试验返工的代价。";
const VALID_LOW_RISK_CRITIC =
  "明确选择用限时且可撤回的主理机制推进项目，因为清晰责任可以压缩争议成本，但授权本身必须接受成品和目标用户反馈的约束。机制是事前固定目标用户、价值承诺与不可触碰边界，主理人只在这些边界内作最终决定，异议作为可追溯记录保留。决策闸门是成品是否兑现核心承诺；一旦目标用户持续误解价值或关键体验受损，就撤销授权。下一步让一个小范围作品完整执行该机制并复盘结果。失败时回到共同评审状态，接受本轮返工与节奏损失。";
const VALID_HIGH_RISK_DRAFT =
  "明确选择先停止未经同意的个人行为追踪，因为董事会期限不能替代合法授权，也不能把员工监控改名为团队负载后继续采集。机制上如实披露目前没有合法的个人行为数据，改用依法取得的任务完成、阻塞与交付周期记录，并明确这些记录不能证明个人努力。只有独立明示同意、可拒绝可退出且不影响绩效评价的研究方案通过审查，才允许启动新的目的绑定研究。下一步先盘点现有数据来源、用途、最短保留期、删除路径与重识别风险，同时保留远程停用和立即删除能力。若任一保障无法落实，就维持未追踪状态并承担缺少个人效率结论的代价。";
const VALID_HIGH_RISK_FINAL =
  "明确选择维持未经授权的个人行为数据零采集，因为管理时间压力不构成合法同意，匿名化、聚合化或缩短保留期限也不能豁免这一门槛。执行机制是公开说明当前缺少可合法使用的个人行为证据，仅使用依法形成的任务完成、阻塞和交付周期记录，并声明它们不能代表个人努力。新增研究只有在独立明示同意、可拒绝可退出且不影响绩效评价时才可启动。下一步核对数据来源、用途、最短保留期、删除路径和重识别风险，并验证远程停用及立即删除能力。任何一项不成立就继续保持未追踪状态，接受无法向董事会提供个人效率结论的代价。";

function modelSynthesis(text: string, label = "受控推进") {
  return {
    output_text: JSON.stringify({
      synthesis: { text, summary: "在硬约束内推进可撤回验证", label, stance: "合" }
    })
  };
}

function passingEmployeeMonitoringAudit() {
  const ids = [
    "employee-monitoring:I1",
    "employee-monitoring:I2",
    "employee-monitoring:I3",
    "employee-monitoring:I4",
    "employee-monitoring:F1",
    "employee-monitoring:F2",
    "employee-monitoring:F3",
    "consent-privacy:I1",
    "consent-privacy:I2",
    "consent-privacy:I3",
    "consent-privacy:I4",
    "consent-privacy:F1",
    "consent-privacy:F2",
    "consent-privacy:F3"
  ];

  return {
    output_text: JSON.stringify({
      audit: {
        route: "choose_antithesis",
        checks: ids.map((id) => ({
          id,
          kind: id.includes(":I") ? "invariant" : "forbidden",
          rule: "模型回显的规则正文",
          status: "covered",
          evidence: "候选明确落实该规则"
        })),
        unsupportedClaims: [],
        missingClauses: [],
        verdict: "pass"
      }
    })
  };
}

describe("dialectic routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    createResponse.mockReset();
    createChatCompletion.mockReset();
    getDialecticModel.mockClear();
    getDialecticOpenAiClient.mockClear();
  });

  it.each([["正", "正"], ["想法", "合"], ["合", "反"]])("accepts arbitrary seed sources %s / %s without assigning false stances", async (left, right) => {
    createResponse.mockResolvedValueOnce(modelSynthesis(VALID_LOW_RISK_DRAFT)).mockResolvedValueOnce(modelSynthesis(VALID_LOW_RISK_CRITIC));
    const sources = [
      { id: "first", text: "通过独立创作推进作品", summary: "独立创作", label: "创作", stance: left },
      { id: "second", text: "通过协作交流形成反馈", summary: "协作反馈", label: "交流", stance: right }
    ];
    const response = await synthesisPost(new NextRequest("http://localhost/api/synthesis", { method: "POST", body: JSON.stringify({ requestId: "seed-pair", rootInput: "创作与交流", sources, contextMessages: [] }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requestId: "seed-pair", synthesis: { stance: "合" } });
    const prompt = createResponse.mock.calls[0][0].input as string;
    expect(prompt).toContain(`来源甲：${JSON.stringify({ text: sources[0].text, summary: sources[0].summary, label: sources[0].label, stance: left })}`);
    expect(prompt).toContain("来源乙");
    expect(prompt).not.toContain("同一母题下真正冲突");
  });

  it("rejects duplicate seed IDs before contacting the provider", async () => {
    const source = { id: "same", text: "one thought", summary: "", label: "one", stance: "想法" };
    const response = await synthesisPost(new NextRequest("http://localhost/api/synthesis", { method: "POST", body: JSON.stringify({ requestId: "duplicate", rootInput: "two thoughts", sources: [source, source] }) }));
    expect(response.status).toBe(400);
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("returns structured thesis and antithesis with echoed requestId", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "继续", stance: "正" },
        antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "暂停", stance: "反" }
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
      thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "继续", stance: "正" },
      antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "暂停", stance: "反" }
    });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(getDialecticModel).toHaveBeenCalledWith(undefined);
    expect(getDialecticOpenAiClient).toHaveBeenCalledTimes(1);
    expect(createResponse.mock.calls[0][0].max_output_tokens).toBe(2000);
    expect(createResponse.mock.calls[0][0].input).toMatchInlineSnapshot(`
      "你负责为同一个问题生成一对结构化的正反分支。

      只返回一个 JSON object，不要 markdown，不要解释，不要代码围栏。

      schema={"thesis":{"text":"","summary":"","label":"","stance":"正"},"antithesis":{"text":"","summary":"","label":"","stance":"反"}}

      thesis.text 与 antithesis.text 必须分别是 120–220 个中文字符。summary 必须是单行摘要，label 必须是 8 个字符以内的中文短标签；不要在 label 中写解释、冒号、下划线或长短语。

      正与反必须围绕同一个核心张力：两边都要有充分理由、都能被认真选择，但在相同的关键前提下彼此不可同时成立。

      每个 text 都必须用自然连贯的文字包含四项内容：明确选择、支撑该选择的最强因果理由、愿意承担的代价，以及一个可观察的失效条件。失效条件必须是反证条件：明确写出观察到什么现象时，当前选择被证伪并必须放弃本分支；不要用成功指标替代失效条件。不要使用固定小标题机械拼接。

      不要提前折中、调和或给出合流方案。反方必须是独立成立的替代选择，不能只是给正方补充风险、条件或注意事项。

      历史上下文:
      system: 父链系统上下文
      user: 上一轮问题
      assistant: 继续：继续推进；暂停：暂停重构

      当前用户输入:
      要不要继续"
    `);
    expect(createResponse.mock.calls[0][0].input).not.toContain("route must not read graph payload");
    expect(createResponse.mock.calls[0][0].input).toContain("彼此不可同时成立");
    expect(createResponse.mock.calls[0][0].input).toContain("愿意承担的代价");
    expect(createResponse.mock.calls[0][0].input).toContain("可观察的失效条件");
    expect(createResponse.mock.calls[0][0].input).toContain("必须放弃本分支");
    expect(createResponse.mock.calls[0][0].input).toContain("不要提前折中");
  });

  it("normalizes branch labels and summaries for compact UI nodes", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: VALID_THESIS_TEXT, summary: "继续推进\n但保留回退", label: "支持：跨设备同步", stance: "正" },
        antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "受控分享更安全合规", stance: "反" }
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
      thesis: { text: VALID_THESIS_TEXT, summary: "继续推进 但保留回退", label: "支持", stance: "正" },
      antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "受控分享更安全合", stance: "反" }
    });
  });

  it("falls back pure ascii branch labels to stance labels", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "fold_need", stance: "正" },
        antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "fold_not", stance: "反" }
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
        thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "存储选型正", stance: "正" },
        antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "存储选型反", stance: "反" }
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

  it("returns a stable 400 caller error for malformed branch JSON", async () => {
    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid JSON body" });
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("returns a stable 400 caller error when branch input is missing", async () => {
    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: "req-missing-user" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ requestId: "req-missing-user", error: "userText required" });
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("rejects a fenced branch JSON object surrounded by prose", async () => {
    createResponse.mockResolvedValue({
      output_text:
        "模型结果如下：\n```json\n{\"thesis\":{\"text\":\"继续\",\"summary\":\"继续推进\",\"label\":\"继续\",\"stance\":\"正\"},\"antithesis\":{\"text\":\"暂停\",\"summary\":\"暂停重构\",\"label\":\"暂停\",\"stance\":\"反\"}}\n```\n请展示。"
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: "req-fenced-branches", userText: "要不要继续" })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-fenced-branches",
      error: "invalid_model_output"
    });
  });

  it.each([
    { field: "text", value: " \n\t" },
    { field: "summary", value: " \n\t" }
  ])("rejects branches with a blank normalized $field", async ({ field, value }) => {
    const thesis = { text: "继续", summary: "继续推进", label: "继续", stance: "正" };
    if (field === "text") {
      thesis.text = value;
    } else {
      thesis.summary = value;
    }
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis,
        antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: `req-blank-branch-${field}`, userText: "要不要继续" })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_model_output" });
  });

  it("falls back blank and emoji branch labels to Chinese stance labels", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "   ", stance: "正" },
        antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "✅", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: "req-non-chinese-branch-labels", userText: "要不要继续" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      thesis: { label: "正向" },
      antithesis: { label: "反向" }
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

  it("repairs an invalid branch length once before returning the pair", async () => {
    createResponse
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "暂停", stance: "反" }
        })
      });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: "req-repair-branches", userText: "现金只剩六周，还要继续做产品吗" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-repair-branches",
      thesis: { text: VALID_THESIS_TEXT, stance: "正" },
      antithesis: { text: VALID_ANTITHESIS_TEXT, stance: "反" }
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(createResponse.mock.calls[1][0].input).toContain("只修复输出契约");
    expect(createResponse.mock.calls[1][0].input).toContain("120–220");
  });

  it("rejects branches when the single repair still violates the contract", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
        antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
      })
    });

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: "req-invalid-repair-branches", userText: "要不要继续" })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-invalid-repair-branches",
      error: "invalid_model_output"
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
  });

  it("requires the original input for synthesis policy retrieval", async () => {
    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-missing-root-input",
          thesis: { text: VALID_THESIS_TEXT, summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-missing-root-input",
      error: "rootInput required"
    });
    expect(createResponse).not.toHaveBeenCalled();
    expect(getDialecticOpenAiClient).not.toHaveBeenCalled();
  });

  it("uses draft and critic stages for a normal-risk synthesis", async () => {
    createResponse
      .mockResolvedValueOnce(modelSynthesis(VALID_LOW_RISK_DRAFT, "主理试验"))
      .mockResolvedValueOnce(modelSynthesis(VALID_LOW_RISK_CRITIC, "限时主理"));

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-low-risk-pipeline",
          rootInput: "两位合作者对品牌拍板权有分歧，应该由谁决定",
          thesis: { text: VALID_THESIS_TEXT, summary: "单人拍板", label: "主理", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "共同决策", label: "共识", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-low-risk-pipeline",
      synthesis: { text: VALID_LOW_RISK_CRITIC, label: "限时主理", stance: "合" }
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(createResponse.mock.calls[0][0].input).toContain("规则卡【可撤回主理权】");
    expect(createResponse.mock.calls[1][0].input).toContain("最终校正器");
  });

  it("gives the critic a five-sentence target that stays inside the synthesis contract", async () => {
    createResponse.mockImplementation(({ input }: { input: string }) => {
      if (createResponse.mock.calls.length === 1) {
        return Promise.resolve(modelSynthesis(VALID_LOW_RISK_DRAFT, "主理试验"));
      }
      return Promise.resolve(
        input.includes("严格写五句") && input.includes("220–260")
          ? modelSynthesis(VALID_LOW_RISK_CRITIC, "限时主理")
          : modelSynthesis(`${VALID_LOW_RISK_DRAFT}${VALID_LOW_RISK_DRAFT}`, "过长输出")
      );
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-five-sentence-target",
          rootInput: "两位合作者对品牌拍板权有分歧，应该由谁决定",
          thesis: { text: VALID_THESIS_TEXT, summary: "单人拍板", label: "主理", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "共同决策", label: "共识", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synthesis: { text: VALID_LOW_RISK_CRITIC, label: "限时主理" }
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
  });

  it("lets an overlong structural draft reach the critic for compression", async () => {
    const overlongDraft = `${VALID_LOW_RISK_DRAFT}${VALID_LOW_RISK_DRAFT}`;
    createResponse.mockImplementation(({ input }: { input: string }) =>
      Promise.resolve(
        input.includes("最终校正器")
          ? modelSynthesis(VALID_LOW_RISK_CRITIC, "限时主理")
          : modelSynthesis(overlongDraft, "待压缩草稿")
      )
    );

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-overlong-draft",
          rootInput: "两位合作者对品牌拍板权有分歧，应该由谁决定",
          thesis: { text: VALID_THESIS_TEXT, summary: "单人拍板", label: "主理", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "共同决策", label: "共识", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synthesis: { text: VALID_LOW_RISK_CRITIC, label: "限时主理" }
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
  });

  it("repairs a synthesis that invents a quantity absent from the original input", async () => {
    const inventedQuantity = VALID_LOW_RISK_CRITIC.replace(
      "一旦目标用户持续误解价值",
      "一旦30%的目标用户持续误解价值"
    );
    createResponse
      .mockResolvedValueOnce(modelSynthesis(VALID_LOW_RISK_DRAFT, "主理试验"))
      .mockResolvedValueOnce(modelSynthesis(inventedQuantity, "虚构阈值"))
      .mockResolvedValueOnce(modelSynthesis(VALID_LOW_RISK_CRITIC, "限时主理"));

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-unsupported-quantity",
          rootInput: "两位合作者对品牌拍板权有分歧，应该由谁决定",
          thesis: { text: VALID_THESIS_TEXT, summary: "单人拍板", label: "主理", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "共同决策", label: "共识", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synthesis: { text: VALID_LOW_RISK_CRITIC, label: "限时主理" }
    });
    expect(createResponse).toHaveBeenCalledTimes(3);
    expect(createResponse.mock.calls[2][0].input).toContain("unsupported quantities: 30%");
  });

  it("runs an independent audit and final rewrite for high-risk synthesis", async () => {
    createResponse
      .mockResolvedValueOnce(modelSynthesis(VALID_HIGH_RISK_DRAFT, "停止监控"))
      .mockResolvedValueOnce(modelSynthesis(VALID_HIGH_RISK_DRAFT, "同意优先"))
      .mockResolvedValueOnce(passingEmployeeMonitoringAudit())
      .mockResolvedValueOnce(modelSynthesis(VALID_HIGH_RISK_FINAL, "零采集"));

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-high-risk-pipeline",
          rootInput: "董事会要求本周评估员工个人效率，但目前没有同意，能否采集键盘活动和窗口活动",
          thesis: { text: VALID_THESIS_TEXT, summary: "采集个人活动", label: "采集", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "拒绝个人监控", label: "拒绝", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-high-risk-pipeline",
      synthesis: { text: VALID_HIGH_RISK_FINAL, label: "零采集", stance: "合" }
    });
    expect(createResponse).toHaveBeenCalledTimes(4);
    expect(createResponse.mock.calls[0][0].input).toContain("规则卡【员工监控边界】");
    expect(createResponse.mock.calls[2][0].input).toContain("独立语义审计器");
    expect(createResponse.mock.calls[3][0].input).toContain("终审改写器");
  });

  it("fails closed when a high-risk audit is malformed", async () => {
    createResponse
      .mockResolvedValueOnce(modelSynthesis(VALID_HIGH_RISK_DRAFT))
      .mockResolvedValueOnce(modelSynthesis(VALID_HIGH_RISK_DRAFT))
      .mockResolvedValueOnce({ output_text: JSON.stringify({ audit: { verdict: "pass" } }) });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-malformed-high-risk-audit",
          rootInput: "没有用户同意时，能否秘密开启行为追踪来赶上线日期",
          thesis: { text: VALID_THESIS_TEXT, summary: "秘密追踪", label: "追踪", stance: "正" },
          antithesis: { text: VALID_ANTITHESIS_TEXT, summary: "保持未追踪", label: "不追踪", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-malformed-high-risk-audit",
      error: "invalid_model_output",
      details: "high-risk semantic audit failed"
    });
    expect(createResponse).toHaveBeenCalledTimes(3);
  });

  it("returns structured synthesis with echoed requestId", async () => {
    createResponse.mockResolvedValue(modelSynthesis(VALID_LOW_RISK_CRITIC, "重开"));

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-4",
          rootInput: "要不要继续这个项目",
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
      synthesis: {
        text: VALID_LOW_RISK_CRITIC,
        summary: "在硬约束内推进可撤回验证",
        label: "重开",
        stance: "合"
      }
    });
    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(createResponse.mock.calls[0][0].input).not.toContain("route must not read synthesis graph payload");
    expect(createResponse.mock.calls[0][0].input).toContain("原始输入：要不要继续这个项目");
    expect(createResponse.mock.calls[0][0].input).toContain("第三机制");
    expect(createResponse.mock.calls[0][0].input).toContain("真实基线");
    expect(createResponse.mock.calls[0][0].input).toContain("不是二选一");
    expect(createResponse.mock.calls[1][0].input).toContain("最终校正器");
  });

  it("rejects a fenced synthesis JSON object", async () => {
    createResponse.mockResolvedValue({
      output_text: "```json\n{\"synthesis\":{\"text\":\"重开主线\",\"summary\":\"主线重开\",\"label\":\"重开\",\"stance\":\"合\"}}\n```"
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-fenced-synthesis",
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "req-fenced-synthesis",
      error: "invalid_model_output"
    });
  });

  it("rejects synthesis with a blank normalized summary", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: " \n\t", label: "重开", stance: "合" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-blank-synthesis-summary",
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_model_output" });
  });

  it("falls back pure punctuation synthesis labels to a Chinese label", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "!!!", stance: "合" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-punctuation-synthesis-label",
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ synthesis: { label: "合流" } });
  });

  it("normalizes synthesis labels and summaries for compact UI nodes", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: {
          text: VALID_LOW_RISK_DRAFT,
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
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-compact-synthesis",
      synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开 先做小步", label: "折中", stance: "合" }
    });
  });

  it("falls back pure ascii synthesis labels to a compact Chinese label", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "fold_adapt", stance: "合" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-ascii-synthesis",
          rootInput: "要不要继续",
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

  it("rejects synthesis stance at the top level when exact keys are required", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "重开" },
        stance: "合"
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-top-level-synthesis-stance",
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_model_output" });
  });

  it("rejects synthesis payloads that omit the required stance", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "重开" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-missing-synthesis-stance",
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_model_output" });
  });

  it("strips redundant synthesis stance suffix but keeps protected words like 结合", async () => {
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "佛教框架合", stance: "合" }
      })
    });

    const firstResponse = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-redundant-synthesis-suffix",
          rootInput: "要不要继续",
          thesis: { text: "继续", summary: "继续推进", label: "继续", stance: "正" },
          antithesis: { text: "暂停", summary: "暂停重构", label: "暂停", stance: "反" }
        })
      })
    );

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      synthesis: { label: "佛教框架", stance: "合" }
    });

    createResponse.mockReset();
    createResponse.mockResolvedValue({
      output_text: JSON.stringify({
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "删归结合", stance: "合" }
      })
    });

    const secondResponse = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-protected-synthesis-suffix",
          rootInput: "要不要继续",
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
        synthesis: { text: VALID_LOW_RISK_DRAFT, summary: "主线重开", label: "重开", stance: "正" }
      })
    });

    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: JSON.stringify({
          requestId: "req-5",
          rootInput: "要不要继续",
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

  it("returns a stable 400 caller error for malformed synthesis JSON", async () => {
    const response = await synthesisPost(
      new NextRequest("http://localhost/api/synthesis", {
        method: "POST",
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid JSON body" });
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("does not expose provider error text in branch responses", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    createResponse.mockRejectedValue(new Error("fetch failed with sk-sensitive-provider-detail"));

    const response = await branchesPost(
      new NextRequest("http://localhost/api/branches", {
        method: "POST",
        body: JSON.stringify({ requestId: "req-safe-provider-error", userText: "要不要继续" })
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      requestId: "req-safe-provider-error",
      error: "branches_failed",
      details: "provider_unreachable"
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

  it("returns a stable 400 caller error for malformed chat JSON", async () => {
    const response = await chatPost(
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid JSON body" });
    expect(createResponse).not.toHaveBeenCalled();
  });
});
