import { analyzeSynthesisOutput, findUnsupportedSynthesisQuantities, buildSynthesisContractRepairPrompt, buildSynthesisCriticPrompt, parseSynthesisAudit } from "./synthesisQuality";
import { retrieveDialecticPolicyCards } from "./policyCards";

it("reports the actual length for repair without accepting an underlength synthesis", () => {
  const result = analyzeSynthesisOutput(JSON.stringify({ synthesis: { text: "过短", summary: "摘要", label: "短文", stance: "合" } }), "");
  expect(result.synthesis).toBeNull();
  expect(result.errors).toContain("synthesis.text must contain 180-320 characters; current text has 2 characters");
});

it("accepts structural enumeration without exempting real quantities using the same counter", () => {
  expect(findUnsupportedSynthesisQuantities("", "两个来源揭示两个层次，也产生三条思路。这两条材料涉及两个环节与两个前提。")).toEqual([]);
  expect(findUnsupportedSynthesisQuantities("两条材料", "两条材料与两条生产线、两条日志都要保留。")).toEqual(["两条"]);
  expect(findUnsupportedSynthesisQuantities("", "两个相关的意义生成环节与两个不同的视角。")).toEqual([]);
  expect(findUnsupportedSynthesisQuantities("", "两个相关的团队负责两个不同的项目。")).toEqual(["两个"]);
  expect(findUnsupportedSynthesisQuantities("两个来源", "两个层次的计划须投入两个月、三个人，达到30%。")).toEqual(expect.arrayContaining(["两个", "三个", "30%"]));
  expect(findUnsupportedSynthesisQuantities("期限为三周", "在三周内完成，目标50%。")).toEqual(["50%"]);
});

it("keeps non-decision synthesis and its contract repair free of the old five-sentence prescription", () => {
  const source = { text: "独处让创作找到自己的声音", summary: "独处与创作", label: "自己的声音", stance: "想法" as const };
  const context = { sourceMode: "seeds" as const, rootInput: "独处与回应", thesis: source, antithesis: { ...source, text: "回应让作品产生新的意义" }, contextMessages: "", cards: [] };
  const result = { ...source, stance: "合" as const };
  for (const prompt of [buildSynthesisCriticPrompt(context, result), buildSynthesisContractRepairPrompt(context, JSON.stringify(result), ["too long"])]) {
    expect(prompt).toContain("180–320");
    expect(prompt).not.toContain("严格写五句");
    expect(prompt).toContain("关联薄弱");
    expect(prompt).toContain("正文指代当前来源时称‘甲乙’或‘两侧’");
  }
});

it("gives underlength and overlength repairs an explicit editing direction while preserving the contract", () => {
  const source = { text: "原文", summary: "摘要", label: "来源", stance: "想法" as const };
  const context = { rootInput: "原始问题", thesis: source, antithesis: source, contextMessages: "", cards: [] };
  const prompt = (text: string) => buildSynthesisContractRepairPrompt(context,
    JSON.stringify({ synthesis: { text, summary: "摘要", label: "结果", stance: "合" } }), ["length"]);
  expect(prompt("字".repeat(177))).toContain("扩写约 83 字");
  expect(prompt("字".repeat(350))).toContain("删减约 90 字");
  expect(prompt("字".repeat(240))).toContain("保持长度");
  expect(prompt("字".repeat(177))).toContain("180–320");
});

it("grounds quantities without joining adjacent input fragments", () => {
  expect(findUnsupportedSynthesisQuantities([], "两份来源共同用于核实另外两份记录，三份材料也要回收。"))
    .toEqual(["两份", "三份"]);
  expect(findUnsupportedSynthesisQuantities([], "两份材料都要采购，另外还有两份采购单和两份来源记录。"))
    .toEqual(["两份"]);
  expect(findUnsupportedSynthesisQuantities([], "我们另查了两份材料都指出某种趋势。手里另有两份来源，其中一份是报告。"))
    .toEqual(["两份"]);
  expect(findUnsupportedSynthesisQuantities(["只剩三天", "最后的备选数量为3", "天数仍待确认"], "三天内尚未交付，还要3天。"))
    .toEqual(["3天"]);
});

it.each([
  "两份来源都须另找并提交，满足最低份数后才可开放报名。",
  "两份来源，需要另找并提交后才能报名。",
  "两份来源, 必须采购并提交。",
  "两份来源的原件必须提交。",
  "两份来源中至少有一份必须向外部机构另行采购。",
  "两份来源共同落在同一个业务范围上，需要另找并提交。",
  "两份材料都围绕同一对象，需要补交原件。",
  "两份来源共同解释原问题，须在报名截止前提交。",
  "两份材料都围绕同一主张提交，争点是能否及时缴交。",
  "两份来源共同解释原问题；须在报名截止前提交。"
])("checks required source quantities even at the beginning of a sentence (%s)", text => {
  expect(findUnsupportedSynthesisQuantities([], text)).toEqual(["两份"]);
  expect(findUnsupportedSynthesisQuantities([text], text)).toEqual([]);
});

