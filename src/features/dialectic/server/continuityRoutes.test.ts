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
const request = (body: object, signal?: AbortSignal) => new NextRequest("http://localhost/api/branches", { method: "POST", signal,
  body: JSON.stringify({ requestId: "test", meaningVersion: 1, userText: "怎样收束？", ...body }) });
beforeEach(() => { generate.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("recognizes a grounded restatement without labelling the other branch a repeat", async () => {
  const review = { status: "revisit", sourceId: "parent", reason: "来源已经区分有张力与无需认领的线索。", sourceEvidence: "只认领真正有张力的伏线", resultEvidence: "只把有张力的线索升格为债" };
  generate.mockResolvedValueOnce(respond({ thesis: { ...branch, stance: "正" }, antithesis: { ...branch, stance: "反" } }))
    .mockResolvedValueOnce(respond({ thesis: review, antithesis: { status: "new" } }));
  const response = await branchesPost(request({ comparisonSeeds }));
  const data = await response.json();
  expect(response.status).toBe(200); expect(data.thesis.novelty).toEqual(review); expect(data.antithesis.novelty).toEqual({ status: "new" });
  expect(generate).toHaveBeenCalledTimes(2);
});

it("does not add review calls to an initial question and bounds comparison material", async () => {
  generate.mockResolvedValue(respond({ thesis: { ...branch, stance: "正" }, antithesis: { ...branch, stance: "反" } }));
  expect((await branchesPost(request({}))).status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(1);
  expect((await branchesPost(request({ comparisonSeeds: [{ ...comparisonSeeds[0], text: "大".repeat(1201) }] }))).status).toBe(400);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("keeps readable results but suppresses claims of newness if the review fails", async () => {
  generate.mockResolvedValueOnce(respond({ thesis: { ...branch, stance: "正" }, antithesis: { ...branch, stance: "反" } })).mockRejectedValueOnce(new Error("review unavailable"));
  const response = await branchesPost(request({ comparisonSeeds }));
  expect(response.status).toBe(200); expect((await response.json()).thesis.novelty.status).toBe("unchecked");
});

it("cancels the continuation instead of committing an unchecked result after caller abort", async () => {
  const abort = new AbortController();
  generate.mockResolvedValueOnce(respond({ thesis: { ...branch, stance: "正" }, antithesis: { ...branch, stance: "反" } }))
    .mockImplementationOnce(async ({ signal }) => { abort.abort(); signal.throwIfAborted(); });
  expect((await branchesPost(request({ comparisonSeeds }, abort.signal))).status).toBe(499);
});

it("bounds the extra review wait while preserving an already generated result", async () => {
  vi.useFakeTimers();
  generate.mockResolvedValueOnce(respond({ thesis: { ...branch, stance: "正" }, antithesis: { ...branch, stance: "反" } }))
    .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
  const pending = branchesPost(request({ comparisonSeeds }));
  await vi.advanceTimersByTimeAsync(6001);
  const response = await pending;
  expect(response.status).toBe(200); expect((await response.json()).thesis.novelty.status).toBe("unchecked");
  expect(generate).toHaveBeenCalledTimes(2);
});

it("generates one focused response from an exact quote and the user's question", async () => {
  generate.mockResolvedValue(respond({ inquiry: branch }));
  const origin = { sourceNodeId: "a", quote: "其余留在背景。", intent: "premise", question: "哪些背景仍值得保留？" };
  const response = await inquiryPost(request({ sourceText: comparisonSeeds[0].text, origin }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ requestId: "test", inquiry: branch });
  expect(generate).toHaveBeenCalledTimes(1);
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
