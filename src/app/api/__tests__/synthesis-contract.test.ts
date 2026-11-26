import { NextRequest } from "next/server";
import { POST } from "@/app/api/synthesis/route";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import { getDialecticRuleChecks, retrieveDialecticPolicyCards } from "@/features/dialectic/server/policyCards";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai/generateText", () => ({ generateText: generate }));
vi.mock("@/lib/openai/client", () => ({
  getDialecticModel: () => "test-model",
  getDialecticOpenAiClient: () => ({})
}));

const emit = (value: unknown) => ({ text: JSON.stringify(value) });
const endpoint = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/synthesis", {
  method: "POST", body: JSON.stringify({ requestId: "contract-test", meaningVersion: 1, ...body })
});

const sourceA = { id: "a", text: "新增试用者接近未来的购买者时，观察哪些使用行为会重复出现，再决定什么值得收费。", summary: "看重复使用", label: "试用观察", stance: "正" };
const sourceB = { id: "b", text: "尽快看到预算与购买承诺。免费用户更活跃也未必愿意付费，团队该转向付费客户访谈和销售。", summary: "查预算及承诺", label: "付费证据", stance: "反" };
const rootInput = "团队只剩六周现金流且还没有稳定转化，应该继续扩大免费试用，还是转向付费客户访谈和销售？";
const shortText = "六周现金把“先扩大免费试用再观察”改造成一个有明确截止的筛选：试用若确实接近未来购买者，且重复行为能在窗口内转成可问价的依据，就只该小范围扩，用来带着具体行为去核预算与承诺，而不替销售验证。若这两项前提不成立或时间不够，精力就应主要转向付费客户，并接受免费活跃可能换不来收入。";
const addition = "例如试用中的常用操作若只出现在没有采购权限的人身上，重复仍可提示哪里有使用价值，却不能作为继续争取更多免费用户的依据。继续投入的门槛是能把这类行为和有预算的买家联系起来，亲自核实他们是否愿意为对应需求付费。";
const synthesis = { text: shortText, summary: "把试用行为变成核实付费的材料。", label: "付费线索", stance: "合", change: "重复使用只提供核价线索，不能代替预算和购买承诺。" };
const checks = () => {
  const line = String(vi.mocked(console.info).mock.calls[0][0]);
  return JSON.parse(line.slice("anicca.generation ".length));
};

function review(sourceA: string, sourceB: string, useA: string, useB: string, consequence: string) {
  return emit({ synthesis: {
    label: "成立条件", change: null, hypothesesSafe: true, issues: [], personalEvidence: [], novelty: { status: "unchecked" },
    prose: { pass: true, issues: [], evidence: { sourceA, sourceB, useA, useB, consequence } }
  } });
}

