import { NextRequest } from "next/server";
import { POST as branchesPost } from "@/app/api/branches/route";
import { POST as synthesisPost } from "@/app/api/synthesis/route";
import { GET as promptsGet } from "@/app/api/prompts/route";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/openai/generateText", () => ({ generateText: generate }));
vi.mock("@/lib/openai/client", () => ({
  getDialecticModel: () => "test-model",
  getDialecticOpenAiClient: () => ({})
}));

const emit = (value: unknown) => ({ text: JSON.stringify(value) });
const audited = { label: "轮流协调", change: null, hypothesesSafe: true, issues: [], personalEvidence: [], novelty: { status: "unchecked" } };
const valid = (evidence: Record<string, string>) => ({ pass: true, issues: [], evidence });
const invalid = (issue: string) => ({ pass: false, issues: [issue] });
const endpoint = (path: string, body: Record<string, unknown>) =>
  new NextRequest(`http://localhost/api/${path}`, { method: "POST", body: JSON.stringify({ requestId: "prose-test", meaningVersion: 1, ...body }) });

beforeEach(() => { generate.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

const thesis = {
  stance: "正", label: "固定接手", summary: "忙乱时固定由习惯记事的人负责衔接",
  change: "区分临时协调与谁做完家务。",
  text: "平日晚饭后可以先让习惯记事的人负责协调，避免大家以为另外有人已经接手。这个安排的理由是熟悉厨房的人能顺手看到缺了什么，再把眼前需要做的事情按轻重交出去。家人之后只要回应这次有没有空，不必每件事都在当晚重新商量。这样省下的主要是临时找人和核对进度的时间。"
};
const vagueAntithesis = {
  stance: "反", label: "轮流负责", summary: "家庭分工需要照顾所有人的感受",
  change: "从做家务转向理解家庭协作。",
  text: "家庭里的角色应当经常变换，长期做一样的事可能使人觉得无聊，也不利于不同成员了解彼此付出的努力。可以尝试轮流洗碗、分配清洁和照料花草，让每个人都有机会体验不同的责任。如此即使遇到新情况，也容易听见不同意见，找到适合家里所有成员的安排，给家务分工留一点改变的空间。"
};
const preciseAntithesis = {
  ...vagueAntithesis,
  summary: "常做饭的人若看不见别人能否接手，固定协调会放大遗漏。",
  text: "固定由熟悉厨房的人招呼能省下沟通，前提是厨房里看到的缺口和全家当晚能接手的时间大体相符。如果有人刚回来要陪孩子做作业，厨房里看得到碗堆着，却看不到谁能接手，最熟悉厨房的人就会继续代做。这种晚饭后更适合把协调交给最清楚家人当晚时间的人，熟悉厨房的人只说清还有什么没做。"
};

it("repairs an antithesis that addresses the topic but misses this thesis's load-bearing premise", async () => {
  generate.mockResolvedValueOnce(emit({ thesis, antithesis: vagueAntithesis }))
    .mockResolvedValueOnce(emit({ thesis: audited, antithesis: { ...audited, prose: invalid("反只谈轮换的新鲜感，没有检验熟悉厨房是否足够看见谁能接手。") } }))
    .mockResolvedValueOnce(emit({ thesis, antithesis: preciseAntithesis }))
    .mockResolvedValueOnce(emit({ thesis: audited, antithesis: { ...audited, prose: valid({
      thesis: "熟悉厨房的人能顺手看到缺了什么",
      target: "固定由熟悉厨房的人招呼能省下沟通",
      premise: "厨房里看到的缺口和全家当晚能接手的时间大体相符",
      consequence: "把协调交给最清楚家人当晚时间的人"
    }) } }));
  const response = await branchesPost(endpoint("branches", { userText: "平日晚饭后家里经常临时找人接手，分工怎么更顺？" }));
  expect(response.status).toBe(200);
  expect((await response.json()).antithesis.text).toBe(preciseAntithesis.text);
  expect(generate.mock.calls.map(([args]) => args.input)).toEqual([
    expect.stringContaining("点名本次正的具体判断"),
    expect.stringContaining("承载本次正的判断"),
    expect.stringContaining("没有检验熟悉厨房是否足够看见谁能接手"),
    expect.stringContaining(preciseAntithesis.text)
  ]);
});

it.each(["正", "反"])("repairs a conditional conclusion reversed at the end of either branch (%s)", async stance => {
  const key = stance === "正" ? "thesis" : "antithesis";
  const good = { thesis, antithesis: preciseAntithesis };
  const contradiction = "没问过家人能否接手时仍缺少授权，正因他们没有答应，现在应替每个人承诺当晚要做的家务。";
  const bad = { ...good, [key]: { ...good[key], text: good[key].text + contradiction } };
  generate.mockResolvedValueOnce(emit(bad))
    .mockResolvedValueOnce(emit({ thesis: audited, antithesis: { ...audited, prose: invalid(`${stance}的末句把缺少答应当成可替人承诺的理由。应只说明如何发出邀请。`) } }))
    .mockResolvedValueOnce(emit(good))
    .mockResolvedValueOnce(emit({ thesis: audited, antithesis: { ...audited, prose: valid({
      thesis: "熟悉厨房的人能顺手看到缺了什么",
      target: "固定由熟悉厨房的人招呼能省下沟通",
      premise: "厨房里看到的缺口和全家当晚能接手的时间大体相符",
      consequence: "把协调交给最清楚家人当晚时间的人"
    }) } }));
  const response = await branchesPost(endpoint("branches", { userText: "怎样协调家务？不要替没有答应的家人承诺。" }));
  expect(response.status).toBe(200);
  expect((await response.json())[key].text).toBe(good[key].text);
  expect(generate.mock.calls[1][0].input).toContain("逐段独立核对正、反");
  expect(generate.mock.calls[1][0].input).toContain(contradiction);
  expect(generate.mock.calls[2][0].input).toContain("末句把缺少答应当成可替人承诺的理由");
  expect(generate.mock.calls[2][0].input).toContain("从各段开头到末句逐项复核");
  const trace = JSON.parse(String(vi.mocked(console.info).mock.calls[0][0]).slice("anicca.generation ".length));
  expect(trace.calls[2]).toMatchObject({ stage: "branches", repair: true, repairKind: "prose" });
});

it("reports a required branch review timeout without rewriting the candidate", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.useFakeTimers();
  generate.mockResolvedValueOnce(emit({ thesis, antithesis: preciseAntithesis }))
    .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("SDK request aborted")), { once: true });
    }));
  const pending = branchesPost(endpoint("branches", { userText: "平日晚饭后家里经常临时找人接手，分工怎么更顺？" }));
  await vi.advanceTimersByTimeAsync(10001);
  const response = await pending;
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: "branches_failed", details: "provider_unreachable" });
  expect(generate).toHaveBeenCalledTimes(2);
});

