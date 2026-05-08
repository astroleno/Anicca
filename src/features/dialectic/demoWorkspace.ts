import { ANICCA_WORKSPACE_SCHEMA_VERSION } from "@/lib/persist/local";
import { ANICCA_GRAPH_VERSION } from "@/types/anicca";
import { PersistedWorkspaceSnapshot } from "@/types/workspace";

export function createDialogueDemoWorkspace(): PersistedWorkspaceSnapshot {
  return {
    schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
    workspaceId: "workspace_dialogue_demo",
    focusedNodeId: "user_root_1",
    composerParentId: null,
    stageLayouts: {},
    graph: {
      version: ANICCA_GRAPH_VERSION,
      entryIds: ["user_root_1"],
      nodes: {
        user_root_1: {
          id: "user_root_1",
          kind: "user",
          text: "这个方向还值不值得继续投入？",
          createdAt: "2026-04-24T03:00:00.000Z",
          parents: [],
          children: ["asst_thesis_1", "asst_antithesis_1"]
        },
        asst_thesis_1: {
          id: "asst_thesis_1",
          kind: "assistant",
          branchType: "正",
          text: "继续，但把范围切小。",
          createdAt: "2026-04-24T03:01:00.000Z",
          parents: ["user_root_1"],
          children: ["asst_synthesis_1", "user_followup_1"],
          meta: {
            label: "继续",
            summary: "先缩范围，再推进。"
          }
        },
        asst_antithesis_1: {
          id: "asst_antithesis_1",
          kind: "assistant",
          branchType: "反",
          text: "先停一下，别同时铺太开。",
          createdAt: "2026-04-24T03:02:00.000Z",
          parents: ["user_root_1"],
          children: ["asst_synthesis_1"],
          meta: {
            label: "暂停",
            summary: "把摊子收住，再判断。"
          }
        },
        asst_synthesis_1: {
          id: "asst_synthesis_1",
          kind: "assistant",
          branchType: "合",
          text: "保留主线，但拆开节奏。",
          createdAt: "2026-04-24T03:03:00.000Z",
          parents: ["asst_thesis_1", "asst_antithesis_1"],
          children: ["user_followup_2"],
          meta: {
            label: "收束",
            summary: "保留主线，拆开节奏。",
            sourceNodeIds: ["asst_thesis_1", "asst_antithesis_1"],
            lineageParentId: "user_root_1"
          }
        },
        user_followup_1: {
          id: "user_followup_1",
          kind: "user",
          text: "如果继续，最小可验证范围是什么？",
          createdAt: "2026-04-24T03:04:00.000Z",
          parents: ["asst_thesis_1"],
          children: []
        },
        user_followup_2: {
          id: "user_followup_2",
          kind: "user",
          text: "如果按这个节奏推进，第一周只做什么？",
          createdAt: "2026-04-24T03:05:00.000Z",
          parents: ["asst_synthesis_1"],
          children: []
        }
      },
      edges: {
        e1: { id: "e1", from: "user_root_1", to: "asst_thesis_1", reason: "正" },
        e2: { id: "e2", from: "user_root_1", to: "asst_antithesis_1", reason: "反" },
        e3: { id: "e3", from: "asst_thesis_1", to: "asst_synthesis_1", reason: "synthesis" },
        e4: { id: "e4", from: "asst_antithesis_1", to: "asst_synthesis_1", reason: "synthesis" },
        e5: { id: "e5", from: "asst_thesis_1", to: "user_followup_1", reason: "continue" },
        e6: { id: "e6", from: "asst_synthesis_1", to: "user_followup_2", reason: "continue" }
      }
    }
  };
}
