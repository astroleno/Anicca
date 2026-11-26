// @vitest-environment node
import { makeBlind } from "./blind-dialectic-quality-r7.mjs";
import { loadExam, readingBody } from "./dialectic-quality-r7.mjs";

describe("round seven frozen comparison", () => {
  it("retains the formal corpus and real ordered source shapes", async () => {
    const { cases } = await loadExam();
    expect(cases.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => `formal-${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 5 }, (_, i) => `transfer-0${i + 1}`)
    ]);
    expect(cases[15].requests.synthesis.sources.map(({ stance }) => stance)).toEqual(["正", "正"]);
    expect(cases[15].requests.synthesis.connectionInput).toContain("第一次出现的地名");
    expect(cases[16].requests.synthesis.sources.map(({ stance }) => stance)).toEqual(["想法", "想法"]);
  });

  it("projects only full reading text and preserves a deferred reason and question", () => {
    expect(readingBody("branches", {
      thesis: { stance: "正", text: "第一段\n\n第二段", summary: "摘要" },
      antithesis: { stance: "反", text: "反方", change: "调试信息" }
    })).toEqual({ outcome: "branches", thesis: "第一段\n\n第二段", antithesis: "反方" });
    expect(readingBody("synthesis", {
      outcome: "deferred", deferred: { reason: "题目彼此独立。", question: "你想让两件事在哪相遇？" }
    })).toEqual({ outcome: "deferred", reason: "题目彼此独立。", question: "你想让两件事在哪相遇？" });
    expect(readingBody("synthesis", { outcome: "deferred", deferred: { reason: "题目彼此独立。" } })).toBeNull();
  });

  it("independently switches A and B and keeps the mapping outside the packet", async () => {
    const { cases } = await loadExam();
    const coins = [0, 1];
    const { packets, mapping } = await makeBlind(cases.slice(-2), (version, _, route) => ({ version, route }), () => coins.shift());
    expect(mapping).toEqual({ "transfer-04": { A: 0, B: 1 }, "transfer-05": { A: 1, B: 0 } });
    expect(packets[1].A.synthesis.version).toBe(1);
    expect(packets[1].A.branches.version).toBe(1);
    expect(packets[1].sources[0]).toEqual({ label: "周末边界", stance: "想法", text: expect.any(String) });
    expect(packets[1]).not.toHaveProperty("requests");
    expect(packets[1]).not.toHaveProperty("mapping");
  });
});
