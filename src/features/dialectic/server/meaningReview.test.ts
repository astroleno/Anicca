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
const prose = (evidence: object) => ({ pass: true, issues: [], evidence, authorization: "none" });
const synthesisReview = (value: unknown) => respond({ synthesis: { ...verified, change: null, prose: value } });
const lastTrace = () => JSON.parse(String(vi.mocked(console.info).mock.calls.at(-1)?.[0]).slice("anicca.generation ".length));

it("accepts only consecutive source and result units, preserving Unicode quotes and intervening newlines", async () => {
  generate.mockResolvedValueOnce(synthesisReview(prose(passEvidence)));
  const result = await finalizeSynthesisMeaning(synthesisInput(), candidate);
  expect(result).toMatchObject({ synthesis: { text: synthesis.text } });
  expect(generate).toHaveBeenCalledOnce();
  const prompt = generate.mock.calls[0][0].input as string;
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
  basis: { owner: "A", quote: permissionA, scope: "公开新闻页可刊照片" }, gaps: [] };
const unsupportedInterview = { at: "R", action: proposalB, decision: "proceed", use: "合作方收到采访稿",
  basis: { owner: "B", quote: permissionB, scope: "采访稿仅限组内阅读" }, gaps: ["audience"] };

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
        : { owner: "U", quote: { unit: "U1" }, scope: "讲述者批准首页刊出谈话" },
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
