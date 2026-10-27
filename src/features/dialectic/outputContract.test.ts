import { normalizeDialecticLabel, normalizeDialecticSummary, quoteExcerpt } from "@/features/dialectic/outputContract";

describe("dialectic output contract", () => {
  it("normalizes whitespace and takes the first Chinese-delimited label segment", () => {
    expect(normalizeDialecticLabel("  支持  ： 跨设备同步  ", "正向", "正")).toBe("支持");
    expect(normalizeDialecticLabel("试行、分阶段推进", "正向", "正")).toBe("试行");
    expect(normalizeDialecticSummary("  先做小步\n\t再评估  ")).toBe("先做小步 再评估");
  });

  it("falls back when a label does not contain a Chinese character", () => {
    expect(normalizeDialecticLabel("fold_need", "正向", "正")).toBe("正向");
    expect(normalizeDialecticLabel("A/B plan", "合流", "合")).toBe("合流");
    expect(normalizeDialecticLabel("   ", "正向", "正")).toBe("正向");
    expect(normalizeDialecticLabel("✅", "反向", "反")).toBe("反向");
    expect(normalizeDialecticLabel("!!!", "合流", "合")).toBe("合流");
  });

  it("limits labels to eight Unicode characters", () => {
    expect(normalizeDialecticLabel("这是一个超过八个字的标签", "正向", "正")).toBe("正向");
    expect(normalizeDialecticLabel("可辨认与可发言的条件", "正向", "正")).toBe("正向");
    expect(normalizeDialecticLabel("可辨认与可发言的", "正向", "正")).toBe("正向");
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

it("marks a quoted excerpt as shortened without splitting Unicode characters", () => {
  expect(quoteExcerpt("🌱甲乙丙丁戊己庚辛壬癸子丑")).toBe("🌱甲乙丙丁戊己庚辛壬癸子…");
  expect(quoteExcerpt("原句完整。", 12)).toBe("原句完整。");
});
