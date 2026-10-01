import {
  isHighRiskDialectic,
  retrieveDialecticPolicyCards
} from "@/features/dialectic/server/policyCards";

describe("dialectic policy retrieval", () => {
  it("keeps a matched high-risk card ahead of stronger low-risk keyword scores", () => {
    const cards = retrieveDialecticPolicyCards(
      "隐私问题同时涉及合作者、合伙人、品牌定位、拍板、新项目、旧项目和时间安排"
    );

    expect(cards.map((card) => card.id)).toEqual([
      "consent-privacy",
      "revocable-ownership"
    ]);
    expect(isHighRiskDialectic(cards)).toBe(true);
  });
});
