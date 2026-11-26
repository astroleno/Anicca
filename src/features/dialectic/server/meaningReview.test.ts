import { ReviewerProtocolError, finalizeMeaning, finalizeSynthesisMeaning, userReportedMaterial } from "./meaningReview";
import { createGenerationTrace } from "./generationTrace";
import { johariThinkingSpace } from "@/features/perspectives/model";
import type OpenAI from "openai";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai/generateText", () => ({ generateText: generate }));
const source = { id: "parent", label: "可见性", text: "没有留言不等于没有人受影响，还需看没有留言时的现场变化。" };
const draft = { text: "没有留言不等于没有人受影响。若现场变化只在有人代为表达时才被归因，需要区分变化本身与解释变化的人。", summary: "区分变化与归因", label: "可辨认与可发言的", change: "新增没有留言也可能有人受影响的区别。" };
const verified = { label: "变化与归因", change: { text: "把现场变化的观察进一步区分为变化本身与代言者的归因。", sourceId: "parent", sourceEvidence: "还需看没有留言时的现场变化", resultEvidence: "需要区分变化本身与解释变化的人" }, hypothesesSafe: true, issues: [], novelty: { status: "new" } };
const respond = (value: unknown) => ({ text: JSON.stringify(value) });
const input = () => ({ results: { thesis: { ...draft } }, sources: [source], comparisons: [source], userMaterial: "", context: "", meaning: true,
  trace: createGenerationTrace("branches", "test", new AbortController().signal), client: {} as OpenAI, signal: new AbortController().signal });
beforeEach(() => { generate.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it("replaces an old distinction presented as new while retaining the actual new detail and a complete title", async () => {
  generate.mockResolvedValue(respond({ thesis: verified }));
  const result = await finalizeMeaning(input());
  expect(result?.thesis).toMatchObject({ text: draft.text, label: "变化与归因", change: verified.change.text });
  expect(result?.thesis.change).not.toBe(draft.change);
  expect(generate.mock.calls[0][0].input).toContain(source.text);
});

it("accepts a complete flat audit only when its single result has an unambiguous owner", async () => {
  generate.mockResolvedValue(respond({ ...verified, personalEvidence: [] }));
  expect((await finalizeMeaning(input()))?.thesis.change).toBe(verified.change.text);
});

it("does not apply one flat assessment to multiple self-report results", async () => {
  generate.mockResolvedValue(respond({ ...verified, personalEvidence: [] }));
  expect(await finalizeMeaning({ ...input(), results: { thesis: draft, antithesis: draft }, perspective: johariThinkingSpace() })).toBeNull();
});

it.each([
  { ...verified.change, sourceEvidence: "来源并没有写过的判断" },
  { ...verified.change, resultEvidence: "结果并没有提出的观点" },
  { ...verified.change, sourceId: "fabricated" },
  { ...verified.change, text: "从原以为先坦诚再复盘，改成边复盘边坦诚。" },
  null
])("suppresses unverifiable or fabricated changes rather than falling back to the model's self-description", async change => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change } }));
  const result = await finalizeMeaning(input());
  expect(result?.thesis.text).toBe(draft.text);
  expect(result?.thesis.change).toBeUndefined();
});

it("preserves readable prose without a newness claim when the reviewer is unavailable", async () => {
  generate.mockRejectedValue(new Error("unavailable"));
  const value = input(); value.results.thesis.label = "变化与归因";
  const result = await finalizeMeaning(value);
  expect(result?.thesis.change).toBeUndefined();
  expect(result?.thesis.novelty).toEqual({ status: "unchecked" });
});

it.each([undefined, { status: "unchecked" }, {
  status: "revisit", sourceId: source.id, reason: "来源已经区分无留言与无人受影响，结果没有增加这一关系。",
  sourceEvidence: "没有留言不等于没有人受影响", resultEvidence: "没有留言不等于没有人受影响"
}])("suppresses a conflicting change unless the audit also establishes newness against the current parents", async novelty => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, novelty } }));
  const result = await finalizeMeaning({ ...input(), comparisons: [] });
  expect(result?.thesis.text).toBe(draft.text);
  expect(result?.thesis.change).toBeUndefined();
  expect(result?.thesis.novelty).toBeUndefined();
});

it("repairs a locally asserted personal history even if a reviewer mistakenly calls the paragraph hypothetical", async () => {
  const value = { ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft,
    text: "你原以为只是自己多想，同事若提到相同场景，可能提示还需要共同确认。" } } };
  const repaired = { thesis: { ...draft, text: "假如你曾觉得只是自己多想，且同事确实提到相同场景，才值得共同确认这种解释。" } };
  const repair = vi.fn().mockResolvedValue(repaired);
  generate.mockResolvedValueOnce(respond({ thesis: { ...verified, change: null } }))
    .mockResolvedValueOnce(respond({ thesis: { ...verified, change: null } }));
  const result = await finalizeMeaning({ ...value, repair });
  expect(repair).toHaveBeenCalledTimes(1);
  expect(result?.thesis.text).toBe(repaired.thesis.text);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("does not accept an assistant's invented experience as a user report, but retains an explicitly supplied experience", async () => {
  const personal = "你原以为只是自己多想";
  const value = { ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, text: `${personal}。` } } };
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null } }));
  const context = [{ role: "assistant", content: personal }, { role: "user", content: `[引用种子 previous] ${personal}` },
    { role: "user", content: `[想法 · ${personal} · id=question · 来源=previous] 想沿乔哈里窗口看看。` }];
  expect(userReportedMaterial(context)).not.toContain(personal);
  expect(await finalizeMeaning({ ...value, userMaterial: userReportedMaterial(context) })).toBeNull();
  const actual = [...context, { role: "user", content: "我原以为只是自己多想，同事后来明确说也遇到了。" }];
  expect((await finalizeMeaning({ ...value, userMaterial: userReportedMaterial(actual) }))?.thesis.text).toBe(`${personal}。`);
});

it("stops after one unsuccessful hypothesis repair and never returns unverified self-report prose", async () => {
  const value = { ...input(), perspective: johariThinkingSpace() };
  generate.mockResolvedValue(respond({ thesis: { ...verified, hypothesesSafe: false, issues: ["把未知的知晓程度断言为事实"] } }));
  const repair = vi.fn().mockResolvedValue(value.results);
  expect(await finalizeMeaning({ ...value, repair })).toBeNull();
  expect(repair).toHaveBeenCalledTimes(1);
  expect(generate).toHaveBeenCalledTimes(2);
});

