import { NextRequest } from "next/server";
import { POST as branchesPost } from "@/app/api/branches/route";
import { POST as inquiryPost } from "@/app/api/inquiry/route";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai/generateText", () => ({ generateText: generate }));
vi.mock("@/lib/openai/client", () => ({ getDialecticModel: () => "deepseek-flash", getDialecticOpenAiClient: () => ({}) }));
const text = "只把有张力的线索升格为债，不必认领所有伏线。" + "写完一段后回看哪些细节改变了后文的选择，只认领这一部分，其余仍可留在背景。".repeat(3);
const branch = { text, summary: "认领有张力的线索", label: "认领", change: "把认领的对象明确为有张力的线索。" };
const comparisonSeeds = [{ id: "parent", label: "取舍", text: "只认领真正有张力的伏线，其余留在背景。" }];
const respond = (value: unknown) => ({ text: JSON.stringify(value), transport: "chat_completions" });
const checked = (novelty: object = { status: "new" }) => ({ label: "认领", change: null, hypothesesSafe: true, issues: [], novelty });
const thesis = { ...branch, stance: "正" };
const antithesis = { ...branch, stance: "反", text: "只认领有张力的线索需要作者能提前看见哪些细节影响后文。如果后文的选择还没定，已经显出张力的线索可能只是最醒目的，安静的细节反而会在结尾改变人物关系。此时可以先把不起眼的细节留在草稿里，等后文的选择写出来再收束。这样不必给每条线索许诺结局，也不会在草稿中先丢掉可能让结局成立的背景。" };
const prose = { pass: true, issues: [], evidence: { thesis: "只把有张力的线索升格为债", target: "只认领有张力的线索",
  premise: "需要作者能提前看见哪些细节影响后文", consequence: "等后文的选择写出来再收束" } };
const request = (body: object, signal?: AbortSignal) => new NextRequest("http://localhost/api/branches", { method: "POST", signal,
  body: JSON.stringify({ requestId: "test", meaningVersion: 1, userText: "怎样收束？", ...body }) });
