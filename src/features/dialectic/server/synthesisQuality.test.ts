import { analyzeSynthesisOutput, findUnsupportedSynthesisQuantities, buildSynthesisContractRepairPrompt, buildSynthesisCriticPrompt } from "./synthesisQuality";

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