it.each([
  "更该先问：同事说‘你太急’时，具体指哪句话、哪个时刻？",
  "假设你记得自己在中性追问，这份记忆是待核对材料。你能明确说出某次追问的意图，却未必知道同事如何接收。"
])("rejects unprovided feedback and personal events even inside otherwise hypothetical prose", async text => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  expect(await finalizeMeaning({ ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, text } } })).toBeNull();
});

it("accepts a grounded paraphrase of reported feedback only when the reviewer cites actual user material", async () => {
  const text = "同事说你太急时，可以再核对具体指哪句话、哪个时刻。";
  const userMaterial = "昨天同事明确说我在讨论里太急，经常替别人把结论说完。";
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [{ claim: text, userEvidence: userMaterial }] } }));
  const value = { ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, text } } };
  expect((await finalizeMeaning({ ...value, userMaterial }))?.thesis.text).toBe(text);
  expect(await finalizeMeaning({ ...value, userMaterial: "我想知道自己是否太急。" })).toBeNull();
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  const hypothetical = "假如同事说你太急，可以再核对具体指哪句话、哪个时刻。";
  expect((await finalizeMeaning({ ...value, results: { thesis: { ...draft, text: hypothetical } } }))?.thesis.text).toBe(hypothetical);
});

it.each(["同事知道这件事吗？", "你记得这段话吗？"])("keeps a direct confirmation question open without manufacturing evidence", async text => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  const result = await finalizeMeaning({ ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, text } } });
  expect(result?.thesis.text).toBe(text);
});

it.each(["同事知道不等于愿说，复盘场合可能抬高坦白的代价。", "他人知道，未必愿意公开说。"])("keeps a non-factive distinction in the summary without turning it into a personal assertion", async summary => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  const result = await finalizeMeaning({ ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, summary } } });
  expect(result?.thesis.summary).toBe(summary);
});

it.each(["同事已经知道你的问题但没有告诉你。", "同事说你太急不等于你真的太急。"])("still rejects a concrete unprovided report or knowledge assertion", async summary => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  expect(await finalizeMeaning({ ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, summary } } })).toBeNull();
});

it.each(["乔哈里窗口的“他人知道”只是待确认的观察入口，不代表某位同事实际掌握了什么。", "同事反馈不等于事实，仍需要核对具体片段。"])("allows a quoted viewpoint or abstract feedback concept without treating it as a report", async text => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  expect((await finalizeMeaning({ ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, text } } }))?.thesis.text).toBe(text);
});

it("requires grounding when a plain knowledge claim has a personal object", async () => {
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  expect(await finalizeMeaning({ ...input(), perspective: johariThinkingSpace(), results: { thesis: { ...draft, text: "同事知道你的问题但没有告诉你。" } } })).toBeNull();
});

it("maps a genuine multi-clause user citation to each covered assertion without losing punctuation boundaries", async () => {
  const text = "你记得自己此前只是多想；同事说你常替别人提前下结论。";
  const userMaterial = "我原以为只是自己多想。昨天同事明确反馈：我经常替别人把结论说完。";
  const value = { ...input(), perspective: johariThinkingSpace(), userMaterial, results: { thesis: { ...draft, text } } };
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [{ claim: text, userEvidence: userMaterial }] } }));
  expect((await finalizeMeaning(value))?.thesis.text).toBe(text);
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [{ claim: "你记得自己此前只是多想", userEvidence: userMaterial }] } }));
  expect(await finalizeMeaning(value)).toBeNull();
});

it("does not infer an inner experience from genuine colleague feedback", async () => {
  const text = "如果同事反馈属实，可以核对具体时刻。你能感到自己在补充观点，她却能听到谁的话被接走。";
  const userMaterial = "昨天同事说我经常替别人把结论说完，我此前没有注意。";
  generate.mockResolvedValue(respond({ thesis: { ...verified, change: null, personalEvidence: [] } }));
  const value = { ...input(), userMaterial, perspective: johariThinkingSpace(), results: { thesis: { ...draft, text } } };
  expect(await finalizeMeaning(value)).toBeNull();
  const hypothetical = "假如你感到自己在补充观点，且对方确实感到话被接走，才值得核对两份体验。";
  expect((await finalizeMeaning({ ...value, results: { thesis: { ...draft, text: hypothetical } } }))?.thesis.text).toBe(hypothetical);
  expect((await finalizeMeaning({ ...value, results: { thesis: { ...draft, text: "你感到自己在补充观点吗？" } } }))?.thesis.text).toBe("你感到自己在补充观点吗？");
});

const orderedSources = [
  { id: "a", label: "先听现场", text: "先听院子里的人怎么说。这样才能知道他们在等什么。" },
  { id: "b", label: "留下停顿", text: "用人物走到门边时的停顿写出离别。" }
];
const synthesis = {
  ...draft,
  text: "听见院里的人说“还没到该走的时候。”\n这份等待可以留下。人物走到门边时停了停，但不再把等待写成还能留下。读者会从那个停顿里知道不可回头。"
};
const synthesisInput = () => ({ ...input(), sources: orderedSources, comparisons: [] });
const candidate = { synthesis, outputText: "draft" };
const passEvidence = {
  sourceA: { unit: "A1", through: "A2" }, sourceB: { unit: "B1" },
  useA: { unit: "R1", through: "R2" }, useB: { unit: "R3" }, consequence: { unit: "R4" }
};
const prose = (evidence: object) => ({ pass: true, issues: [], evidence });
const synthesisReview = (value: unknown) => respond({ synthesis: { ...verified, change: null, prose: value } });
const lastTrace = () => JSON.parse(String(vi.mocked(console.info).mock.calls.at(-1)?.[0]).slice("anicca.generation ".length));

it("accepts only consecutive source and result units, preserving Unicode quotes and intervening newlines", async () => {
  generate.mockResolvedValueOnce(synthesisReview(prose(passEvidence)));
  const result = await finalizeSynthesisMeaning(synthesisInput(), candidate);
  expect(result).toMatchObject({ synthesis: { text: synthesis.text } });
  expect(generate).toHaveBeenCalledOnce();
  const prompt = generate.mock.calls[0][0].input as string;
  expect(prompt).not.toContain("prose.authorization");
  expect(generate.mock.calls[0][0]).toHaveProperty("jsonObject", true);
  const evidenceUnits = JSON.parse(prompt.split("\n").find(line => line.startsWith("可选原文编号="))!.split("=")[1]);
  expect(evidenceUnits).toMatchObject({
    A1: "先听院子里的人怎么说。", A2: "这样才能知道他们在等什么。",
    R1: "听见院里的人说“还没到该走的时候。”", R2: "这份等待可以留下。", R4: "读者会从那个停顿里知道不可回头。"
  });
  expect(synthesis.text).toContain(evidenceUnits.R1 + "\n" + evidenceUnits.R2);
});