beforeEach(() => { generate.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("recognizes a grounded restatement without labelling the other branch a repeat", async () => {
  const review = { status: "revisit", sourceId: "parent", reason: "来源已经区分有张力与无需认领的线索。", sourceEvidence: "只认领真正有张力的伏线", resultEvidence: "只把有张力的线索升格为债" };
  generate.mockResolvedValueOnce(respond({ thesis, antithesis }))
    .mockResolvedValueOnce(respond({ thesis: checked(review), antithesis: { ...checked(), prose } }));
  const response = await branchesPost(request({ comparisonSeeds }));
  const data = await response.json();
  expect(response.status).toBe(200); expect(data.thesis.novelty).toEqual(review); expect(data.antithesis.novelty).toEqual({ status: "new" });
  expect(generate).toHaveBeenCalledTimes(2);
});

it("checks the actual first question too and bounds comparison material", async () => {
  generate.mockResolvedValueOnce(respond({ thesis, antithesis }))
    .mockResolvedValueOnce(respond({ thesis: checked(), antithesis: { ...checked(), prose } }));
  expect((await branchesPost(request({}))).status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(2);
  expect((await branchesPost(request({ comparisonSeeds: [{ ...comparisonSeeds[0], text: "大".repeat(1201) }] }))).status).toBe(400);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("keeps both verified branches but suppresses missing optional newness metadata", async () => {
  generate.mockResolvedValueOnce(respond({ thesis, antithesis }))
    .mockResolvedValueOnce(respond({ antithesis: { prose } }));
  const response = await branchesPost(request({ comparisonSeeds }));
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.thesis).toMatchObject({ text: thesis.text, novelty: { status: "unchecked" } });
  expect(data.antithesis).toMatchObject({ text: antithesis.text, novelty: { status: "unchecked" } });
  expect(data.thesis).not.toHaveProperty("change");
  expect(data.antithesis).not.toHaveProperty("change");
  expect(generate).toHaveBeenCalledTimes(2);
});

it("cancels the continuation instead of committing an unchecked result after caller abort", async () => {
  const abort = new AbortController();
  generate.mockResolvedValueOnce(respond({ thesis, antithesis }))
    .mockImplementationOnce(async ({ signal }) => { abort.abort(); signal.throwIfAborted(); });
  expect((await branchesPost(request({ comparisonSeeds }, abort.signal))).status).toBe(499);
});

it("bounds the optional inquiry review and preserves an already generated answer without a newness claim", async () => {
  vi.useFakeTimers();
  generate.mockResolvedValueOnce(respond({ inquiry: branch }))
    .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
  const origin = { sourceNodeId: "a", quote: "其余留在背景。", intent: "premise", question: "哪些背景仍值得保留？" };
  const pending = inquiryPost(request({ sourceText: comparisonSeeds[0].text, origin }));
  await vi.advanceTimersByTimeAsync(10001);
  const response = await pending;
  expect(response.status).toBe(200);
  expect((await response.json()).inquiry).toEqual({ text, summary: branch.summary, label: branch.label });
  expect(generate).toHaveBeenCalledTimes(2);
});

it("generates one focused response from an exact quote and the user's question", async () => {
  generate.mockResolvedValueOnce(respond({ inquiry: branch })).mockResolvedValueOnce(respond({ inquiry: { ...checked(),
    change: { text: branch.change, sourceId: "a", sourceEvidence: "其余留在背景。", resultEvidence: "只把有张力的线索升格为债" } } }));
  const origin = { sourceNodeId: "a", quote: "其余留在背景。", intent: "premise", question: "哪些背景仍值得保留？" };
  const response = await inquiryPost(request({ sourceText: comparisonSeeds[0].text, origin }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ requestId: "test", inquiry: branch });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[0][0].input).toContain(origin.question);
  expect(generate.mock.calls[0][0].input).toContain(origin.quote);
});

it("rejects invented quotations without spending a model call and bounds malformed response repair", async () => {
  const origin = { sourceNodeId: "a", quote: "不在来源里面", intent: "counterexample", question: "什么情形不成立？" };
  expect((await inquiryPost(request({ sourceText: comparisonSeeds[0].text, origin }))).status).toBe(400);
  expect(generate).not.toHaveBeenCalled();
  generate.mockResolvedValue(respond({ inquiry: { ...branch, stance: "反" } }));
  expect((await inquiryPost(request({ sourceText: comparisonSeeds[0].text, origin: { ...origin, quote: "其余留在背景。" } }))).status).toBe(502);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("validates a quote's occurrence before generating an inquiry", async () => {
  const quote = "其余留在背景。", sourceText = `${quote}另一段语境。${quote}`;
  const origin = { sourceNodeId: "a", quote, quoteStart: sourceText.lastIndexOf(quote), intent: "premise", question: "这里的前提是什么？" };
  expect((await inquiryPost(request({ sourceText, origin: { ...origin, quoteStart: origin.quoteStart + 1 } }))).status).toBe(400);
  expect(generate).not.toHaveBeenCalled();
  generate.mockResolvedValueOnce(respond({ inquiry: branch })).mockResolvedValueOnce(respond({ inquiry: checked() }));
  expect((await inquiryPost(request({ sourceText, origin }))).status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("sends the selected occurrence and its full context to the model", async () => {
  const quote = "其余留在背景。";
  const opening = "🌱在草稿里先保留细节。", middle = "\n定稿时只保留能改变选择的线索：", ending = "仍要让读者看到必要条件。";
  const sourceText = `${opening}${quote}${middle}${quote}${ending}`;
  const origin = { sourceNodeId: "a", quote, intent: "premise", question: "这里的前提是什么？" };
  for (const quoteStart of [sourceText.indexOf(quote), sourceText.lastIndexOf(quote), undefined]) {
    generate.mockResolvedValueOnce(respond({ inquiry: branch })).mockResolvedValueOnce(respond({ inquiry: checked() }));
    const response = await inquiryPost(request({ sourceText, origin: { ...origin, quoteStart } }));
    expect(response.status).toBe(200);
  }
  expect(generate).toHaveBeenCalledTimes(6);
  const [first, second, legacy] = [0, 2, 4].map(index => generate.mock.calls[index][0].input);
  expect(first).toContain(`来源语境=${JSON.stringify({ 前文: opening, 选句: quote, 后文: middle + quote + ending })}`);
  expect(second).toContain(`来源语境=${JSON.stringify({ 前文: opening + quote + middle, 选句: quote, 后文: ending })}`);
  expect(first).not.toEqual(second);
  expect(legacy).toContain("原记录未保存选句位置");
  expect(legacy).toContain(`来源全文=${JSON.stringify(sourceText)}`);
  expect(legacy).not.toContain("来源语境=");
  for (const prompt of [first, second, legacy]) expect(prompt).toContain(origin.question);
});
