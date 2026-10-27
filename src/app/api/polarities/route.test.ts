import { NextRequest } from "next/server";
import { POST } from "./route";
import { defaultThinkingSpace, johariThinkingSpace } from "@/features/perspectives/model";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai/generateText", () => ({ generateText: generate }));
vi.mock("@/lib/openai/client", () => ({ getDialecticModel: () => "test-model", getDialecticOpenAiClient: () => ({}) }));

const negative = "从个体出发，探索首先需要一种能让自己的好奇持续下去的节奏。记录的价值在于帮助自己重新找到当时的问题，而不只是让经验看起来完整。假设一段创作留下了难以归档的发现，也可以先保留它与个人经历的联系，等到新的问题出现时再回看。这样长期积累保留的是重新提问的能力；若每次回看都只是确认原先的判断，就需要重新检查自己给经验安排的位置。";
const positive = "从群体出发，探索还取决于不同成员能否看见彼此尚未解决的问题。共同记录可以让个人的片段成为他人继续追问的起点，但不应要求每个人用相同方式表达。假设成员愿意分享一段尚未完成的尝试，团队可以先说明它留下了什么疑问，再寻找谁愿意接着想。长期积累于是来自问题在成员之间的流转；若记录只用来判断谁做得更好，分享未成形想法的空间就会收缩。";
const valid = () => ({ negative: { text: negative, summary: "保留个人重新提问的节奏", label: "个人节奏" },
  positive: { text: positive, summary: "让未解决的问题在成员之间流转", label: "问题流转" }, spatial: { negative: { concern: 1 }, positive: { concern: -1 } } });
const request = (changes: Record<string, unknown> = {}) => new NextRequest("http://localhost/api/polarities", {
  method: "POST", body: JSON.stringify({ requestId: "req_poles", userText: "创作团队怎样持续探索？", axisId: "concern", perspective: { ...defaultThinkingSpace(), focus: { horizon: 1 } }, contextMessages: [], ...changes }) });

beforeEach(() => { generate.mockReset(); });

it("generates both named endpoints once, fixes their lens and keeps other dimensions", async () => {
  generate.mockResolvedValue({ text: JSON.stringify(valid()) });
  const response = await POST(request()), body = await response.json();
  expect(response.status).toBe(200); expect(generate).toHaveBeenCalledTimes(1);
  expect(body.axis.id).toBe("concern");
  expect(body.negative).not.toHaveProperty("stance");
  expect(body.positive).not.toHaveProperty("stance");
  expect(body.negative.perspective.axes.find((axis: { id: string }) => axis.id === "concern")).toMatchObject({ value: -1, selected: -1, source: "viewpoint" });
  expect(body.positive.perspective.axes.find((axis: { id: string }) => axis.id === "concern")).toMatchObject({ value: 1, selected: 1 });
  expect(body.negative.perspective.axes.find((axis: { id: string }) => axis.id === "horizon").selected).toBe(1);
  const prompt = generate.mock.calls[0][0].input;
  expect(prompt).toContain("不是正反辩论"); expect(prompt).toContain("其余非零 focus 逐项保持");
  expect(prompt).toContain('"时间"选"长远"');
  expect(prompt).toContain('"concern":-1'); expect(prompt).toContain('"concern":1');
});

it("repairs a mistaken thesis/antithesis response once without changing the requested poles", async () => {
  generate.mockResolvedValueOnce({ text: JSON.stringify({ thesis: valid().negative, antithesis: valid().positive }) })
    .mockResolvedValueOnce({ text: JSON.stringify(valid()) });
  expect((await POST(request())).status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0].input).toContain("本次是一次合同修复");
  expect(generate.mock.calls[1][0].input).toContain('"concern":-1');
});

it("rejects incomplete and duplicated pairs after one repair instead of returning partial seeds", async () => {
  generate.mockResolvedValue({ text: JSON.stringify({ negative: valid().negative, positive: valid().negative }) });
  const response = await POST(request());
  expect(response.status).toBe(502); expect((await response.json()).error).toBe("invalid_model_output");
  expect(generate).toHaveBeenCalledTimes(2);
});

it("rejects a missing axis and oversized input before making a provider call", async () => {
  expect((await POST(request({ axisId: "missing" }))).status).toBe(400);
  expect((await POST(request({ userText: "字".repeat(2001) }))).status).toBe(400);
  expect(generate).not.toHaveBeenCalled();
});

it("supports unmapped custom axes and keeps self-report knowledge hypothetical", async () => {
  const reviewed = (label: string) => ({ label, change: null, hypothesesSafe: true, issues: [], personalEvidence: [], novelty: { status: "unchecked" } });
  generate.mockResolvedValueOnce({ text: JSON.stringify(valid()) }).mockResolvedValueOnce({ text: JSON.stringify({
    negative: reviewed("个人节奏"), positive: reviewed("问题流转") }) });
  const space = johariThinkingSpace(); space.axes[0].placement = "none";
  const response = await POST(request({ perspective: space, axisId: "johari-self" }));
  expect(response.status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[0][0].input).toContain("不能宣称用户或他人已经知道");
  const body = await response.json();
  expect(body.negative.perspective.axes[0]).toMatchObject({ value: -1, source: "viewpoint" });
  expect(body.negative.perspective.axes[1]).toMatchObject({ value: 0, source: "viewpoint" });
});