it("targets multiple defective references without rewriting the text or re-copying accepted evidence", async () => {
  const short = "停顿";
  const inventedJoined = "听见院里的人说“还没到该走的时候。”读者会从那个停顿里知道不可回头。";
  const value = synthesisInput();
  generate.mockResolvedValueOnce(synthesisReview(prose({
    ...passEvidence, useA: orderedSources[0].text, useB: short, consequence: inventedJoined,
    sourceA: { unit: "A1", through: "B1" }
  }))).mockResolvedValueOnce(respond({ pass: true, issues: [], evidence: {
    ...passEvidence, useA: "听见院里的人说“还没到该走的时候。”\n这份等待可以留下。"
  } }));
  const repair = vi.fn();
  expect(await finalizeSynthesisMeaning(value, candidate, repair)).toMatchObject({ synthesis: { text: synthesis.text } });
  expect(repair).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledTimes(2);
  const correction = generate.mock.calls[1][0].input.slice(generate.mock.calls[0][0].input.length);
  expect(correction).toContain(JSON.stringify({ sourceA: "A", useA: "R", useB: "R", consequence: "R" }));
  expect(correction).not.toContain(inventedJoined);
  value.trace.finish("success");
  expect(lastTrace().checks[0]).toMatchObject({ reviewIssues: [
    { code: "wrong_evidence_owner", field: "sourceA" },
    { code: "wrong_evidence_owner", field: "useA" },
    { code: "evidence_too_short", field: "useB" },
    { code: "unmatched_evidence", field: "consequence" }
  ] });
});

it("rejects altered punctuation, reversed ranges, nonexistent units, and malformed pointers", async () => {
  const value = synthesisInput();
  generate.mockResolvedValue(synthesisReview(prose({
    ...passEvidence, sourceA: { unit: "A2", through: "A1" }, sourceB: { unit: "B9" },
    useA: '听见院里的人说「还没到该走的时候。」', useB: { unit: "R3", through: null }
  })));
  await expect(finalizeSynthesisMeaning(value, candidate)).rejects.toBeInstanceOf(ReviewerProtocolError);
  expect(generate).toHaveBeenCalledTimes(2);
  value.trace.finish("reviewer_protocol_error");
  expect(lastTrace().checks[1]).toMatchObject({ repair: true, reviewIssues: [
    { code: "invalid_evidence_range", field: "sourceA" },
    { code: "unknown_evidence_unit", field: "sourceB" },
    { code: "unmatched_evidence", field: "useA" },
    { code: "invalid_evidence", field: "useB" }
  ] });
});

it("requires a full verdict after explicit provider truncation, even if the partial JSON parses", async () => {
  const value = synthesisInput();
  generate.mockResolvedValueOnce({ ...synthesisReview(prose(passEvidence)), truncated: true })
    .mockResolvedValueOnce(synthesisReview(prose(passEvidence)));
  expect(await finalizeSynthesisMeaning(value, candidate)).toMatchObject({ synthesis: { text: synthesis.text } });
  expect(generate.mock.calls[1][0].input).toContain("按原结构返回完整审校结果");
  value.trace.finish("success");
  expect(lastTrace().checks[0]).toMatchObject({ reviewIssues: [{ code: "output_truncated" }] });
});

it("routes a substantive rejection with multiple defects to prose repair and rechecks the changed text", async () => {
  const issues = ["第二段没有说明等待为何还能成立。", "最后一句把离别的后果写成相反方向。"];
  const updated = { synthesis: { ...synthesis, text: synthesis.text.replace("不可回头", "暂时不能回头") }, outputText: "updated" };
  const repair = vi.fn().mockResolvedValue(updated);
  generate.mockResolvedValueOnce(synthesisReview({ pass: false, issues }))
    .mockResolvedValueOnce(synthesisReview(prose(passEvidence)));
  expect(await finalizeSynthesisMeaning(synthesisInput(), candidate, repair)).toMatchObject({ outputText: updated.outputText, synthesis: { text: updated.synthesis.text } });
  expect(repair).toHaveBeenCalledExactlyOnceWith(issues, candidate);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0].input).toContain(updated.synthesis.text.replace("\n", "\\n"));
  expect(generate.mock.calls[1][0].input).not.toContain("上次审校回包未通过核验");
});

