import {
  isHighRiskDialectic,
  retrieveDialecticPolicyCards
} from "@/features/dialectic/server/policyCards";

describe("dialectic policy retrieval", () => {
  it.each([
    "我在家里总扮演懂事的角色",
    "我为什么总觉得时间过得越来越快",
    "我在家庭中的角色改变后，要多久才能恢复平静？",
    "每天只有半小时和家人吃饭，为什么那段时间总觉得特别短？",
    "每周只有一个晚上能见家人，这段时间怎么过得这么快？",
    "每周只有两天能和孩子相处，我怎样减少自己的愧疚？",
    "手机缓存里留着过去的照片，每次看到都会想起小时候。"
  ])("does not attach unrelated policy cards to %s", (input) => {
    const cards = retrieveDialecticPolicyCards(input);

    expect(cards).toEqual([]);
    expect(isHighRiskDialectic(cards)).toBe(false);
  });

  it.each([
    ["多租户 API 的用户角色存在缓存中，如何按权限隔离并及时撤权？", "authoritative-decision", true],
    ["给访问控制结果做本地快取，撤权后下一次请求怎样强制回源？", "authoritative-decision", true],
    ["读取接口的 p95 延迟过高，应该增加缓存并接受短期不一致，还是保持强一致并接受更慢响应？", "authoritative-decision", true],
    ["每周只有两个小时，怎样兼顾旧项目维护和新项目验证？", "bounded-attention", false],
    ["每周只有一个晚上，怎样平衡旧项目维护和新项目验证？", "bounded-attention", false],
    ["每周只有两天，怎样兼顾旧项目维护和新项目验证？", "bounded-attention", false],
    ["维护开源库和试做功能一周最多 4 小时，怎样分配？", "bounded-attention", false],
    ["发布和补测试共用一份工时预算，怎样设定交付顺序？", "bounded-attention", false],
    ["删除生产历史数据前，怎样用独立备份验证可以恢复？", "verified-recovery", true],
    ["核对数据库快照能否在隔离环境执行恢复，再回收旧副本。", "verified-recovery", true]
  ])("matches the relevant domain card for %s", (input, id, highRisk) => {
    const cards = retrieveDialecticPolicyCards(input);

    expect(cards.map((card) => card.id)).toEqual([id]);
    expect(isHighRiskDialectic(cards)).toBe(highRisk);
  });

  it("keeps a matched high-risk card ahead of stronger low-risk scores and caps results at two", () => {
    const cards = retrieveDialecticPolicyCards(
      "隐私问题同时涉及合作者、合伙人、品牌定位、拍板，以及新项目和旧项目的固定时间预算"
    );

    expect(cards.map((card) => card.id)).toEqual([
      "consent-privacy",
      "revocable-ownership"
    ]);
    expect(isHighRiskDialectic(cards)).toBe(true);
  });
});