const sources = [
  { id: "a", stance: "正", label: "视觉余韵", summary: "让物件变化讲述先后", text: "共同创作一段祖屋故事时，让桌布上逐渐淡去的食渍表现搬家留下的空缺。" },
  { id: "b", stance: "正", label: "声音记忆", summary: "重复而变化的响声", text: "用搪瓷碗碰桌时不同的响声，表现同一个家在不同人听来有不同的亲疏。" }
];
const combined = {
  text: "桌布上的食渍可以保留搬家留下的空缺，但若只让它依次变淡，读者容易把空缺看成所有人共同经历的遗忘。让搪瓷碗碰到同一张桌时的声响留在场景中，每次在不同人物耳边变得更亲近或更陌生。读者会注意到桌布显出的同一段时间，在不同听者那里并没有留下同样的距离：有的人仍会下意识给离家者留出一角，有的人却已经把那声响当成晚饭时随处都有的动静。故事的重心就能落在同一趟搬家如何改变不同人的归属，而不只是在交代宅子逐渐变空。",
  summary: "同一处空缺在不同人物身上产生不同的归属变化",
  label: "空缺的距离", stance: "合", change: "用同一处空缺在不同听者耳边的变化呈现不同归属。"
};
function synthesisAudit(prose: Record<string, unknown>) { return emit({ synthesis: { ...audited, prose } }); }
const combinedEvidence = {
  sourceA: "桌布上逐渐淡去的食渍",
  sourceB: "用搪瓷碗碰桌时不同的响声",
  useA: "桌布上的食渍可以保留搬家留下的空缺",
  useB: "每次在不同人物耳边变得更亲近或更陌生",
  consequence: "同一趟搬家如何改变不同人的归属"
};