it("lets a targeted correction uncover a substantive rejection without releasing unsupported prose", async () => {
  const value = synthesisInput();
  const repair = vi.fn().mockResolvedValue(null);
  const issue = "正文提出停顿，却没有说明它怎样改变人物对离别的理解。";
  generate.mockResolvedValueOnce(synthesisReview(prose({ ...passEvidence, useB: { unit: "B1" } })))
    .mockResolvedValueOnce(respond({ pass: false, issues: [issue] }));
  expect(await finalizeSynthesisMeaning(value, candidate, repair)).toBeNull();
  expect(repair).toHaveBeenCalledExactlyOnceWith([issue], candidate);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("does not accept a numbered range that exceeds the exact quote limit", async () => {
  const value = synthesisInput();
  const source = { ...orderedSources[0], text: "听院里的人说".repeat(20) + "。" + "他们在等待消息".repeat(18) + "。" };
  value.sources = [source, orderedSources[1]];
  generate.mockResolvedValue(synthesisReview(prose(passEvidence)));
  await expect(finalizeSynthesisMeaning(value, candidate)).rejects.toBeInstanceOf(ReviewerProtocolError);
  value.trace.finish("reviewer_protocol_error");
  expect(lastTrace().checks[0]).toMatchObject({ reviewIssues: [{ code: "evidence_too_long", field: "sourceA" }] });
});

const proposalA = "可以把活动照片发布到公开新闻页";
const proposalB = "将采访稿转发给合作方";
const permissionA = "摄影师已明确许可把活动照片发布到公开新闻页。";
const permissionB = "采访者只同意在组内复盘中阅读采访稿。";
const disclosureText = `${proposalA}并${proposalB}。这两种材料承担不同职责。`;
const disclosureEvidence = { sourceA: permissionA, sourceB: permissionB,
  useA: proposalA, useB: proposalB, consequence: disclosureText };
const disclosureCandidate = { synthesis: { ...synthesis, text: disclosureText }, outputText: "disclosure" };
const disclosureInput = () => ({ ...synthesisInput(), sources: [
  { ...orderedSources[0], text: permissionA }, { ...orderedSources[1], text: permissionB }
] });
const allowedPhoto = { at: "R", action: proposalA, decision: "proceed", use: "活动照片发布到公开新闻页",
  basis: { owner: "A", quote: permissionA, scope: "把活动照片发布到公开新闻页" }, gaps: [] };
const unsupportedInterview = { at: "R", action: proposalB, decision: "proceed", use: "合作方收到采访稿",
  basis: { owner: "B", quote: permissionB, scope: "在组内复盘中阅读采访稿" }, gaps: ["audience"] };

it.each(["none", [], [allowedPhoto], [{ ...allowedPhoto, action: { unit: "R1" } }]])(
  "does not let an empty or incomplete action review pass (%j)", async authorization => {
    const value = disclosureInput();
    const repair = vi.fn().mockResolvedValue(null);
    generate.mockResolvedValueOnce(synthesisReview({ ...prose(disclosureEvidence), authorization }))
      .mockResolvedValueOnce(respond({ pass: true, issues: [], authorization: [allowedPhoto, unsupportedInterview] }));
    expect(await finalizeSynthesisMeaning(value, disclosureCandidate, repair)).toBeNull();
    expect(repair).toHaveBeenCalledWith([expect.stringContaining(proposalB)], disclosureCandidate);
    expect(generate).toHaveBeenCalledTimes(2);
    value.trace.finish("invalid_output");
    const trace = lastTrace();
    expect(trace.checks[0].reviewIssues[0]).toMatchObject({ field: "authorization" });
    expect(trace.checks[1].reviewIssues).toEqual([{ code: "authorization_scope_violation", field: "authorization" }]);
    expect(JSON.stringify(trace)).not.toContain(permissionB);
  }
);

it("checks authority ownership independently of the ordinary source evidence", async () => {
  const value = disclosureInput();
  const wrongOwner = { ...allowedPhoto, basis: { ...allowedPhoto.basis, owner: "U" } };
  const candidate = { ...disclosureCandidate, synthesis: { ...synthesis, text: proposalA + "。" } };
  const evidence = { ...disclosureEvidence, useB: proposalA, consequence: candidate.synthesis.text };
  generate.mockResolvedValueOnce(synthesisReview({ ...prose(evidence), authorization: [wrongOwner] }))
    .mockResolvedValueOnce(respond({ pass: true, issues: [], authorization: [allowedPhoto] }));
  expect(await finalizeSynthesisMeaning(value, candidate)).toMatchObject({ synthesis: { text: candidate.synthesis.text } });
  value.trace.finish("success");
  expect(lastTrace().checks[0].reviewIssues).toEqual([{ code: "wrong_evidence_owner", field: "authorization" }]);
});

it("blocks an exact internal-only quote offered as approval to share with the public", async () => {
  const text = "可以把采访稿发布到公开新闻页。";
  const candidate = { ...disclosureCandidate, synthesis: { ...synthesis, text } };
  const row = { ...unsupportedInterview, action: text, use: "将采访稿发布给公众", gaps: [] };
  const evidence = { ...disclosureEvidence, useA: text, useB: text, consequence: text };
  const repair = vi.fn().mockResolvedValue(null);
  generate.mockResolvedValueOnce(synthesisReview({ ...prose(evidence), authorization: [row] }));
  expect(await finalizeSynthesisMeaning(disclosureInput(), candidate, repair)).toBeNull();
  expect(repair).toHaveBeenCalledWith([expect.stringContaining("只允许内部使用")], candidate);
  expect(generate).toHaveBeenCalledOnce();
});

it.each([["permission_hold", false], ["hold", true]])(
  "distinguishes denying existing permission from choosing to hold (%s)", async (decision, canPass) => {
    const text = canPass ? "活动照片已获许可，版面不足所以先不用。" : "活动照片缺少公开发布许可，所以先不用。";
    const candidate = { ...disclosureCandidate, synthesis: { ...synthesis, text } };
    const evidence = { ...disclosureEvidence, useA: text, useB: text, consequence: text };
    generate.mockResolvedValueOnce(synthesisReview({
      ...prose(evidence), authorization: [{ ...allowedPhoto, action: text, decision }]
    }));
    const repair = vi.fn().mockResolvedValue(null);
    const result = await finalizeSynthesisMeaning(disclosureInput(), candidate, repair);
    expect(Boolean(result)).toBe(canPass);
    if (canPass) expect(repair).not.toHaveBeenCalled();
    else expect(repair).toHaveBeenCalledWith([expect.stringContaining("原文已覆盖该动作")], candidate);
  }
);

it("checks the use presumed by a deferred question", async () => {
  const reason = "活动照片与组内采访稿没有提供共同主题。";
  const question = "怎么把组内采访稿发布到公开新闻页？";
  const deferred = { deferred: { reason, question }, outputText: "deferred" };
  const evidence = { sourceA: permissionA, sourceB: permissionB, gap: reason, opening: question };
  const repair = vi.fn().mockResolvedValue(null);
  generate.mockResolvedValueOnce(respond({ ...prose(evidence), authorization: [{
    ...unsupportedInterview, at: "Q", action: question, use: "在公开新闻页发布采访稿"
  }] }));
  expect(await finalizeSynthesisMeaning(disclosureInput(), deferred, repair)).toBeNull();
  expect(repair).toHaveBeenCalledWith([expect.stringContaining(question)], deferred);
});

it.each(["none", "wish", "grant", "revoked"])(
  "checks an independently inventoried action expressed without permission keywords (%s)", async verdict => {
    const action = "今晚把她的谈话挂到网站上";
    const wish = "网页编辑希望首页出现这段谈话。";
    const grant = "讲述者亲自确认这段谈话可刊在首页，供任何读者浏览。";
    const withdrawal = "讲述者刚撤回首页刊出谈话的同意。";
    const other = "录音留存在工作室，工作人员可在现场听。";
    const value = { ...synthesisInput(), sources: [
      { ...orderedSources[0], text: wish },
      { ...orderedSources[1], text: other }
    ], authorizationUserMaterial: verdict === "revoked" ? `${grant}\n${withdrawal}` : verdict === "grant" ? grant : "" };
    const next = {
      synthesis: { ...synthesis, text: `${action}。让读者在入口看到经验的细节。` },
      outputText: "web",
      authorizationFocus: [{ action, nonGrants: [wish], ...(verdict === "revoked" ? { withdrawn: withdrawal } : {}) }]
    };
    const evidence = { sourceA: wish, sourceB: other, useA: action, useB: action, consequence: action };
    const authorization = verdict === "none" ? "none" : [{
      action, decision: "proceed", use: "首页刊出谈话供外部读者浏览",
      basis: verdict === "wish"
        ? { owner: "A", quote: wish, scope: "网页编辑希望首页出现这段谈话" }
        : { owner: "U", quote: { unit: "U1" }, scope: "这段谈话可刊在首页，供任何读者浏览" },
      gaps: []
    }];
    const repair = vi.fn().mockResolvedValue(null);
    generate.mockResolvedValue(synthesisReview({ ...prose(evidence), authorization }));
    if (verdict === "none") {
      await expect(finalizeSynthesisMeaning(value, next, repair)).rejects.toBeInstanceOf(ReviewerProtocolError);
      expect(generate).toHaveBeenCalledTimes(2);
      expect(repair).not.toHaveBeenCalled();
    } else if (verdict === "wish" || verdict === "revoked") {
      expect(await finalizeSynthesisMeaning(value, next, repair)).toBeNull();
      expect(repair).toHaveBeenCalledWith([
        expect.stringContaining(verdict === "wish" ? "原文没有授予这项使用" : "对应许可已被撤回")
      ], next);
    } else {
      expect(await finalizeSynthesisMeaning(value, next, repair)).toMatchObject({ synthesis: { text: next.synthesis.text } });
      expect(repair).not.toHaveBeenCalled();
    }
  }
);

it("keeps backup and restore verification in the ordinary evidence protocol", async () => {
  const action = "先取得异地副本再验证可恢复";
  const body = { ...candidate, synthesis: { ...synthesis, text: action + "。" },
    authorizationFocus: [{ action, nonGrants: [orderedSources[0].text] }] };
  const evidence = { sourceA: orderedSources[0].text, sourceB: orderedSources[1].text,
    useA: action, useB: action, consequence: action };
  generate.mockResolvedValueOnce(synthesisReview(prose(evidence)));
  expect(await finalizeSynthesisMeaning(synthesisInput(), body)).toMatchObject({ synthesis: { text: body.synthesis.text } });
  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0][0].input).not.toContain("复核下列动作");
});