it.each([
  "两份材料都围绕同一六周现金约束，争点是先扩大免费试用，还是先接触有预算的客户。",
  "两份来源共同落在同一个读取接口上，甲要用缓存压低回源。",
  "两份来源都面对同一项九十分钟预算，分歧不在维护与新功能是否重要。",
  "两份来源共同落在同一条发布门槛上，分歧在于门槛能否被三天期限推开。"
])("keeps true conditions and accepts source names in place of the counts observed in the original set (%s)", text => {
  const supplied = ["期限是六周", "预算是九十分钟", "距离发布只剩三天"];
  expect(findUnsupportedSynthesisQuantities(supplied, text)).toEqual(["两份"]);
  expect(findUnsupportedSynthesisQuantities(supplied, text.replace(/^两份(?:来源|材料)/u, "甲乙"))).toEqual([]);
});

it("enumerates multiple contract failures without replacing repair details", () => {
  const result = analyzeSynthesisOutput(JSON.stringify({ synthesis: {
    text: "字".repeat(320) + "30天", summary: "", label: "需要修复", stance: "合"
  } }), []);
  expect(result.synthesis).toBeNull();
  expect(result.contractIssues).toEqual(["synthesis_text_overlength", "synthesis_summary", "synthesis_unsupported_quantity"]);
  expect(result.errors).toContain("unsupported quantities: 30天");
});

// The formal-12 upstream audit returned the same reasons in a structured list.
const capturedAudit = {
  route: "third_mechanism",
  checks: [
    {"id":"consent-privacy:I1","status":"covered","evidence":"候选明确指出用户未同意行为追踪，授权是完整漏斗展示成立的前提而非可替代项，开启遥测会越过授权边界。"},
    {"id":"consent-privacy:I2","status":"missing","evidence":"候选要求直接说明漏斗缺失并呈现已获准使用的汇总信息，但未涵盖新研究的目的绑定、可拒绝、可退出且不影响原服务或评价等保障。"},
    {"id":"consent-privacy:I3","status":"missing","evidence":"候选未提供数据来源、用途、最短保留期和删除路径的可审计说明。"},
    {"id":"consent-privacy:I4","status":"missing","evidence":"候选未说明研究开始前检查重识别风险，也未保留可立即远程停用与删除的路径。"},
    {"id":"consent-privacy:F1","status":"covered","evidence":"候选明确反对在用户未同意时开启遥测，未提出秘密或默认开启个人行为追踪。"},
    {"id":"consent-privacy:F2","status":"covered","evidence":"候选未以匿名化或事后删除合理化未经同意采集，反而以未授权限定可见范围。"},
    {"id":"consent-privacy:F3","status":"covered","evidence":"候选未将示意或合成数据冒充真实证据，明确承认缺口并限于已获准使用的汇总信息。"}
  ],
  unsupportedClaims: [],
  missingClauses: [
    {"ruleId":"consent-privacy:I2","reason":"缺少新研究目的绑定、可拒绝、可退出且不影响原服务或评价的明确保障。"},
    {"ruleId":"consent-privacy:I3","reason":"缺少数据来源、用途、最短保留期和删除路径的可审计说明。"},
    {"ruleId":"consent-privacy:I4","reason":"缺少研究前的重识别风险检查及可立即远程停用与删除路径。"}
  ],
  verdict: "repair"
};
const capturedAuditCards = retrieveDialecticPolicyCards(["用户没有同意行为追踪，能否开启遥测"]).filter(card => card.id === "consent-privacy");

it("normalizes the captured missing clauses without losing their IDs, reasons or order", () => {
  const missingClauses = capturedAudit.missingClauses.map(({ ruleId, reason }) => `${ruleId}：${reason}`);
  const strings = parseSynthesisAudit(JSON.stringify({ audit: { ...capturedAudit, missingClauses } }), capturedAuditCards);
  expect(strings).toEqual({ ...capturedAudit, missingClauses });
  expect(parseSynthesisAudit(JSON.stringify({ audit: capturedAudit }), capturedAuditCards)).toEqual(strings);
});

it.each([
  ["unknown rule", [{ ...capturedAudit.missingClauses[0], ruleId: "consent-privacy:I99" }, ...capturedAudit.missingClauses.slice(1)]],
  ["covered rule", [{ ...capturedAudit.missingClauses[0], ruleId: "consent-privacy:I1" }, ...capturedAudit.missingClauses.slice(1)]],
  ["empty ID", [{ ...capturedAudit.missingClauses[0], ruleId: "" }, ...capturedAudit.missingClauses.slice(1)]],
  ["duplicate rule", [...capturedAudit.missingClauses, capturedAudit.missingClauses[0]]],
  ["omitted rule", capturedAudit.missingClauses.slice(1)],
  ["blank reason", [{ ...capturedAudit.missingClauses[0], reason: " \t" }, ...capturedAudit.missingClauses.slice(1)]],
  ["wrong reason type", [{ ...capturedAudit.missingClauses[0], reason: ["缺项"] }, ...capturedAudit.missingClauses.slice(1)]],
  ["extra field", [{ ...capturedAudit.missingClauses[0], evidence: "禁止附加字段" }, ...capturedAudit.missingClauses.slice(1)]],
  ["mixed item formats", ["consent-privacy:I2：缺项", ...capturedAudit.missingClauses.slice(1)]]
])("rejects a structured audit missing-clause list with %s", (_, missingClauses) => {
  expect(parseSynthesisAudit(JSON.stringify({ audit: { ...capturedAudit, missingClauses } }), capturedAuditCards)).toBeNull();
});
