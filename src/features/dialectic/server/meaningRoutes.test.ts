import { NextRequest } from "next/server";
import { POST as synthesisPost } from "@/app/api/synthesis/route";
import { POST as branchesPost } from "@/app/api/branches/route";
import { POST as polarityPost } from "@/app/api/polarities/route";
import { defaultThinkingSpace } from "@/features/perspectives/model";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai/generateText", () => ({ generateText: generate }));
vi.mock("@/lib/openai/client", () => ({ getDialecticModel: () => "deepseek-flash", getDialecticOpenAiClient: () => ({}) }));
const deferred = { reason: "邮编处理投递区域，薄荷画作探索逆光感受，当前来源没有给出共同过程。", question: "你想把区域的概念带进画面，还是先分别探索？" };
const text = "熟悉者靠转角、气味和身体习惯找路，行动不必先经过路名；外来者偏偏需要从明显起点出发、按顺序可辨认的连续标记。真正被混淆的不是知道与不知道，而是识路与传路：本地知识以身体记忆存在时，它默认环境在场，因而不必把转角命名、把气味排成先后。讲不清由此不是能力缺陷，而是这种知识缺少面向陌生视角的转述结构。假设一位居民只被要求说说怎么走，他很可能仍按自己习惯的节点说；若让他从外来者的起点重走并逐段指出可见标记，差距才会显现。";
const synthesis = { text, summary: "识路不自动等于传路", label: "识路与传路", stance: "合", change: "把知识多少的差异改看成身体线索的转译。" };
const sources = [{ id: "a", text: "熟悉地方的人凭转角找到路。", summary: "识路", label: "识路", stance: "想法" },
  { id: "b", text: "熟悉的人可能讲不清路。", summary: "传路", label: "传路", stance: "想法" }];
const respond = (value: unknown) => ({ text: JSON.stringify(value), transport: "chat_completions" });
const meaningCheck = { label: synthesis.label, change: { text: synthesis.change, sourceId: "source-a",
  sourceEvidence: sources[0].text, resultEvidence: "熟悉者靠转角、气味和身体习惯找路" }, hypothesesSafe: true, issues: [], novelty: { status: "new" } };
const request = (body: object) => new NextRequest("http://localhost/api/synthesis", { method: "POST", body: JSON.stringify({ requestId: "request", meaningVersion: 1, rootInput: "识路与传路", sources, ...body }) });
beforeEach(() => { generate.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it("reviews a weak connection then returns a valid deferred outcome without a false synthesis", async () => {
  generate.mockResolvedValue(respond({ deferred }));
  const response = await synthesisPost(request({ connectionInput: "我还没有决定它们怎样联系。", perspective: defaultThinkingSpace() }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ requestId: "request", outcome: "deferred", deferred });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0].input).toContain("我还没有决定它们怎样联系");
});

it.each([true, false])("lets review correct either an unnecessary refusal or a forced synthesis (%s)", async (startsDeferred) => {
  generate.mockResolvedValueOnce(respond(startsDeferred ? { deferred } : { synthesis }))
    .mockResolvedValueOnce(respond(startsDeferred ? { synthesis } : { deferred }))
    .mockResolvedValueOnce(respond({ synthesis: meaningCheck }));
  const response = await synthesisPost(request({}));
  expect(response.status).toBe(200);
  const body = await response.json();
  if (startsDeferred) expect(body.synthesis.change).toBe(synthesis.change);
  else expect(body.outcome).toBe("deferred");
  expect(generate).toHaveBeenCalledTimes(startsDeferred ? 3 : 2);
});

it("rejects ambiguous or malformed outcomes after the bounded repair", async () => {
  generate.mockResolvedValue(respond({ synthesis, deferred }));
  const response = await synthesisPost(request({}));
  expect(response.status).toBe(502);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("does not ask a model to repair an oversized user connection", async () => {
  expect((await synthesisPost(request({ connectionInput: "长".repeat(2001) }))).status).toBe(400);
  expect(generate).not.toHaveBeenCalled();
});

it("accepts quantities explicitly supplied by the user's connecting note", async () => {
  generate.mockResolvedValueOnce(respond({ synthesis: { ...synthesis, text: `在用户给出的 3 天观察里，${text}` } }))
    .mockResolvedValueOnce(respond({ synthesis: { ...synthesis, text: `在用户给出的 3 天观察里，${text}` } }))
    .mockResolvedValueOnce(respond({ synthesis: meaningCheck }));
  const response = await synthesisPost(request({ connectionInput: "把 3 天的寻路观察和这些想法联系起来。" }));
  expect(response.status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(3);
  expect((await response.json()).synthesis.text).toContain("3 天");
});

it("requires an evidence-bearing change for new branch and polarity clients", async () => {
  const branch = { text: text.slice(0, 160), summary: "形成具体分歧", label: "判断", stance: "正" };
  generate.mockResolvedValue(respond({ thesis: branch, antithesis: { ...branch, stance: "反" } }));
  expect((await branchesPost(request({ userText: "怎么找到路？" }))).status).toBe(502);
  generate.mockReset();
  const pole = { text: branch.text, summary: branch.summary, label: branch.label };
  const complete = { ...pole, change: "从个人熟悉转向群体可传达的线索。" };
  const review = { ...meaningCheck, label: "传达线索", change: { text: complete.change, sourceId: "current", sourceEvidence: "怎么找到路？", resultEvidence: "熟悉者靠转角、气味和身体习惯找路" } };
  generate.mockResolvedValueOnce(respond({ negative: complete, positive: { ...complete, text: `${text.slice(0, 159)}异` } }))
    .mockResolvedValueOnce(respond({ negative: review, positive: review }));
  const response = await polarityPost(request({ userText: "怎么找到路？", perspective: defaultThinkingSpace(), axisId: "concern" }));
  expect(response.status).toBe(200);
  expect((await response.json()).negative.change).toBe(complete.change);
});