it.each(["none", "confirmed"])("honors independent audit discovery on its same-text retry (%s)", async correction => {
  const action = "今晚把她的谈话挂到网站上";
  const grant = "讲述者已亲自确认网站可以刊出谈话。";
  const value = { ...synthesisInput(), authorizationUserMaterial: grant };
  const body = { ...candidate, synthesis: { ...synthesis, text: action + "。" } };
  const evidence = { sourceA: orderedSources[0].text, sourceB: orderedSources[1].text,
    useA: action, useB: action, consequence: action };
  generate.mockResolvedValueOnce(synthesisReview({ ...prose(evidence), authorization: "review" }))
    .mockResolvedValueOnce(respond({ pass: true, issues: [], authorization: correction === "none" ? "none" : [{
      action, decision: "proceed", use: "刊出谈话供网站读者浏览",
      basis: { owner: "U", quote: grant, scope: "网站可以刊出谈话" }, gaps: []
    }] }));
  if (correction === "none") {
    await expect(finalizeSynthesisMeaning(value, body)).rejects.toBeInstanceOf(ReviewerProtocolError);
  } else {
    expect(await finalizeSynthesisMeaning(value, body)).toMatchObject({ synthesis: { text: body.synthesis.text } });
  }
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0].input).toContain("授权核对使用的用户原文U=");
});

it.each([false, true])("checks changed publication separately from continued authorized playback (%s)", async allowed => {
  const published = "首页可改为书面摘引或转述";
  const local = "原声仍只在馆内展厅播放";
  const oldGrant = "她签的只是馆内播放原声。";
  const newGrant = "她书面同意在首页刊出这段谈话的摘引或转述。";
  const reason = "这里要区分的是“保留叙述”与“公开原声”";
  const text = `${reason}：${published}，保留她的搬迁经验，${local}。`;
  const sources = [{ ...orderedSources[0], text: "第一人称细节让人记住搬迁当天。" },
    { ...orderedSources[1], text: allowed ? oldGrant + newGrant : oldGrant }];
  const value = { ...synthesisInput(), sources };
  const candidate = { synthesis: { ...synthesis, text }, outputText: "publication" };
  const review = {
    ...prose({ sourceA: sources[0].text, sourceB: { unit: "B1" }, useA: "保留她的搬迁经验", useB: local, consequence: text }),
    authorization: allowed ? [{
      action: published, decision: "proceed", use: "首页以书面摘引或转述保留搬迁叙述",
      basis: { owner: "B", quote: { unit: "B2" }, scope: "在首页刊出这段谈话的摘引或转述" }, gaps: []
    }, {
      action: local, decision: "proceed", use: "仅馆内播放原声",
      basis: { owner: "B", quote: { unit: "B1" }, scope: "只是馆内播放原声" }, gaps: []
    }] : [{
      action: { unit: "R1" }, decision: "proceed", use: "首页以书面摘引或转述保留搬迁叙述，原声仍只在馆内展厅播放",
      basis: { owner: "B", quote: { unit: "B1" }, scope: "馆内播放原声的授权范围内；书面摘引或转述不涉及原声公开" }, gaps: []
    }]
  };
  generate.mockResolvedValueOnce(synthesisReview(review));
  const repair = vi.fn().mockResolvedValue(null);
  const result = await finalizeSynthesisMeaning(value, candidate, repair);
  if (allowed) {
    expect(result).toMatchObject({ synthesis: { text } });
    expect(repair).not.toHaveBeenCalled();
  } else {
    expect(result).toBeNull();
    expect(repair).toHaveBeenCalledWith([expect.stringContaining("保留已获准的原用法，新形式在另获许可前先暂缓")], candidate);
  }
  expect(generate).toHaveBeenCalledOnce();
});

const oralSourceA = "她只用一句「我把铺子门上的钉子拔掉，手里还捏着钥匙」讲清了搬迁那天。其他材料都来自会议简报。我们很想在首页留住一个摊贩的叙述。";
const oralSourceB = "她签的只是馆内播放原声。家人说熟悉的人很容易认出来，网页一旦被下载，馆方即使下架也收不回那些副本。";
const oralGrant = "后来她另以书面明确同意在公开首页刊出这句文字摘引。";
const oralExcerpt = "首页可保留「拔掉门上钉子，手里还捏着钥匙」这句摘引";
const oralBoundary = "在此之前不把声音放上开放网站";
const oralText = `甲点出首页需要一个摊贩的第一人称声音，乙点出她只签了馆内播放原声，而网页文件可被下载转发、下架也收不回。两者合成后的判断是：公开版应以她的授权范围定形式，而非以原声定位置。${oralExcerpt}，标明来自展厅口述，用文字延续第一人称，原声仍限馆内。若要在网页播放原声，须先取得她本人或家属对公开、下载、转发的许可，并核对撤回条件；${oralBoundary}。代价是首页失去原声质感，但搬迁的第一手位置与她的播放边界同时成立。`;
const oralFocus = [
  { action: "把原声放上开放网站", nonGrants: ["她签的只是馆内播放原声"] },
  { action: "在首页使用这句摘引", nonGrants: ["馆内展厅播放原声的同意不当然覆盖网页公开"] }
];
const oralEvidence = { sourceA: { unit: "A1" }, sourceB: { unit: "B1" },
  useA: "甲点出首页需要一个摊贩的第一人称声音", useB: "乙点出她只签了馆内播放原声", consequence: oralExcerpt };
