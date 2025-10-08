// 摘要生成与校验的占位工具

export function isValidSummary(summary: string, userText: string): boolean {
  if (!summary) return false;
  if (summary.length > 30) return false;
  // 简单相似度：若摘要完全包含于用户文本，视为不合格
  if (userText && userText.includes(summary)) return false;
  // 动作/判断词粗略判定
  const keywords = ["建议","应","优先","避免","结论","因此","应当","需要","不要","可以"];
  const hasAction = keywords.some(k => summary.includes(k));
  return hasAction;
}

export function normalizeSummary(summary: string): string {
  // 去除末尾句号/感叹号
  return summary.replace(/[。！!。\s]+$/g, "");
}