it("repairs false deferral into synthesis using the ordered sources even when both are theses", async () => {
  const weakDeferral = { deferred: { reason: "一个来源说桌布，另一个来源说声音，两者不是一个感官。", question: "想选择哪一种表达方式？" } };
  generate.mockResolvedValueOnce(emit(weakDeferral)).mockResolvedValueOnce(emit(weakDeferral))
    .mockResolvedValueOnce(emit(invalid("两侧已经通过同一祖屋饭桌相连，感官不同不是证据缺口。")))
    .mockResolvedValueOnce(emit({ synthesis: combined }))
    .mockResolvedValueOnce(synthesisAudit(valid(combinedEvidence)));
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "共同创作一段祖屋故事", sources }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ synthesis: { text: combined.text } });
  expect(generate.mock.calls[2][0].input).toContain("核对缺口真实");
  expect(generate.mock.calls[2][0].input).toContain("缺少实施参数、未验证具体结果都不能证明两侧没有关系");
  expect(generate.mock.calls[3][0].input).toContain("感官不同不是证据缺口");
  expect(generate.mock.calls[4][0].input).toContain("分别引用当前第一、第二份来源");
});

it("repairs an invented connection into a verified deferral with a concrete reason and question", async () => {
  const unrelated = { id: "c", stance: "想法", label: "墙上闹钟", summary: "家里只留一只坏钟", text: "墙上的坏闹钟只作装饰，它停住的指针不能用来判断任何每天重复的习惯。" };
  const deferred = {
    reason: "桌布的污渍服务于祖屋故事里的搬家余韵，坏闹钟则说物件不提供习惯证据；目前没有给出闹钟和这个故事的关系。",
    question: "你想让闹钟也出现在这段祖屋故事里，并用它表达一种错判吗？"
  };
  generate.mockResolvedValueOnce(emit({ synthesis: combined })).mockResolvedValueOnce(emit({ synthesis: combined }))
    .mockResolvedValueOnce(synthesisAudit(invalid("第二个来源没有搪瓷碗；需说明缺少哪条足以连接两个物件的关系。")))
    .mockResolvedValueOnce(emit({ deferred }))
    .mockResolvedValueOnce(emit(valid({ sourceA: combinedEvidence.sourceA, sourceB: "它停住的指针不能用来判断任何每天重复的习惯",
      gap: "目前没有给出闹钟和这个故事的关系", opening: deferred.question })));
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "看看这两个想法有没有联系", sources: [sources[0], unrelated] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ requestId: "prose-test", outcome: "deferred", deferred });
});

it.each(["synthesis", "deferred"])("preserves a provider rate limit while reviewing a %s candidate", async kind => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const candidate = kind === "synthesis" ? { synthesis: combined }
    : { deferred: { reason: "待核对两侧是否讨论同一处场景，不能仅凭它们都是感官材料就连接。", question: "它们发生在同一段场景里吗？" } };
  generate.mockResolvedValueOnce(emit(candidate)).mockResolvedValueOnce(emit(candidate))
    .mockRejectedValueOnce(Object.assign(new Error("provider rate limit"), { status: 429 }));
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "共同创作一段祖屋故事", sources }));
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: "synthesis_failed", details: "provider_rate_limited" });
  expect(generate).toHaveBeenCalledTimes(3);
});

