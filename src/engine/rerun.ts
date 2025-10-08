import { branchGraphStore } from "@/store/branchGraph";
import { runNode } from "@/llm/runner";

// 从指定节点起，按拓扑序重跑到所有叶子（最小线性近似）
export async function rerunBranch(providerName: string, fromNodeId: string, model: string) {
  const g = branchGraphStore.getGraph();
  const queue: string[] = [fromNodeId];
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = g.nodes[id];
    if (!node) continue;

    if (node.kind === "assistant") {
      await runNode(providerName, id, model);
    }

    for (const child of node.children) {
      queue.push(child);
    }
  }
}