beforeEach(() => { generate.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it("repairs short critic and final outputs once each and independently reviews the complete text at both stages", async () => {
  const applicability = [{ id: "survival-cash", object: "现金流期限内的试用与销售", action: "选择试用或付费访谈", evidence: "团队只剩六周现金流且还没有稳定转化" }];
  const cards = retrieveDialecticPolicyCards([rootInput]).filter(card => card.id === "survival-cash");
  const highRiskAudit = { route: "third_mechanism", checks: getDialecticRuleChecks(cards).map(({ id }) => ({ id, status: "covered", evidence: "原稿留下约束和核验条件" })), unsupportedClaims: [], missingClauses: [], verdict: "pass" };
  const proseAudit = review("新增试用者接近未来的购买者", "尽快看到预算与购买承诺", "试用若确实接近未来购买者", "用来带着具体行为去核预算与承诺", "不能作为继续争取更多免费用户的依据");
  const spatial = { synthesis: { horizon: .71 } };
  generate.mockResolvedValueOnce(emit({ synthesis, applicablePolicyCards: applicability }))
    .mockResolvedValueOnce(emit({ synthesis, spatial })).mockResolvedValueOnce(emit({ addition })).mockResolvedValueOnce(proseAudit)
    .mockResolvedValueOnce(emit({ audit: highRiskAudit }))
    .mockResolvedValueOnce(emit({ synthesis, spatial })).mockResolvedValueOnce(emit({ addition })).mockResolvedValueOnce(proseAudit);

  const perspective = defaultThinkingSpace();
  const response = await POST(endpoint({ rootInput, sources: [sourceA, sourceB], perspective }));
  expect(response.status).toBe(200);
  const { synthesis: result } = await response.json();
  expect(result.text).toBe(shortText + addition);
  expect(result.perspective.axes.find((axis: { id: string }) => axis.id === "horizon")?.value).toBe(.71);
  expect(generate).toHaveBeenCalledTimes(8);
  const prompts: string[] = generate.mock.calls.map(([option]) => option.input);
  expect(prompts[2]).toContain('只返回 {"addition":"追加段落"}');
  expect(prompts[2]).toContain("至少 42 个字符");
  expect(prompts[2]).toContain("观察框架仅作材料");
  expect(prompts[2]).not.toContain("完整根对象结构示例");
  expect(prompts[3]).toContain(shortText + addition);
  expect(prompts[4]).toContain("独立语义审计器");
  expect(prompts[6]).toContain(`独立审计结果：${JSON.stringify(highRiskAudit)}`);
  expect(prompts[7]).toContain(shortText + addition);
  const trace = checks();
  expect(trace.calls.filter((call: { repairKind?: string }) => call.repairKind === "contract").map((call: { stage: string }) => call.stage)).toEqual(["critic", "final"]);
  expect(trace.checks.filter((check: { contractIssues?: string[] }) => check.contractIssues)).toEqual([
    { stage: "critic", repair: false, valid: false, contractIssues: ["synthesis_text_underlength"] },
    { stage: "final", repair: false, valid: false, contractIssues: ["synthesis_text_underlength"] }
  ]);
  expect(JSON.stringify(trace)).not.toContain(addition);
});

it.each([
  ["补充仍短。", "synthesis_text_underlength"],
  [addition + "还必须在30天内推广。", "synthesis_unsupported_quantity"],
  [addition.repeat(4), "synthesis_text_overlength"],
  [{ addition, summary: "额外字段" }, "synthesis_expansion"]
])("returns 502 after one invalid supplement (%s)", async (supplement, code) => {
  generate.mockResolvedValueOnce(emit({ synthesis, applicablePolicyCards: [] })).mockResolvedValueOnce(emit({ synthesis }))
    .mockResolvedValueOnce(emit(typeof supplement === "string" ? { addition: supplement } : supplement));
  const response = await POST(endpoint({ rootInput, sources: [sourceA, sourceB] }));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ requestId: "contract-test", error: "invalid_model_output", details: "synthesis critic failed contract after one repair" });
  expect(generate).toHaveBeenCalledTimes(3);
  const trace = checks();
  expect(trace.checks.at(-1)).toEqual({ stage: "critic", repair: true, valid: false, contractIssues: [code] });
  expect(JSON.stringify(trace)).not.toContain("30天");
});

it("reaudits a prose rewrite that retains a deadline stated only in the user's original text", async () => {
  const thesis = { id: "first", text: "按原日期交付，随后补键盘支持，以短期内可修复为前提。", summary: "维持交付安排", label: "按期交付", stance: "正" };
  const antithesis = { id: "second", text: "键盘用户无法完成核心流程，延期到能完整操作再开放。", summary: "恢复键盘主流程再发布", label: "流程可用", stance: "反" };
  const text = "甲乙共同落在同一条发布门槛上，分歧在于门槛能否被三天期限和既定交付推开。来源甲把短期修复能够兑现当作前提，但材料没有给出键盘路径可在三天内修好的证据；前提不成立时，按原日期发布仍会让键盘用户被挡在核心流程外。来源乙据此要求延期到能完整操作，这一要求直接约束发布日期，却不等于交付安排不受影响。键盘路径三天内无法修复时，应先使发布顺延，把已知不可用状态作为阻断处理；来源甲保留的交付诉求则体现为延期的代价。";
  const typed = { ...synthesis, text, summary: "未能让键盘操作完整走通时，应延后发布。", change: "原日期交付的前提失效时，发布日期要由键盘路径的可用性决定。" };
  const unsupported = "如果需要讨论日期，删去来源未给的分人群发布条件。";
  const critic = { ...typed, text: text.replaceAll("三天", "短期") + "可以先向非键盘用户开放。" };
  generate.mockResolvedValueOnce(emit({ synthesis: critic, applicablePolicyCards: [] })).mockResolvedValueOnce(emit({ synthesis: critic }))
    .mockResolvedValueOnce(emit({ synthesis: { prose: { pass: false, issues: [unsupported] } } }))
    .mockResolvedValueOnce(emit({ synthesis: typed }))
    .mockResolvedValueOnce(review("以短期内可修复为前提", "键盘用户无法完成核心流程", "短期修复能够兑现当作前提", "延期到能完整操作", "把已知不可用状态作为阻断处理"));
  const response = await POST(endpoint({ rootInput: `${thesis.text}\n\n${antithesis.text}`, sources: [thesis, antithesis], contextMessages: [
    { role: "user", content: "[想法 · id=user] 离发布只剩三天，键盘用户无法完成核心流程。" },
    { role: "assistant", content: "无依据的猜测是两周可修完。" }
  ] }));
  expect(response.status).toBe(200);
  expect((await response.json()).synthesis.text).toBe(text);
  expect(generate).toHaveBeenCalledTimes(5);
  expect(generate.mock.calls[4][0].input).toContain(text);
});