const oralRowF1 = {
  focus: "F1", action: oralBoundary, decision: "hold", use: "在开放网站播原声",
  basis: { owner: "B", quote: { unit: "B1" }, scope: "馆内播放原声" }, gaps: ["channel", "audience"]
};
const oralRowF2 = {
  focus: "F2", action: oralExcerpt, decision: "proceed", use: "以书面摘引向网站公众发布证言",
  basis: { owner: "B", quote: { unit: "B1" }, scope: "馆内播放原声" }, gaps: []
};
const oralInput = (grant = "") => ({ ...synthesisInput(), sources: [
  { ...orderedSources[0], text: oralSourceA }, { ...orderedSources[1], text: oralSourceB + grant }
] });

it("maps both real historical paraphrases on a same-text protocol retry before correcting the changed form", async () => {
  const original = { synthesis: { ...synthesis, text: oralText }, outputText: "original", authorizationFocus: oralFocus };
  const repairedText = "甲重视第一人称细节，乙说许可仅限于馆内原声。首页先用团队自己的说明，暂不刊发她的原话或声音。馆内按现有许可播放，仍能在展厅保留现场的第一人称经验。";
  const repaired = { synthesis: { ...synthesis, text: repairedText }, outputText: "repaired" };
  const repair = vi.fn().mockResolvedValue(repaired);
  generate.mockResolvedValueOnce(synthesisReview(prose(oralEvidence)))
    .mockResolvedValueOnce(respond({ pass: true, issues: [], authorization: [oralRowF1, oralRowF2] }))
    .mockResolvedValueOnce(synthesisReview({
      ...prose({ ...oralEvidence, useA: "甲重视第一人称细节", useB: "乙说许可仅限于馆内原声", consequence: "首页先用团队自己的说明" }),
      authorization: [
        { focus: "F1", action: "暂不刊发她的原话或声音", decision: "not_adopted", reason: "正文排除网站播放原声" },
        { focus: "F2", action: "首页先用团队自己的说明", decision: "not_adopted", reason: "首页改用团队说明" }
      ]
    }));

  expect(await finalizeSynthesisMeaning(oralInput(), original, repair)).toMatchObject({ synthesis: { text: repairedText } });
  expect(repair).toHaveBeenCalledWith([expect.stringContaining("不能假定他人有权代签")], original);
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate.mock.calls[1][0].input).toContain("authorization 的空数组是占位");
});

it("adopts the remapped text action when the speaker has granted the same public use", async () => {
  const text = oralText.replace("她本人或家属", "她本人");
  const original = { synthesis: { ...synthesis, text }, outputText: "original", authorizationFocus: oralFocus };
  generate.mockResolvedValueOnce(synthesisReview({ ...prose(oralEvidence), authorization: [oralRowF1, {
    ...oralRowF2, basis: { owner: "B", quote: { unit: "B3" }, scope: "在公开首页刊出这句文字摘引" }
  }] }));
  expect(await finalizeSynthesisMeaning(oralInput(oralGrant), original)).toMatchObject({ synthesis: { text } });
  expect(generate).toHaveBeenCalledOnce();
});

