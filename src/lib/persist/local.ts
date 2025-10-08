import { Graph } from "@/types/anicca";

const KEY = "anicca_graph_v1";

export function saveGraphLocal(graph: Graph) {
  try {
    localStorage.setItem(KEY, JSON.stringify(graph));
  } catch (e) {
    console.error("saveGraphLocal error", e);
  }
}

export function loadGraphLocal(): Graph | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed?.version !== "anicca-mvp-1") return null;
    return parsed as Graph;
  } catch (e) {
    console.error("loadGraphLocal error", e);
    return null;
  }
}