it("uses the full editor for simultaneous length and quantity errors", async () => {
  const valid = { ...synthesis, text: shortText + addition };
  const overlong = { ...synthesis, text: shortText + addition.repeat(3) + "还必须在30天内推广。" };
  generate.mockResolvedValueOnce(emit({ synthesis, applicablePolicyCards: [] })).mockResolvedValueOnce(emit({ synthesis: overlong }))
    .mockResolvedValueOnce(emit({ synthesis: valid }))
    .mockResolvedValueOnce(review("新增试用者接近未来的购买者", "尽快看到预算与购买承诺", "试用若确实接近未来购买者", "用来带着具体行为去核预算与承诺", "不能作为继续争取更多免费用户的依据"));
  const response = await POST(endpoint({ rootInput, sources: [sourceA, sourceB] }));
  expect(response.status).toBe(200);
  expect((await response.json()).synthesis.text).toBe(valid.text);
  const prompt = generate.mock.calls[2][0].input;
  expect(prompt).toContain("删减约");
  expect(prompt).toContain("unsupported quantities: 30天");
  expect(prompt).not.toContain('只返回 {"addition"');
  expect(checks().checks[1].contractIssues).toEqual(["synthesis_text_overlength", "synthesis_unsupported_quantity"]);
  expect(generate).toHaveBeenCalledTimes(4);
});

it("repairs an invented source-count requirement before independent review", async () => {
  const valid = { ...synthesis, text: shortText + addition };
  const ungrounded = { ...valid, text: "两份来源都须另找并提交，满足最低份数后才可开放报名。" + valid.text };
  generate.mockResolvedValueOnce(emit({ synthesis, applicablePolicyCards: [] })).mockResolvedValueOnce(emit({ synthesis: ungrounded }))
    .mockResolvedValueOnce(emit({ synthesis: valid }))
    .mockResolvedValueOnce(review("新增试用者接近未来的购买者", "尽快看到预算与购买承诺", "试用若确实接近未来购买者", "用来带着具体行为去核预算与承诺", "不能作为继续争取更多免费用户的依据"));
  const response = await POST(endpoint({ rootInput, sources: [sourceA, sourceB] }));
  expect(response.status).toBe(200);
  expect((await response.json()).synthesis.text).toBe(valid.text);
  expect(generate.mock.calls[2][0].input).toContain("unsupported quantities: 两份");
  expect(generate.mock.calls[2][0].input).toContain("正文指代当前来源时称‘甲乙’或‘两侧’");
  expect(generate.mock.calls[3][0].input).toContain(valid.text);
  expect(generate.mock.calls[3][0].input).not.toContain("最低份数");
  expect(generate).toHaveBeenCalledTimes(4);
});

it("keeps numbers from assistant turns, quoted seeds and user-turn headings outside the guard's source material", async () => {
  const ungrounded = { ...synthesis, text: shortText + addition + "把试用扩大三天，并以两周推进，直到四周完成。" };
  generate.mockResolvedValueOnce(emit({ synthesis, applicablePolicyCards: [] })).mockResolvedValueOnce(emit({ synthesis: ungrounded }))
    .mockResolvedValueOnce(emit({ synthesis: ungrounded }));
  const response = await POST(endpoint({ rootInput, sources: [sourceA, sourceB], contextMessages: [
    { role: "assistant", content: "再试三天。" },
    { role: "user", content: "[引用种子 · 两周期限] 以两周推进。" },
    { role: "user", content: "[想法 · 四周 · id=user] 用户希望评估付费意愿。" }
  ] }));
  expect(response.status).toBe(502);
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate.mock.calls[2][0].input).toContain("unsupported quantities: 三天, 两周, 四周");
  expect(JSON.stringify(checks())).not.toMatch(/三天|两周|四周/u);
});