it.each(["none", "missing", "paraphrase", "wrong-owner"])("rejects an incomplete focus remapping (%s)", async kind => {
  const original = { synthesis: { ...synthesis, text: oralText }, outputText: "original", authorizationFocus: oralFocus };
  const authorization = kind === "none" ? kind
    : kind === "missing" ? [oralRowF1]
    : [oralRowF1, { ...oralRowF2, decision: "hold",
      action: kind === "paraphrase" ? oralFocus[1].action : { unit: "B1" }, at: "R" }];
  generate.mockResolvedValue(synthesisReview({ ...prose(oralEvidence), authorization }));
  await expect(finalizeSynthesisMeaning(oralInput(), original)).rejects.toBeInstanceOf(ReviewerProtocolError);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("reanchors the live granted example without mistaking an adjacent authorized form for a violation", async () => {
  const grantedText = "开放网站首页可用的只是那句拔钉子捏钥匙的文字引语";
  const text = `她把两件事拆得很清楚：馆内播放原声的授权未变，${grantedText}，并须标明出自她在展厅的口述。今晚公开版可按此区分制作，原声留在展厅。`;
  const textGrant = "明确同意博物馆在开放网站首页介绍旧市场搬迁时用那句拔钉子捏钥匙的文字引语，只要标明是她在展厅口述的原话";
  const audioGrant = "她仍只允许在馆内播放原声";
  const value = { ...oralInput(), authorizationUserMaterial: textGrant + "。" + audioGrant + "。" };
  const original = {
    synthesis: { ...synthesis, text }, outputText: "granted",
    authorizationFocus: [{ action: "在开放网站首页介绍旧市场搬迁时用那句拔钉子捏钥匙的文字引语", nonGrants: [audioGrant] }]
  };
  const grants = [{
    action: { unit: "R1" }, decision: "proceed",
    use: "在开放网站首页介绍旧市场搬迁时使用那句拔钉子捏钥匙的文字引语，面向网页访客，并标明是她在展厅口述的原话",
    basis: { owner: "U", quote: { unit: "U1" }, scope: textGrant }, gaps: []
  }, {
    action: { unit: "R2" }, decision: "proceed", use: "在馆内展厅播放原声",
    basis: { owner: "U", quote: { unit: "U2" }, scope: audioGrant }, gaps: []
  }];
  const metadata = { ...verified, change: null };
  const evidence = { sourceA: { unit: "A1" }, sourceB: { unit: "B1" }, useA: grantedText, useB: "馆内播放原声的授权未变",
    consequence: "今晚公开版可按此区分制作" };
  generate.mockResolvedValueOnce(respond({ ...metadata, prose: { ...prose(evidence), authorization: grants } }))
    .mockResolvedValueOnce(respond({ pass: true, issues: [], authorization: [
      { ...grants[0], focus: "F1", action: grantedText },
      { ...grants[1], action: "原声留在展厅" }
    ] }));
  const repair = vi.fn();
  expect(await finalizeSynthesisMeaning(value, original, repair)).toMatchObject({ synthesis: { text } });
  expect(repair).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[0][0].input).toContain("不添加 synthesis 外壳");
  expect(generate.mock.calls[1][0].input).toContain("动作引文混入另一种用法");
  value.trace.finish("success");
  expect(lastTrace().checks[0].reviewIssues).toContainEqual({ code: "authorization_action_too_broad", field: "authorization" });
});

it.each(["granted", "held", "wrong-grant"])("checks different uses sharing the same sentence without conflating their permissions (%s)", async mode => {
  const textGrant = "明确同意博物馆在开放网站首页介绍旧市场搬迁时用那句拔钉子捏钥匙的文字引语，只要标明是她在展厅口述的原话";
  const audioGrant = "她仍只允许在馆内播放原声";
  const text = mode === "held"
    ? "首页先不发原声，文字引语也要另获公开许可才使用。"
    : "今晚公开版可首页用该文字引语并注明来源，原声只留展厅；馆内播放授权不能扩到网页或音频发布。";
  const value = { ...oralInput(), authorizationUserMaterial: (mode === "granted" ? textGrant + "。" : "") + audioGrant + "。" };
  const audioEvidence = { owner: "U", quote: { unit: mode === "granted" ? "U2" : "U1" }, scope: audioGrant };
  const original = { synthesis: { ...synthesis, text }, outputText: "shared",
    authorizationFocus: [
      { action: "在开放网站公开文字引语", nonGrants: [audioGrant] },
      { action: mode === "held" ? "向网站访客播放访谈原声" : "在馆内展厅播放受访者原声", nonGrants: [] }
    ] };
  const evidence = { sourceA: { unit: "A1" }, sourceB: { unit: "B1" }, useA: { unit: "R1" }, useB: { unit: "R1" },
    consequence: { unit: "R1" } };
  const repair = vi.fn().mockResolvedValue(null);
  generate.mockResolvedValueOnce(respond({ ...verified, change: null, prose: { ...prose(evidence), authorization: [{
    focus: "F1", action: { unit: "R1" }, decision: mode === "held" ? "conditional" : "proceed",
    use: "在开放网站首页使用文字引语，面向网页访客",
    basis: mode === "granted" ? { owner: "U", quote: { unit: "U1" }, scope: textGrant }
      : audioEvidence,
    gaps: mode === "held" ? ["permission", "form", "channel", "audience"] : []
  }, {
    focus: "F2", action: { unit: "R1" }, decision: mode === "held" ? "hold" : "proceed",
    use: mode === "held" ? "将原声网上发布" : "在馆内展厅播放受访者原声，面向到馆观众",
    basis: audioEvidence, gaps: mode === "held" ? ["channel", "audience"] : []
  }] } }));
  const result = await finalizeSynthesisMeaning(value, original, repair);
  if (mode === "wrong-grant") {
    expect(result).toBeNull();
    expect(repair).toHaveBeenCalledWith([expect.stringContaining("所引原文没有授予这项使用")], original);
  } else {
    expect(result).toMatchObject({ synthesis: { text } });
    expect(repair).not.toHaveBeenCalled();
  }
  expect(generate).toHaveBeenCalledOnce();
});

it("accepts the live second review that expands one focus into two independently authorized uses", async () => {
  const statement = "公开版据此用文字引语并加标注，原声留展厅。";
  const textGrant = "受访者刚亲自发来了更新，明确同意博物馆在开放网站首页介绍旧市场搬迁时用那句拔钉子捏钥匙的文字引语，只要标明是她在展厅口述的原话。";
  const audioGrant = "她仍只允许在馆内播放原声。";
  const value = { ...oralInput(), authorizationUserMaterial: textGrant + audioGrant };
  const original = { synthesis: { ...synthesis, text: statement }, outputText: "granted",
    authorizationFocus: [{
      action: "在开放网站首页介绍旧市场搬迁时用那句拔钉子捏钥匙的文字引语",
      nonGrants: ["她签的只是馆内播放原声"]
    }] };
  const rows = [{
    focus: "F1", action: { unit: "R1" }, decision: "proceed",
    use: "在开放网站首页介绍旧市场搬迁时，以文字形式引用那句拔钉子捏钥匙的话，并标明是她在展厅口述的原话；受众为公开网站访客",
    basis: { owner: "U", quote: { unit: "U1" }, scope: "明确同意博物馆在开放网站首页介绍旧市场搬迁时用那句拔钉子捏钥匙的文字引语，只要标明是她在展厅口述的原话" }, gaps: []
  }, {
    focus: "F1", action: { unit: "R1" }, decision: "proceed",
    use: "原声仅在馆内展厅播放，不随网页公开版发布或供下载转发",
    basis: { owner: "U", quote: { unit: "U2" }, scope: "她仍只允许在馆内播放原声" }, gaps: []
  }];
  const evidence = { sourceA: { unit: "A1" }, sourceB: { unit: "B1" },
    useA: { unit: "R1" }, useB: { unit: "R1" }, consequence: { unit: "R1" } };
  generate.mockResolvedValueOnce(respond({ ...verified, change: null, prose: { ...prose(evidence), authorization: rows.map(row =>
    ({ ...row, action: row.basis.quote })) } }))
    .mockResolvedValueOnce(respond({ pass: true, issues: [], authorization: rows }));
  const repair = vi.fn();
  expect(await finalizeSynthesisMeaning(value, original, repair)).toMatchObject({ synthesis: { text: statement } });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(repair).not.toHaveBeenCalled();
});

it.each(["missing", "adjacent", "granted"])("requires the body to gate the same use when permission is absent (%s)", async mode => {
  const waiting = "另获网页文字摘引或转述的公开许可后再使用。";
  const text = mode === "granted"
    ? "今晚公开版应只放这段标明出处的文字引语，不嵌原声，也不提供可下载音频。"
    : mode === "adjacent" ? "首页可保留文字摘引或转述的位置，原声仍限于展厅播放；" + waiting
      : "今晚可先在公开版保留文字摘引或转述，让首页仍有摊贩的搬迁叙述，原声仍限于展厅播放；这样舍弃的是嗓音质感，却不让可识别声音进入不可撤回的下载传播。";
  const phrase = mode === "granted" ? "在公开网站首页使用文字引语" : "在首页以文字保留这段叙述";
  const value = oralInput(mode === "granted" ? oralGrant : "");
  const original = { synthesis: { ...synthesis, text }, outputText: "gate", authorizationFocus: [
    { action: "把原声放上开放网站", nonGrants: [] }, { action: phrase, nonGrants: [] }
  ] };
  const evidence = { sourceA: { unit: "A1" }, sourceB: { unit: "B1" }, useA: { unit: "R1" }, useB: { unit: "R1" },
    consequence: { unit: "R1" } };
  generate.mockResolvedValueOnce(respond({ ...verified, change: null, prose: {
    ...prose(evidence), authorization: [{
      focus: "F1", action: { unit: "R1" }, decision: "permission_hold",
      use: "把原声放上开放网站，供访客下载、转发",
      basis: { owner: "B", quote: { unit: "B1" }, scope: "她签的只是馆内播放原声" },
      gaps: ["channel", "audience", "form"]
    }, {
      focus: "F2", action: { unit: "R1" }, decision: mode === "granted" ? "proceed" : "conditional",
      use: mode === "granted" ? "在公开版首页使用文字引语" : "在公开版首页以文字摘引或转述保留搬迁叙述，面向网页访客",
      ...(mode === "adjacent" ? { gate: { unit: "R2" } } : {}),
      basis: mode === "granted"
        ? { owner: "B", quote: { unit: "B3" }, scope: "在公开首页刊出这句文字摘引" }
        : { owner: "B", quote: { unit: "B1" }, scope: "她签的只是馆内播放原声" },
      gaps: mode === "granted" ? [] : ["permission"]
    }]
  } }));
  const repair = vi.fn().mockResolvedValue(null);
  const result = await finalizeSynthesisMeaning(value, original, repair);
  if (mode === "missing") {
    expect(result).toBeNull();
    expect(repair).toHaveBeenCalledWith([expect.stringContaining("今晚可先在公开版保留文字摘引或转述")], original);
  } else {
    expect(result).toMatchObject({ synthesis: { text } });
    expect(repair).not.toHaveBeenCalled();
  }
  expect(generate).toHaveBeenCalledOnce();
});

it.each(["discovered", "uncovered", "malformed"])("distinguishes advisory additional focus labels from missing obligations (%s)", async mode => {
  const release = "公开版据此用文字引语并加标注";
  const playback = "原声仍只在馆内播放";
  const text = `${release}，${playback}。`;
  const value = oralInput(oralGrant);
  const original = { synthesis: { ...synthesis, text }, outputText: "grant",
    authorizationFocus: [{ action: "在公开网站首页使用文字摘引", nonGrants: ["她签的只是馆内播放原声"] }] };
  const evidence = { sourceA: { unit: "A1" }, sourceB: { unit: "B1" }, useA: release, useB: playback, consequence: text };
  generate.mockResolvedValue(respond({ ...verified, change: null, prose: { ...prose(evidence), authorization: [{
    focus: mode === "uncovered" ? "F3" : "F1", action: release, decision: "proceed", use: "公开版使用文字引语",
    basis: { unit: "B3" }, gaps: []
  }, {
    focus: mode === "malformed" ? "verified" : "F5", action: playback, decision: "proceed", use: "延续馆内原声播放",
    basis: { unit: "B1" }, gaps: []
  }] } }));
  if (mode === "discovered") {
    expect(await finalizeSynthesisMeaning(value, original)).toMatchObject({ synthesis: { text } });
    expect(generate).toHaveBeenCalledOnce();
  } else {
    await expect(finalizeSynthesisMeaning(value, original)).rejects.toBeInstanceOf(ReviewerProtocolError);
    expect(generate).toHaveBeenCalledTimes(2);
  }
});

it("keeps confirmed evidence when a same-text patch includes unrelated empty placeholders", async () => {
  generate.mockResolvedValueOnce(synthesisReview(prose({ ...passEvidence, consequence: "" })))
    .mockResolvedValueOnce(respond({ pass: true, issues: [], evidence: {
      sourceA: "", sourceB: "", useA: "", useB: "", consequence: passEvidence.consequence
    } }));
  expect(await finalizeSynthesisMeaning(synthesisInput(), candidate)).toMatchObject({ synthesis: { text: synthesis.text } });
  expect(generate).toHaveBeenCalledTimes(2);
});

it.each(["scope", "ordinary", "unknown-action", "truncated"])(
  "recovers only grounded authorization issues after exhausting same-text correction (%s)", async kind => {
    const action = "可把馆内播放与网页公开分开：展厅继续播原声，首页用家属核对过、不暴露声音与身份的摘引或转述来保留这句细节";
    const substitute = "前提是摘引同样经家属确认，若家属核对未完成，就先只保留馆内播放";
    const text = `${action}。${substitute}。`;
    const original = { synthesis: { ...synthesis, text }, outputText: "wrong-grant",
      authorizationFocus: [{ action: "首页以家属核对的匿名文字转述", nonGrants: ["她签的只是馆内播放原声"] }] };
    const candidateEvidence = { sourceA: { unit: "A1" }, sourceB: { unit: kind === "ordinary" ? "X1" : "B1" },
      useA: { unit: "R1" }, useB: { unit: "R2" }, consequence: { unit: "R1" } };
    const row = { focus: "F1", action: { unit: kind === "unknown-action" ? "X1" : "R1" }, decision: "conditional",
      use: "首页使用经家属核对、不暴露声音与身份的摘引或转述", basis: { unit: "R2" }, gaps: ["permission", "condition"] };
    const first = respond({ ...verified, change: null, prose: { ...prose(candidateEvidence), authorization: [row] } });
    const second = respond({ pass: true, issues: [], authorization: [row, {
      ...row, action: { unit: "R2" }, use: "家属核对未完成时仅保留馆内播放，暂不公开摘引"
    }] });
    generate.mockResolvedValueOnce(first).mockResolvedValueOnce(kind === "truncated" ? { ...second, truncated: true } : second);

    const safeText = "今晚不在网页摘引或转述她的话。保留馆内原声播放，首页只介绍展讯。";
    const safe = { synthesis: { ...synthesis, text: safeText }, outputText: "safe" };
    const repair = vi.fn().mockResolvedValue(safe);
    generate.mockResolvedValueOnce(respond({ ...verified, change: null, prose: {
      ...prose({ sourceA: { unit: "A1" }, sourceB: { unit: "B1" }, useA: { unit: "R2" }, useB: { unit: "R2" }, consequence: { unit: "R1" } }),
      authorization: [{ focus: "F1", action: { unit: "R1" }, decision: "not_adopted", reason: "当前网页改用一般展讯" }]
    } }));

    if (kind === "scope") {
      expect(await finalizeSynthesisMeaning(oralInput(), original, repair)).toMatchObject({ synthesis: { text: safeText } });
      expect(repair).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining([
        expect.stringContaining("匿名、改写或他人核对不能替代许可")
      ]), original);
      expect(generate).toHaveBeenCalledTimes(3);
    } else {
      await expect(finalizeSynthesisMeaning(oralInput(), original, repair)).rejects.toBeInstanceOf(ReviewerProtocolError);
      expect(repair).not.toHaveBeenCalled();
      expect(generate).toHaveBeenCalledTimes(2);
    }
  }
);
