import { ANICCA_GRAPH_VERSION, Graph } from "@/types/anicca";

// Deprecated raw graph helper. `/dialogue` 主线应优先走 workspace bundle import/export。

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
    if (!parsed || parsed.version !== ANICCA_GRAPH_VERSION || !parsed.nodes || !parsed.edges) {
      throw new Error("invalid graph json");
    }
    return parsed as Graph;
  } catch (e) {
    console.error("importGraph error", e);
    throw e;
  }
}