it("allows a one-sided conclusion that explains why the other source's claim fails", async () => {
  const requestSources = [
    { id: "a", stance: "正", label: "照料舅舅", summary: "全家轮流整晚陪护", text: "如果姐姐也能整晚留在舅舅家，大家就能多轮换一班，不必总由弟弟陪护。" },
    { id: "b", stance: "反", label: "不留宿", summary: "姐姐已表明不能留宿", text: "姐姐已经说今晚不能留宿，但愿意在离开前帮舅舅备好早饭。" }
  ];
  const singleSide = {
    text: "按姐姐已经说出的界线安排，今晚的陪护表里不排她留宿。甲想靠轮换缓解弟弟的负担，但那张表只有在姐姐能留下时才覆盖整晚，明知她不能留宿还把她写进去，只会把没人负责的时段藏起来。乙提到她愿意备早饭，这份帮助可以照原意留下，只算离开前能做的事，不拿来抵扣夜间必须有人在场的照护。这样家里会看见弟弟的负担今晚还没有解决，需要确认实际愿意留下的人；即使找不到，仍能诚实面对缺口，不把姐姐提出的帮忙理解为她已经答应改口。",
    summary: "留宿陪护不计入离开前能提供的帮助", label: "陪护缺口", stance: "合",
    change: "把陪护表上的夜间缺口与姐姐能留下的帮助分开。"
  };
  generate.mockResolvedValueOnce(emit({ synthesis: singleSide })).mockResolvedValueOnce(emit({ synthesis: singleSide }))
    .mockResolvedValueOnce(synthesisAudit(valid({
      sourceA: "如果姐姐也能整晚留在舅舅家",
      sourceB: "姐姐已经说今晚不能留宿",
      useA: "那张表只有在姐姐能留下时才覆盖整晚",
      useB: "今晚的陪护表里不排她留宿",
      consequence: "弟弟的负担今晚还没有解决，需要确认实际愿意留下的人"
    })));
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "今晚家里怎么分担照顾舅舅？姐姐已经说不能留宿。", sources: requestSources }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ synthesis: { text: singleSide.text } });
  expect(generate.mock.calls[2][0].input).toContain("让一整侧不保留");
});

it("corrects invalid pass evidence on the exact same synthesis without a content rewrite", async () => {
  generate.mockResolvedValueOnce(emit({ synthesis: combined })).mockResolvedValueOnce(emit({ synthesis: combined }))
    .mockResolvedValueOnce(synthesisAudit(valid({ ...combinedEvidence, sourceA: combinedEvidence.sourceB })))
    .mockResolvedValueOnce(synthesisAudit(valid(combinedEvidence)));
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "共同创作一段祖屋故事", sources }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ synthesis: { text: combined.text } });
  expect(generate).toHaveBeenCalledTimes(4);
  expect(generate.mock.calls[3][0].input.startsWith(generate.mock.calls[2][0].input)).toBe(true);
  expect(generate.mock.calls[3][0].input).toContain("这些引证字段缺失或不匹配对应原文：sourceA");
});

it("reports exhausted reviewer protocol failure separately from a semantic rejection", async () => {
  generate.mockResolvedValueOnce(emit({ synthesis: combined })).mockResolvedValueOnce(emit({ synthesis: combined }))
    .mockResolvedValueOnce(synthesisAudit(valid({ ...combinedEvidence, useB: "不在正文里的虚构引文" })))
    .mockResolvedValueOnce({ text: "{\"synthesis\":" });
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "共同创作一段祖屋故事", sources }));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: "invalid_model_output", details: "reviewer_protocol_error" });
  expect(generate).toHaveBeenCalledTimes(4);
  const logged = String(vi.mocked(console.info).mock.calls[0][0]);
  expect(logged).not.toContain(combined.text);
  expect(logged).not.toContain("不在正文里的虚构引文");
  const trace = JSON.parse(logged.slice("anicca.generation ".length));
  expect(trace.outcome).toBe("reviewer_protocol_error");
  expect(trace.calls.at(-1)).toMatchObject({ stage: "audit", repair: true, repairKind: "reviewer_protocol" });
  expect(trace.checks.slice(-2)).toEqual([
    { stage: "audit", valid: false, repair: false, reason: "reviewer_protocol_error" },
    { stage: "audit", valid: false, repair: true, reason: "reviewer_protocol_error" }
  ]);
});

it("corrects a missing deferred evidence field while preserving short sources and the verified explanation", async () => {
  const shortSources = [{ ...sources[0], text: "台灯" }, { ...sources[1], text: "潮汐" }];
  const deferred = { reason: "台灯与潮汐尚未各自指向一个明确的问题，也没有提出它们之间的联系。", question: "你想在同一段作品里安排台灯和潮汐吗？" };
  const evidence = { sourceA: "台灯", sourceB: "潮汐", gap: "没有提出它们之间的联系", opening: deferred.question };
  const { gap, ...missingGap } = evidence;
  generate.mockResolvedValueOnce(emit({ deferred })).mockResolvedValueOnce(emit({ deferred }))
    .mockResolvedValueOnce(emit(valid(missingGap))).mockResolvedValueOnce(emit(valid({ ...missingGap, gap })));
  const response = await synthesisPost(endpoint("synthesis", { rootInput: "这两个词之间有什么可写？", sources: shortSources }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ requestId: "prose-test", outcome: "deferred", deferred });
  expect(generate).toHaveBeenCalledTimes(4);
  expect(generate.mock.calls[3][0].input.startsWith(generate.mock.calls[2][0].input)).toBe(true);
});

