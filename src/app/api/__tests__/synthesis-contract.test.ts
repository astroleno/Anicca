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

it.each([false, true])("only accepts a supplement that grounds the existing tradeoff (%s)", async grounded => {
  const thesis = { id: "client-a", text: "三家都需要接入。若身份、数据流和交付节奏有共同部分，通用插件平台能降低往后每次集成的成本。", summary: "降低集成成本", label: "共用底座", stance: "正" };
  const antithesis = { id: "client-b", text: "三家各自要求不同。先把最大客户需要的一个集成交付到实际使用，从真实限制中发现是否存在值得抽象的共性。", summary: "从真实集成验证共性", label: "单一交付", stance: "反" };
  const rootInput = `${thesis.text}\n\n${antithesis.text}`;
  const original = { ...synthesis, text: "三家都需接入，但各自要求不同；甲的插件平台要成立，得先确认身份、数据流与交付节奏确有共同部分。乙的单点交付把这一确认放到最大客户的实际使用中，用真实限制检验共性是否存在，而非仅凭三家都说要接入就抽象。于是原题的选择变成有条件的顺序：先取得一份可用的集成，再判断共同部分是否足够支撑平台；若限制互不相容，就停在单点交付，代价是后续接入仍需分别处理。" };
  const captured = "而甲所说的“降低往后每次集成的成本”，只有在第二份复用证据出现后才成立；首客阶段若把专属字段与条件放进核心模型，反而会让两侧的差异被掩盖，后续抽象失去可靠依据。";
  const explanation = "这一代价来自接口边界未被证实：身份或数据流差异会要求分别处理，把这些差异先写成平台规则，只会把原有维护负担转到共用层。";
  const applicability = [{ id: "bounded-abstraction", object: "客户集成", action: "验证接入共性再抽象", evidence: "从真实限制中发现是否存在值得抽象的共性" }];
  generate.mockResolvedValueOnce(emit({ synthesis: original, applicablePolicyCards: applicability }))
    .mockResolvedValueOnce(emit({ synthesis: original }))
    .mockResolvedValueOnce(emit({ addition: grounded ? explanation : captured }));
  if (grounded) generate.mockResolvedValueOnce(review(
    "身份、数据流和交付节奏有共同部分", "从真实限制中发现是否存在值得抽象的共性",
    "得先确认身份、数据流与交付节奏确有共同部分", "乙的单点交付把这一确认放到最大客户的实际使用中", "把原有维护负担转到共用层"
  ));

  const response = await POST(endpoint({ rootInput, sources: [thesis, antithesis] }));
  expect(response.status).toBe(grounded ? 200 : 502);
  const supplementPrompt = generate.mock.calls[2][0].input;
  expect(supplementPrompt).toContain("至少 7 个字符");
  expect(supplementPrompt).toContain("先在原有正文中定位已经写出的适用条件、代价或后果");
  expect(supplementPrompt).toContain("缺少第二份复用证据");
  expect(supplementPrompt).toMatch(/不写数字、份数、序数、次数或最低验收量[^\n]+只返回 addition 字段。$/u);
  expect(generate).toHaveBeenCalledTimes(grounded ? 4 : 3);
  expect(checks().repairCalls).toBe(1);
  if (grounded) {
    expect((await response.json()).synthesis.text).toBe(original.text + explanation);
    expect(generate.mock.calls[3][0].input).toContain(original.text + explanation);
  } else {
    expect(await response.json()).toMatchObject({ details: "synthesis critic failed contract after one repair" });
    expect(checks().checks.at(-1)).toEqual({ stage: "critic", repair: true, valid: false, contractIssues: ["synthesis_unsupported_quantity"] });
  }
});

