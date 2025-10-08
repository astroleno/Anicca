import { Graph } from "@/types/anicca";

// 简易 JSON 导入/导出（最小实现）。生产可引入 Zod 校验。

export function exportGraph(graph: Graph): Blob {
  try {
    const text = JSON.stringify(graph, null, 2);
    return new Blob([text], { type: "application/json" });
  } catch (e) {
    console.error("exportGraph error", e);
    throw e;
  }
}

export async function importGraph(file: File): Promise<Graph> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    // 轻校验
    if (!parsed || parsed.version !== "anicca-mvp-1" || !parsed.nodes || !parsed.edges) {
      throw new Error("invalid graph json");
    }
    return parsed as Graph;
  } catch (e) {
    console.error("importGraph error", e);
    throw e;
  }
}


