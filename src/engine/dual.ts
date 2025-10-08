import { branchGraphStore } from "@/store/branchGraph";
import { runNode } from "@/llm/runner";

// 生成“正/反”两个分支并运行（最小实现，使用 providerName+model）
export async function generateDualBranches(baseId: string, providerName: string, model: string) {
  // 创建正/反两个 assistant 节点
  const thesisId = branchGraphStore.forkNode(baseId, { branchType: "正", model });
  const antiId = branchGraphStore.forkNode(baseId, { branchType: "反", model });

  // 分别运行
  await Promise.all([
    runNode(providerName, thesisId, model),
    runNode(providerName, antiId, model)
  ]);

  return { thesisId, antiId };
}


