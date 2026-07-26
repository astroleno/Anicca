import { normalizeDialecticLabel, normalizeDialecticSummary } from "@/features/dialectic/outputContract";

describe("dialectic output contract", () => {
  it("normalizes whitespace and takes the first Chinese-delimited label segment", () => {
    expect(normalizeDialecticLabel("  支持  ： 跨设备同步  ", "正向", "正")).toBe("支持");
    expect(normalizeDialecticLabel("试行、分阶段推进", "正向", "正")).toBe("试行");
    expect(normalizeDialecticSummary("  先做小步\n\t再评估  ")).toBe("先做小步 再评估");
  });

  it("falls back when a label is pure ASCII", () => {
    expect(normalizeDialecticLabel("fold_need", "正向", "正")).toBe("正向");
    expect(normalizeDialecticLabel("A/B plan", "合流", "合")).toBe("合流");
  });

  it("limits labels to eight Unicode characters", () => {
    expect(normalizeDialecticLabel("这是一个超过八个字的标签", "正向", "正")).toBe("这是一个超过八个");
  });

  it("strips redundant stance suffixes without corrupting protected synthesis words", () => {
    expect(normalizeDialecticLabel("分段试行正", "正向", "正")).toBe("分段试行");
    expect(normalizeDialecticLabel("框架整合", "合流", "合")).toBe("框架整合");
    expect(normalizeDialecticLabel("角色融合", "合流", "合")).toBe("角色融合");
    expect(normalizeDialecticLabel("方案综合", "合流", "合")).toBe("方案综合");
    expect(normalizeDialecticLabel("资源配合", "合流", "合")).toBe("资源配合");
    expect(normalizeDialecticLabel("节奏适合", "合流", "合")).toBe("节奏适合");
    expect(normalizeDialecticLabel("主线合流", "合流", "合")).toBe("主线合流");
    expect(normalizeDialecticLabel("局部结合", "合流", "合")).toBe("局部结合");
  });
});