it("rechecks the high-risk final prose and repairs a rewrite that loses the comparison", async () => {
  const rootInput = "生产数据库能否先删除旧数据，再验证快照恢复？";
  const requestSources = [
    { id: "a", stance: "正", label: "先删", summary: "释放空间后再验", text: "先删除旧数据能腾出空间，再利用这份空间检验快照恢复。" },
    { id: "b", stance: "反", label: "先恢复", summary: "在隔离环境验证恢复", text: "先在隔离环境实际恢复并核对快照，否则保留现有数据。" }
  ];
  const grounded = {
    text: "先在隔离环境实际恢复快照，确认旧数据能从恢复结果读回，再决定是否删除。先删除的主张解决了空间压力，却假定未验证的快照能重建原数据。一旦假定不成立，腾出的空间也无法换回已删除的记录。保留先恢复的顺序，同时把空间不足视为推迟删除的原因，而不是用删除本身给恢复腾地方。恢复必须核对所需记录和应用读取得到的结果。若没有隔离环境、没有可复现的恢复结果，或不能检查可用性，就留住原数据并暂停删除，接受眼下不能立即释放空间的代价。",
    summary: "无法隔离恢复时原数据保持可读并推迟删除", label: "恢复顺序", stance: "合",
    change: "把空间不足纳入推迟删除的条件。"
  };
  const lostComparison = { ...grounded, text: combined.text };
  const evidence = {
    sourceA: "先删除旧数据能腾出空间",
    sourceB: "先在隔离环境实际恢复并核对快照",
    useA: "却假定未验证的快照能重建原数据",
    useB: "保留先恢复的顺序",
    consequence: "留住原数据并暂停删除"
  };
  generate.mockResolvedValueOnce(emit({ synthesis: grounded, applicablePolicyCards: [{ id: "verified-recovery", object: "生产数据", action: "验证恢复后删除", evidence: "先在隔离环境实际恢复并核对快照" }] }))
    .mockResolvedValueOnce(emit({ synthesis: grounded }))
    .mockResolvedValueOnce(synthesisAudit(valid(evidence)))
    .mockResolvedValueOnce(emit({ audit: { route: "choose_antithesis", checks: ["I1", "I2", "I3", "F1", "F2", "F3"].map(id => ({
      id: `verified-recovery:${id}`, status: "covered", evidence: "测试已核查"
    })), unsupportedClaims: [], missingClauses: [], verdict: "pass" } }))
    .mockResolvedValueOnce(emit({ synthesis: lostComparison }))
    .mockResolvedValueOnce(synthesisAudit(invalid("终审改写遗漏了先删方案的空间前提与先恢复的取舍。")))
    .mockResolvedValueOnce(emit({ synthesis: grounded }))
    .mockResolvedValueOnce(synthesisAudit(valid(evidence)));
  const response = await synthesisPost(endpoint("synthesis", { rootInput, sources: requestSources }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ synthesis: { text: grounded.text } });
  expect(generate.mock.calls[5][0].input).toContain(lostComparison.text);
  expect(generate.mock.calls[6][0].input).toContain("终审改写遗漏了先删方案的空间前提与先恢复的取舍");
  expect(generate.mock.calls[6][0].input).toContain("规则卡【");
  expect(generate.mock.calls[7][0].input).toContain(grounded.text);
});

it.each([
  ["thesis", "数字哲学家"],
  ["antithesis", "概念沉思者"],
  ["synthesis", "假说对决场"]
])("still serves the historical %s prompt under the existing shape", async (type, oldText) => {
  const response = await promptsGet(new NextRequest(`http://localhost/api/prompts?type=${type}`));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["content", "type"]);
  expect(body.type).toBe(type);
  expect(body.content).toContain(oldText);
  expect(body.content).toContain("<!-- Legacy");
});