it("specifies the complete high-risk audit shape and rejects an extra missing field without another call", async () => {
  const thesis = { id: "telemetry-a", text: "记录完整漏斗可以发现流失发生在哪一步，让增长团队不只从少数访谈猜测。前提是收集方式与公开隐私承诺相容。", summary: "识别具体流失环节", label: "完整漏斗", stance: "正" };
  const antithesis = { id: "telemetry-b", text: "继续零遥测。团队已经公开承诺隐私优先，应先确认用户接受什么，再改变所收集的信息；现在可以问愿意参与访谈的人。", summary: "维持零遥测承诺", label: "守住承诺", stance: "反" };
  const rootInput = `${thesis.text}\n\n${antithesis.text}`;
  const candidate = { ...synthesis, text: "公开的隐私优先承诺先于增长需要，零遥测当前仍然成立：全量埋点缺少合法收集前提，不能把“先确认接受范围”当成已经拿到授权。甲所说的漏斗价值不是虚构，但它只能作为待议条件——先向愿意受访者追问步骤，标成访谈样本，不冒充全量数据，再把偏差写进结论。若以后用户明确同意某种聚合范围，才可讨论有限漏斗；届时仍要核对公开承诺是否相容。代价是流失定位更慢、结论受限，但这正是守住承诺换来的边界。" };
  const applicability = [{ id: "consent-privacy", object: "用户行为记录与访谈", action: "确认用户接受范围", evidence: "应先确认用户接受什么，再改变所收集的信息" }];
  const cards = retrieveDialecticPolicyCards([rootInput]).filter(card => card.id === "consent-privacy");
  const expectedIds = getDialecticRuleChecks(cards).map(({ id }) => id);
  const missing = "新研究必须目的绑定、可拒绝、可退出且不影响原服务或评价";
  const audit = {
    route: "third_mechanism", unsupportedClaims: [], missingClauses: [`consent-privacy:I2：${missing}`], verdict: "repair",
    checks: expectedIds.map(id => id === "consent-privacy:I2"
      ? { id, status: "covered", evidence: "候选未完整覆盖该 invariant。", missing }
      : { id, status: "covered", evidence: "候选遵守该规则。" })
  };
  generate.mockResolvedValueOnce(emit({ synthesis: candidate, applicablePolicyCards: applicability }))
    .mockResolvedValueOnce(emit({ synthesis: candidate }))
    .mockResolvedValueOnce(review("记录完整漏斗可以发现流失发生在哪一步", "团队已经公开承诺隐私优先", "甲所说的漏斗价值不是虚构", "零遥测当前仍然成立", "代价是流失定位更慢、结论受限"))
    .mockResolvedValueOnce(emit({ audit }));

  const response = await POST(endpoint({ rootInput, sources: [thesis, antithesis] }));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ details: "high-risk semantic audit failed" });
  expect(generate).toHaveBeenCalledTimes(4);
  const prompt = generate.mock.calls[3][0].input;
  const shape = JSON.parse(prompt.split("\n").at(-1));
  expect(Object.keys(shape)).toEqual(["audit"]);
  expect(Object.keys(shape.audit)).toEqual(["route", "checks", "unsupportedClaims", "missingClauses", "verdict"]);
  expect(shape.audit.checks.map((entry: { id: string }) => entry.id)).toEqual(expectedIds);
  expect(shape.audit.checks.map(Object.keys)).toEqual(expectedIds.map(() => ["id", "status", "evidence"]));
  expect(shape.audit.missingClauses).toEqual([{ ruleId: expectedIds[0], reason: expect.any(String) }]);
  expect(prompt).toContain("规则的缺项说明集中写入 audit.missingClauses 并注明规则 id");
  expect(prompt).toContain("维持现状、比较安全前提或把未来行动留作待议，都不要求增加新的研究、采集或执行流程");
  expect(prompt).toContain("仍须满足该行为的所有适用保障");
  expect(prompt).toContain("缺少所需保障时标 missing");
  expect(checks().checks.at(-1)).toEqual({ stage: "audit", repair: false, valid: false, contractIssues: ["synthesis_semantic_audit"] });
  expect(checks().repairCalls).toBe(0);
});
