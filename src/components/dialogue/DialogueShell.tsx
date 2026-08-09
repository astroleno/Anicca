"use client";

import {
  ChangeEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import {
  buildContinuationCreatedEvent,
  buildSynthesisCreatedEvent,
  buildWorkspaceResumedEvent,
  emitDialogueTelemetry
} from "@/lib/analytics/dialogue";
import { buildWorkspaceContext } from "@/chat/workspaceContext";
import { BranchSidebar } from "@/components/dialogue/BranchSidebar";
import { BubbleStage } from "@/components/dialogue/BubbleStage";
import { ConversationPanel } from "@/components/dialogue/ConversationPanel";
import { DialogueComposer } from "@/components/dialogue/DialogueComposer";
import { WorkspaceBar } from "@/components/dialogue/WorkspaceBar";
import { createDialogueDemoWorkspace } from "@/features/dialectic/demoWorkspace";
import { createClientId, DialogueErrorState, PendingRequest, useDialogueUiStore } from "@/features/dialectic/store";
import {
  DialogueComposerTarget,
  DialogueSynthesisAction,
  deriveDialogueView
} from "@/features/dialectic/viewModel";
import { projectGrowthSessionToGraph } from "@/features/growth/graphProjection";
import { runGrowthSession } from "@/features/growth/orchestrator";
import { RoundtableState } from "@/features/roundtable/types";
import {
  exportWorkspaceBundle,
  importWorkspaceBundleFile
} from "@/lib/io/workspaceBundle";
import {
  activateWorkspace,
  createWorkspace,
  createWorkspaceRecord,
  listRecentWorkspaces,
  loadActiveWorkspace,
  loadWorkspaceRecord,
  renameWorkspace,
  saveActiveWorkspaceSnapshot,
  saveWorkspaceRecord,
  setActiveWorkspaceId
} from "@/lib/persist/workspaces";
import { branchGraphStore } from "@/store/branchGraph";
import { Message } from "@/types/chat";
import { Graph } from "@/types/anicca";
import { WorkspaceRegistryEntry, WorkspaceRoundtableArtifact } from "@/types/workspace";
import styles from "./DialogueShell.module.css";

type BranchPayload = {
  text: string;
  summary: string;
  label: string;
  stance: "正" | "反";
};

type BranchesResponse = {
  requestId: string;
  thesis: BranchPayload;
  antithesis: BranchPayload;
};

type SynthesisResponse = {
  requestId: string;
  synthesis: {
    text: string;
    summary: string;
    label: string;
    stance: "合";
  };
};

type DialogueLocationLike = Pick<Location, "hostname" | "search">;
type RoundtableResponse = {
  requestId: string;
  state: RoundtableState;
};

type RoundtablePendingRequest = {
  requestId: string;
  workspaceSessionId: string;
  workspaceId: string;
  sourceNodeId: string;
  focusSnapshotId: string;
};

const DIALOGUE_WORKSPACE_RETRIEVAL_CONTEXT_DEFAULT_ENABLED = false;
let dialogueWorkspaceRetrievalContextEnabled = DIALOGUE_WORKSPACE_RETRIEVAL_CONTEXT_DEFAULT_ENABLED;

export function setDialogueWorkspaceRetrievalContextEnabledForTests(enabled: boolean) {
  dialogueWorkspaceRetrievalContextEnabled = enabled;
}

function isDialogueWorkspaceRetrievalContextEnabled() {
  return dialogueWorkspaceRetrievalContextEnabled;
}

export function isDialogueDemoWorkspaceEnabled(locationLike: DialogueLocationLike) {
  const params = new URLSearchParams(locationLike.search);
  return params.get("demo") === "1";
}

export function isDialogueRetrievalDebugPreviewEnabled(locationLike: Pick<Location, "search">) {
  const params = new URLSearchParams(locationLike.search);
  return params.get("retrievalDebug") === "1";
}

function buildSynthesisRetrievalQueryText(thesisNode: Graph["nodes"][string], antithesisNode: Graph["nodes"][string]) {
  return [
    thesisNode.meta?.label || thesisNode.branchType,
    thesisNode.meta?.summary,
    antithesisNode.meta?.label || antithesisNode.branchType,
    antithesisNode.meta?.summary
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function buildRetrievalDebugPreviewQueryText(input: {
  draft: string;
  currentNode: ReturnType<typeof deriveDialogueView>["currentNode"];
  graph: Graph;
  synthesisAction: DialogueSynthesisAction | null;
}) {
  const draft = input.draft.trim();
  if (draft) {
    return draft;
  }

  if (input.synthesisAction?.available) {
    const thesisNode = input.graph.nodes[input.synthesisAction.thesisId];
    const antithesisNode = input.graph.nodes[input.synthesisAction.antithesisId];
    if (thesisNode && antithesisNode) {
      return buildSynthesisRetrievalQueryText(thesisNode, antithesisNode);
    }
  }

  return [
    input.currentNode?.label,
    input.currentNode?.summary,
    input.currentNode?.text
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function getRoundtablePendingSourceLabel(graph: Graph, sourceNodeId: string | null): string | null {
  if (!sourceNodeId) {
    return null;
  }

  const node = graph.nodes[sourceNodeId];
  if (!node) {
    return null;
  }

  if (node.meta?.label) {
    return node.meta.label;
  }

  if (node.branchType) {
    return node.branchType;
  }

  if (node.kind === "user") {
    return getDialogueNodeLabel(graph, sourceNodeId);
  }

  return "节点";
}

function getShortPromptLabel(text: string) {
  const firstLine = text.trim().replace(/\s+/g, " ");
  if (!firstLine) {
    return "待生成母题";
  }
  return firstLine.length > 14 ? `${firstLine.slice(0, 14)}…` : firstLine;
}

function getPlainTextSnippet(text: string | undefined, maxLength = 36): string {
  const normalized = (text || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function formatDialogueError(error: unknown): DialogueErrorState {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "";

  if (message.startsWith("invalid_model_output")) {
    return {
      title: "模型这轮没按约定返回",
      detail: "结果结构不完整，所以这次没有写进图里。",
      recovery: "换个更具体的问法，或稍后再试。"
    };
  }

  if (message.includes("openai_api_key_missing")) {
    return {
      title: "模型服务还没接好",
      detail: "当前环境没有配置 OpenAI API key，所以这轮请求没有真正发出去。",
      recovery: "先补上 OPENAI_API_KEY，再重新生成。"
    };
  }

  if (message.includes("provider_auth_failed")) {
    return {
      title: "模型服务认证失败",
      detail: "当前 API key 或代理配置没有通过校验。",
      recovery: "检查 OPENAI_API_KEY 和 baseURL 后再试。"
    };
  }

  if (message.includes("provider_unreachable")) {
    return {
      title: "模型服务暂时不可达",
      detail: "这轮请求没有连到模型服务。",
      recovery: "检查网络、代理或 baseURL，再重新生成。"
    };
  }

  if (message.includes("provider_rate_limited")) {
    return {
      title: "模型服务触发限流",
      detail: "上游暂时拒绝了过多请求，当前图和圆桌记录都没有被改动。",
      recovery: "等一会儿再试，或切换到负载更低的模型。"
    };
  }

  if (message.includes("provider_overloaded")) {
    return {
      title: "模型服务负载已满",
      detail: "上游当前没有容量处理这轮请求，当前图和圆桌记录都没有被改动。",
      recovery: "稍后重试，或临时切换到其他模型服务。"
    };
  }

  if (message.startsWith("branches_failed")) {
    return {
      title: "这一轮正反没有生成出来",
      detail: "主线图保持了原样，没有留下半截节点。",
      recovery: "稍后重试，或先检查模型服务配置。"
    };
  }

  if (message.startsWith("synthesis_failed")) {
    return {
      title: "这一轮收束没有完成",
      detail: "正与反还在原处，图状态没有被破坏。",
      recovery: "稍后重试，或先检查模型服务配置。"
    };
  }

  return {
    title: "这轮生成出了点问题",
    detail: "当前图状态没有被改坏，你可以直接再试一次。",
    recovery: "如果反复失败，先检查模型服务配置。"
  };
}

function formatWorkspaceBundleError(error: unknown): DialogueErrorState {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "";

  if (message === "invalid_workspace_bundle_json") {
    return {
      title: "导入文件不是有效 JSON",
      detail: "文件内容没有被解析成工作区 bundle。",
      recovery: "重新导出一次，或检查文件内容后再试。"
    };
  }

  if (message === "invalid_workspace_bundle_version") {
    return {
      title: "导入文件版本不兼容",
      detail: "这份工作区 bundle 不是当前主线认识的格式。",
      recovery: "换一份由当前 `/dialogue` 导出的文件再试。"
    };
  }

  if (message === "invalid_workspace_bundle_graph_version") {
    return {
      title: "导入文件里的图版本不兼容",
      detail: "bundle 里带的是旧图结构，当前主线不会直接写入。",
      recovery: "先用当前主线重新导出，或升级来源工作区。"
    };
  }

  if (
    message === "invalid_workspace_bundle_snapshot" ||
    message === "invalid_workspace_bundle_metadata"
  ) {
    return {
      title: "导入文件缺少必要工作区信息",
      detail: "bundle 没有通过主线校验，所以本地 registry 没有被改写。",
      recovery: "确认文件来自当前主线导出，再重新导入。"
    };
  }

  return {
    title: "导入工作区失败",
    detail: "现有本地工作区没有被改坏。",
    recovery: "稍后重试，或检查导入文件是否完整。"
  };
}

function serializeContextMessages(messages: Message[]) {
  return messages
    .filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof data?.error === "string" ? data.error : `http_${response.status}`;
    const details = typeof data?.details === "string" ? data.details : "";
    throw new Error(details ? `${error}: ${details}` : error);
  }

  return data as T;
}

function findRelevantSynthesisAction(
  graph: Graph,
  focusNodeId: string | null,
  availableActions: DialogueSynthesisAction[]
): DialogueSynthesisAction | null {
  if (!focusNodeId) {
    return null;
  }

  const focusNode = graph.nodes[focusNodeId];
  if (focusNode?.kind === "assistant" && focusNode.branchType !== "合") {
    const parentUserId = focusNode.parents.find((nodeId) => graph.nodes[nodeId]?.kind === "user") || null;
    if (parentUserId) {
      return availableActions.find((action) => action.lineageParentId === parentUserId) || null;
    }
  }

  if (focusNode?.kind === "assistant" && focusNode.branchType === "合" && focusNode.meta?.lineageParentId) {
    const lineageParentId = focusNode.meta.lineageParentId;
    return availableActions.find((action) => action.lineageParentId === lineageParentId) || null;
  }

  return (
    availableActions.find((action) => action.lineageParentId === focusNodeId) ||
    availableActions.find((action) => action.synthesisId === focusNodeId) ||
    null
  );
}

function listRoundtableArtifactsForNode(
  workspaceId: string | null,
  sourceNodeId: string | null | undefined
): WorkspaceRoundtableArtifact[] {
  if (!workspaceId || !sourceNodeId) {
    return [];
  }

  const roundtables = loadWorkspaceRecord(workspaceId)?.snapshot.artifacts?.roundtables;
  if (!roundtables) {
    return [];
  }

  return Object.values(roundtables)
    .filter((artifact) => artifact.sourceNodeId === sourceNodeId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function saveRoundtableArtifact(workspaceId: string, artifact: WorkspaceRoundtableArtifact) {
  const record = loadWorkspaceRecord(workspaceId);
  if (!record) {
    return false;
  }

  saveWorkspaceRecord({
    id: workspaceId,
    title: record.entry.title,
    titleSource: record.entry.titleSource,
    createdAt: record.entry.createdAt,
    updatedAt: artifact.updatedAt,
    lastOpenedAt: record.entry.lastOpenedAt,
    snapshot: {
      ...record.snapshot,
      artifacts: {
        ...(record.snapshot.artifacts || {}),
        roundtables: {
          ...(record.snapshot.artifacts?.roundtables || {}),
          [artifact.id]: artifact
        }
      }
    }
  });
  return true;
}

function getDialogueNodeLabel(graph: Graph, nodeId: string): string {
  const node = graph.nodes[nodeId];
  if (!node) {
    return "节点";
  }
  if (node.meta?.label) {
    return node.meta.label;
  }
  if (node.branchType) {
    return node.branchType;
  }
  if (node.kind === "user") {
    const firstLine = (node.text || node.meta?.summary || "").trim().split(/\s*\n\s*/)[0] || "";
    if (firstLine) {
      return firstLine.length > 12 ? `${firstLine.slice(0, 12)}…` : firstLine;
    }

    return "主题";
  }

  return "节点";
}

function getDialogueNodeSnippet(graph: Graph, nodeId: string, fallback = "暂无摘要"): string {
  const node = graph.nodes[nodeId];
  const snippet = getPlainTextSnippet(
    node?.meta?.summary || node?.text || node?.meta?.label,
    34
  );

  return snippet || fallback;
}

function getComposerTargetFromNodeId(graph: Graph, nodeId: string | null): DialogueComposerTarget {
  if (!nodeId) {
    return {
      nodeId: null,
      label: "新的主题",
      kind: "root",
      displayRole: "node"
    };
  }

  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "assistant") {
    return {
      nodeId: null,
      label: "新的主题",
      kind: "root",
      displayRole: "node"
    };
  }

  const isSynthesisRecord = node.branchType === "合";
  return {
    nodeId: node.id,
    label: getDialogueNodeLabel(graph, node.id),
    kind: "assistant",
    branchType: isSynthesisRecord ? undefined : node.branchType,
    displayRole: isSynthesisRecord ? "synthesis-record" : "node"
  };
}

function getSynthesisPendingComposerTarget(pendingRequest: PendingRequest): DialogueComposerTarget {
  return {
    nodeId: pendingRequest.composerTargetId,
    label: pendingRequest.sourceLabel || "当前谱系",
    kind: "root",
    displayRole: "node"
  };
}

function shouldAutoFocusPendingResult(pendingRequest: PendingRequest, graph: Graph) {
  const currentFocusedNodeId = useDialogueUiStore.getState().focusedNodeId;
  return deriveDialogueView(graph, currentFocusedNodeId).focusSnapshotId === pendingRequest.focusSnapshotId;
}

export function DialogueShell() {
  const graphSnapshot = useSyncExternalStore(
    branchGraphStore.subscribe.bind(branchGraphStore),
    branchGraphStore.getSnapshot.bind(branchGraphStore),
    branchGraphStore.getSnapshot.bind(branchGraphStore)
  );
  const [draft, setDraft] = useState("");
  const [emptyComposerOpen, setEmptyComposerOpen] = useState(false);
  const [demoWorkspaceEnabled, setDemoWorkspaceEnabled] = useState(false);
  const [retrievalDebugPreviewEnabled, setRetrievalDebugPreviewEnabled] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(() => branchGraphStore.getGraph().entryIds.length > 0);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceRegistryEntry[]>([]);
  const [roundtableArtifact, setRoundtableArtifact] = useState<WorkspaceRoundtableArtifact | null>(null);
  const [roundtablePendingRequest, setRoundtablePendingRequest] = useState<RoundtablePendingRequest | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [synthesisRevealId, setSynthesisRevealId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const roundtableDrawerRef = useRef<HTMLElement | null>(null);
  const roundtableSummonButtonRef = useRef<HTMLButtonElement | null>(null);
  const roundtableSavedButtonRef = useRef<HTMLButtonElement | null>(null);
  const roundtableReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const roundtablePendingRef = useRef<RoundtablePendingRequest | null>(null);
  const roundtableArtifactRef = useRef<WorkspaceRoundtableArtifact | null>(null);
  const workspaceId = useDialogueUiStore((state) => state.workspaceId);
  const workspaceSessionId = useDialogueUiStore((state) => state.workspaceSessionId);
  const focusedNodeId = useDialogueUiStore((state) => state.focusedNodeId);
  const composerParentId = useDialogueUiStore((state) => state.composerParentId);
  const stageLayouts = useDialogueUiStore((state) => state.stageLayouts);
  const pendingAction = useDialogueUiStore((state) => state.pendingAction);
  const pending = useDialogueUiStore((state) => state.pending);
  const errorState = useDialogueUiStore((state) => state.errorState);
  const hydrateWorkspace = useDialogueUiStore((state) => state.hydrateWorkspace);
  const setFocusedNodeId = useDialogueUiStore((state) => state.setFocusedNodeId);
  const setComposerParentId = useDialogueUiStore((state) => state.setComposerParentId);
  const beginPending = useDialogueUiStore((state) => state.beginPending);
  const clearPending = useDialogueUiStore((state) => state.clearPending);
  const setErrorState = useDialogueUiStore((state) => state.setErrorState);

  const setVisibleRoundtableArtifact = useCallback((artifact: WorkspaceRoundtableArtifact | null) => {
    roundtableArtifactRef.current = artifact;
    setRoundtableArtifact(artifact);
  }, []);

  const refreshWorkspaceRegistryView = useCallback((preferredWorkspaceId?: string | null) => {
    const entries = listRecentWorkspaces();
    setWorkspaceEntries(entries);
    const nextCurrentId = preferredWorkspaceId || workspaceId || entries[0]?.id || null;
    return {
      entries,
      currentEntry:
        entries.find((entry) => entry.id === nextCurrentId) || entries[0] || null
    };
  }, [workspaceId]);

  useEffect(() => {
    if (branchGraphStore.getGraph().entryIds.length > 0) {
      setWorkspaceReady(true);
      return;
    }

    const activeWorkspace = loadActiveWorkspace();
    if (!activeWorkspace) {
      return;
    }

    branchGraphStore.setGraph(activeWorkspace.snapshot.graph);
    hydrateWorkspace({
      workspaceId: activeWorkspace.snapshot.workspaceId,
      workspaceSessionId: activeWorkspace.snapshot.workspaceSessionId,
      focusedNodeId: activeWorkspace.snapshot.focusedNodeId,
      composerParentId: activeWorkspace.snapshot.composerParentId,
      stageLayouts: activeWorkspace.snapshot.stageLayouts
    });
    setWorkspaceReady(true);
    refreshWorkspaceRegistryView(activeWorkspace.snapshot.workspaceId);
    void emitDialogueTelemetry(buildWorkspaceResumedEvent(activeWorkspace, "boot"));
  }, [hydrateWorkspace, refreshWorkspaceRegistryView]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setDemoWorkspaceEnabled(isDialogueDemoWorkspaceEnabled(window.location));
    setRetrievalDebugPreviewEnabled(isDialogueRetrievalDebugPreviewEnabled(window.location));
  }, []);

  const view = deriveDialogueView(graphSnapshot.graph, focusedNodeId);
  const isEmptyWorkspace = graphSnapshot.graph.entryIds.length === 0;
  const isBranchPending = pending.branches !== null;
  const isSynthesisPending = pending.synthesis !== null;
  const hasPendingRequest = isBranchPending || isSynthesisPending;
  const roundtablePending = roundtablePendingRequest !== null;
  const frozenComposerTarget = pending.branches
    ? getComposerTargetFromNodeId(graphSnapshot.graph, pending.branches.composerTargetId)
    : pending.synthesis
      ? getSynthesisPendingComposerTarget(pending.synthesis)
      : null;
  const composerTarget = frozenComposerTarget || view.composerTarget;
  const composerTargetFrozenReason = pending.branches ? "branches" : pending.synthesis ? "synthesis" : null;
  const composerTargetFrozen = Boolean(frozenComposerTarget);
  const shouldShowComposer = !isEmptyWorkspace || emptyComposerOpen || draft.trim().length > 0 || hasPendingRequest || Boolean(errorState);

  const beginRoundtablePending = (request: RoundtablePendingRequest) => {
    roundtablePendingRef.current = request;
    setRoundtablePendingRequest(request);
  };

  const clearRoundtablePending = (requestId?: string) => {
    if (requestId && roundtablePendingRef.current?.requestId !== requestId) {
      return;
    }
    roundtablePendingRef.current = null;
    setRoundtablePendingRequest(null);
  };

  const clearRoundtableRuntime = () => {
    clearRoundtablePending();
    setVisibleRoundtableArtifact(null);
  };

  const focusComposerSoon = useCallback(() => {
    setEmptyComposerOpen(true);
    window.setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 0);
  }, []);

  const handleDraftChange = useCallback((value: string) => {
    if (isEmptyWorkspace) {
      setEmptyComposerOpen(true);
    }
    setDraft(value);
  }, [isEmptyWorkspace]);

  useEffect(() => {
    setEmptyComposerOpen(false);
  }, [workspaceId]);

  useEffect(() => {
    if (view.focusNodeId !== focusedNodeId) {
      setFocusedNodeId(view.focusNodeId);
    }
  }, [focusedNodeId, setFocusedNodeId, view.focusNodeId]);

  useEffect(() => {
    if (hasPendingRequest) {
      return;
    }
    if (composerParentId !== view.composerTarget.nodeId) {
      setComposerParentId(view.composerTarget.nodeId);
    }
  }, [composerParentId, hasPendingRequest, setComposerParentId, view.composerTarget.nodeId]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    const existingRecord = loadWorkspaceRecord(workspaceId);
    saveActiveWorkspaceSnapshot({
      workspaceId,
      graph: graphSnapshot.graph,
      focusedNodeId: view.focusNodeId,
      composerParentId: composerTarget.nodeId,
      stageLayouts,
      artifacts: existingRecord?.snapshot.artifacts
    });
    refreshWorkspaceRegistryView(workspaceId);
  }, [
    graphSnapshot,
    refreshWorkspaceRegistryView,
    stageLayouts,
    composerTarget.nodeId,
    view.focusNodeId,
    workspaceId,
    workspaceReady
  ]);

  useEffect(() => {
    if (!synthesisRevealId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSynthesisRevealId(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [synthesisRevealId]);

  useEffect(() => {
    if (!roundtableArtifact) {
      return;
    }

    roundtableDrawerRef.current?.focus();
  }, [roundtableArtifact]);

  const handleSelectNode = (nodeId: string) => {
    startTransition(() => {
      setFocusedNodeId(nodeId);
      setErrorState(null);
    });
  };

  const handleSelectStageNode = (nodeId: string) => {
    handleSelectNode(nodeId);
    focusComposerSoon();
  };

  const handleLoadDemoWorkspace = () => {
    const snapshot = createDialogueDemoWorkspace();
    createWorkspaceRecord(snapshot);
    const activatedSnapshot = activateWorkspace(snapshot.workspaceId);
    if (!activatedSnapshot) {
      return;
    }

    branchGraphStore.setGraph(activatedSnapshot.graph);
    hydrateWorkspace({
      workspaceId: activatedSnapshot.workspaceId,
      workspaceSessionId: activatedSnapshot.workspaceSessionId,
      focusedNodeId: activatedSnapshot.focusedNodeId,
      composerParentId: activatedSnapshot.composerParentId,
      stageLayouts: activatedSnapshot.stageLayouts
    });
    refreshWorkspaceRegistryView(activatedSnapshot.workspaceId);
    const record = loadWorkspaceRecord(activatedSnapshot.workspaceId);
    if (record) {
      void emitDialogueTelemetry(
        buildWorkspaceResumedEvent(
          {
            activeWorkspaceId: activatedSnapshot.workspaceId,
            entry: record.entry,
            snapshot: activatedSnapshot,
            registry: record.registry
          },
          "switch"
        )
      );
    }
    setDraft("");
    clearRoundtableRuntime();
    setErrorState(null);
  };

  const handleCreateWorkspace = () => {
    const activeWorkspace = createWorkspace();
    if (!activeWorkspace) {
      setErrorState({
        title: "新建工作区失败",
        detail: "本地 registry 没有写入新的空工作区。",
        recovery: "稍后重试；如果反复失败，先检查 localStorage 是否可写。"
      });
      return;
    }

    branchGraphStore.setGraph(activeWorkspace.snapshot.graph);
    hydrateWorkspace({
      workspaceId: activeWorkspace.snapshot.workspaceId,
      workspaceSessionId: activeWorkspace.snapshot.workspaceSessionId,
      focusedNodeId: activeWorkspace.snapshot.focusedNodeId,
      composerParentId: activeWorkspace.snapshot.composerParentId,
      stageLayouts: activeWorkspace.snapshot.stageLayouts
    });
    refreshWorkspaceRegistryView(activeWorkspace.snapshot.workspaceId);
    setDraft("");
    clearRoundtableRuntime();
    setErrorState(null);
  };

  const handleSwitchWorkspace = (nextWorkspaceId: string) => {
    if (!nextWorkspaceId || nextWorkspaceId === workspaceId) {
      return;
    }

    const activatedSnapshot = activateWorkspace(nextWorkspaceId);
    if (!activatedSnapshot) {
      setErrorState({
        title: "切换工作区失败",
        detail: "目标工作区没有被恢复出来。",
        recovery: "稍后重试；如果反复失败，先检查本地 registry 是否完整。"
      });
      return;
    }

    branchGraphStore.setGraph(activatedSnapshot.graph);
    hydrateWorkspace({
      workspaceId: activatedSnapshot.workspaceId,
      workspaceSessionId: activatedSnapshot.workspaceSessionId,
      focusedNodeId: activatedSnapshot.focusedNodeId,
      composerParentId: activatedSnapshot.composerParentId,
      stageLayouts: activatedSnapshot.stageLayouts
    });
    refreshWorkspaceRegistryView(activatedSnapshot.workspaceId);
    const record = loadWorkspaceRecord(activatedSnapshot.workspaceId);
    if (record) {
      void emitDialogueTelemetry(
        buildWorkspaceResumedEvent(
          {
            activeWorkspaceId: activatedSnapshot.workspaceId,
            entry: record.entry,
            snapshot: activatedSnapshot,
            registry: record.registry
          },
          "switch"
        )
      );
    }
    setDraft("");
    clearRoundtableRuntime();
    setErrorState(null);
  };

  const handleRenameWorkspace = (title: string) => {
    if (!workspaceId) {
      return;
    }

    const renamed = renameWorkspace(workspaceId, title);
    if (!renamed) {
      setErrorState({
        title: "重命名工作区失败",
        detail: "registry metadata 没有更新成功。",
        recovery: "稍后重试；如果反复失败，先检查本地存储状态。"
      });
      return;
    }

    refreshWorkspaceRegistryView(workspaceId);
    setErrorState(null);
    setWorkspaceStatus(`工作区已重命名：${renamed.title}`);
  };

  const handleExportWorkspace = () => {
    if (!workspaceId) {
      setErrorState({
        title: "当前还没有可导出的工作区",
        detail: "先进入一个工作区，再导出 bundle。",
        recovery: "可以先载入示例谱系，或生成一轮正反。"
      });
      return;
    }

    try {
      const record = loadWorkspaceRecord(workspaceId);
      if (!record) {
        throw new Error("workspace_export_unavailable");
      }

      const blob = exportWorkspaceBundle(record);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${record.entry.title || workspaceId}.workspace.json`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setErrorState(null);
      setWorkspaceStatus(`工作区已导出：${record.entry.title || workspaceId}`);
    } catch {
      setErrorState({
        title: "导出工作区失败",
        detail: "当前工作区没有被序列化成 bundle。",
        recovery: "稍后重试；如果反复失败，先检查本地存储状态。"
      });
      setWorkspaceStatus("导出工作区失败");
    }
  };

  const handleImportWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const imported = await importWorkspaceBundleFile(file);
      saveWorkspaceRecord({
        id: imported.id,
        title: imported.title,
        snapshot: imported.snapshot,
        createdAt: imported.createdAt,
        updatedAt: imported.updatedAt,
        lastOpenedAt: imported.lastOpenedAt
      });
      setActiveWorkspaceId(imported.id);

      const activeWorkspace = loadActiveWorkspace();
      if (!activeWorkspace) {
        throw new Error("workspace_import_activation_failed");
      }

      branchGraphStore.setGraph(activeWorkspace.snapshot.graph);
      hydrateWorkspace({
        workspaceId: activeWorkspace.snapshot.workspaceId,
        workspaceSessionId: activeWorkspace.snapshot.workspaceSessionId,
        focusedNodeId: activeWorkspace.snapshot.focusedNodeId,
        composerParentId: activeWorkspace.snapshot.composerParentId,
        stageLayouts: activeWorkspace.snapshot.stageLayouts
      });
      setDraft("");
      clearRoundtableRuntime();
      setErrorState(null);
      setWorkspaceStatus(`工作区已导入：${imported.title}`);
    } catch (error: unknown) {
      setErrorState(formatWorkspaceBundleError(error));
      setWorkspaceStatus("导入工作区失败");
    }
  };

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || hasPendingRequest) {
      return;
    }

    const requestId = createClientId("req");
    const targetId = view.composerTarget.nodeId;
    beginPending("branches", {
      requestId,
      workspaceSessionId,
      focusSnapshotId: view.focusSnapshotId,
      composerTargetId: targetId
    });

    try {
      const contextMessages = serializeContextMessages(
        buildWorkspaceContext({
          targetId,
          queryText: text,
          systemPrelude: "",
          graph: graphSnapshot.graph,
          retrieval: { enabled: isDialogueWorkspaceRetrievalContextEnabled() }
        }).messages
      );
      const response = await postJson<BranchesResponse>("/api/branches", {
        requestId,
        userText: text,
        contextMessages
      });
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (
        !activePending ||
        activePending.requestId !== response.requestId ||
        activePending.workspaceSessionId !== useDialogueUiStore.getState().workspaceSessionId
      ) {
        return;
      }

      const userNodeId = targetId
        ? branchGraphStore.createChildUserNode(targetId, text)
        : branchGraphStore.createUserNode(text);
      branchGraphStore.createAssistantPair(userNodeId, {
        thesis: response.thesis,
        antithesis: response.antithesis
      });
      const updatedGraph = branchGraphStore.getGraph();
      const shouldAutoFocus = shouldAutoFocusPendingResult(activePending, updatedGraph);

      clearPending("branches");
      setDraft("");
      setErrorState(null);
      void emitDialogueTelemetry(
        buildContinuationCreatedEvent(updatedGraph, targetId)
      );
      if (shouldAutoFocus) {
        setWorkspaceStatus(null);
        startTransition(() => {
          setFocusedNodeId(userNodeId);
        });
      } else {
        setWorkspaceStatus("正反已生成：继续推进、暂缓判断，或留下合流记录。");
      }
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("branches");
      setErrorState(formatDialogueError(error));
    }
  };

  const handleGrowthSubmit = () => {
    const text = draft.trim();
    if (!text || hasPendingRequest) {
      return;
    }

    try {
      const requestId = createClientId("growth_req");
      const session = runGrowthSession({ text, requestId });
      const projection = projectGrowthSessionToGraph(branchGraphStore, session, {
        targetAssistantId: view.composerTarget.nodeId
      });

      setDraft("");
      setErrorState(null);
      setWorkspaceStatus("画作视角已生成：只回应当前事件，不写长期记忆。");
      startTransition(() => {
        setFocusedNodeId(projection.userNodeId);
      });
    } catch (error: unknown) {
      setErrorState(formatDialogueError(error));
    }
  };

  const handleSummonRoundtable = async () => {
    if (!view.currentNode || roundtablePending || !workspaceId) {
      return;
    }
    roundtableReturnFocusRef.current = roundtableSummonButtonRef.current;

    const requestId = createClientId("req");
    const sourceNodeId = view.currentNode.id;
    const focusNode = branchGraphStore.getGraph().nodes[sourceNodeId];
    const topic = [view.currentNode.text, view.currentNode.summary, focusNode?.meta?.summary]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n")
      .slice(0, 600);

    if (!topic.trim()) {
      setErrorState({
        title: "当前节点缺少可讨论内容",
        detail: "先选中有正文的节点，再召集圆桌。",
        recovery: "你也可以先生成一轮正反，再回来召集圆桌。"
      });
      return;
    }

    const requestSessionId = workspaceSessionId;
    const requestWorkspaceId = workspaceId;
    beginRoundtablePending({
      requestId,
      workspaceSessionId: requestSessionId,
      workspaceId: requestWorkspaceId,
      sourceNodeId,
      focusSnapshotId: view.focusSnapshotId
    });
    try {
      const response = await postJson<RoundtableResponse>("/api/roundtable", {
        requestId,
        command: "start",
        topic
      });
      const activeRequest = roundtablePendingRef.current;
      if (
        !activeRequest ||
        activeRequest.requestId !== response.requestId ||
        activeRequest.workspaceSessionId !== useDialogueUiStore.getState().workspaceSessionId ||
        activeRequest.sourceNodeId !== sourceNodeId
      ) {
        return;
      }

      const now = new Date().toISOString();
      const artifactId = createClientId("roundtable");
      const artifact: WorkspaceRoundtableArtifact = {
        id: artifactId,
        topic,
        sourceNodeId,
        createdAt: now,
        updatedAt: now,
        state: response.state
      };

      if (!saveRoundtableArtifact(activeRequest.workspaceId, artifact)) {
        throw new Error("workspace_roundtable_save_failed");
      }
      if (useDialogueUiStore.getState().focusedNodeId === activeRequest.sourceNodeId) {
        setWorkspaceStatus(null);
        setVisibleRoundtableArtifact(artifact);
      } else {
        setWorkspaceStatus(`圆桌已保存：${getDialogueNodeLabel(branchGraphStore.getGraph(), activeRequest.sourceNodeId)}`);
      }
      setErrorState(null);
    } catch (error: unknown) {
      const activeRequest = roundtablePendingRef.current;
      if (!activeRequest || activeRequest.requestId !== requestId) {
        return;
      }
      setErrorState(formatDialogueError(error));
    } finally {
      clearRoundtablePending(requestId);
    }
  };

  const handleDeepenRoundtable = async () => {
    if (!roundtableArtifact || roundtablePending || !workspaceId) {
      return;
    }

    const requestId = createClientId("req");
    const requestSessionId = workspaceSessionId;
    const requestWorkspaceId = workspaceId;
    const sourceNodeId = roundtableArtifact.sourceNodeId || view.currentNode?.id || "";
    if (!sourceNodeId) {
      return;
    }

    beginRoundtablePending({
      requestId,
      workspaceSessionId: requestSessionId,
      workspaceId: requestWorkspaceId,
      sourceNodeId,
      focusSnapshotId: view.focusSnapshotId
    });

    try {
      const response = await postJson<RoundtableResponse>("/api/roundtable", {
        requestId,
        command: "deepen",
        state: roundtableArtifact.state
      });
      const activeRequest = roundtablePendingRef.current;
      if (
        !activeRequest ||
        activeRequest.requestId !== response.requestId ||
        activeRequest.workspaceSessionId !== useDialogueUiStore.getState().workspaceSessionId ||
        activeRequest.sourceNodeId !== sourceNodeId
      ) {
        return;
      }

      const updatedArtifact: WorkspaceRoundtableArtifact = {
        ...roundtableArtifact,
        updatedAt: new Date().toISOString(),
        state: response.state
      };
      if (!saveRoundtableArtifact(activeRequest.workspaceId, updatedArtifact)) {
        throw new Error("workspace_roundtable_save_failed");
      }

      setErrorState(null);
      if (
        roundtableArtifactRef.current?.id === updatedArtifact.id &&
        useDialogueUiStore.getState().focusedNodeId === activeRequest.sourceNodeId
      ) {
        setVisibleRoundtableArtifact(updatedArtifact);
        setWorkspaceStatus("圆桌已深挖一轮：可以带回主线，或继续旁路讨论。");
      } else {
        setWorkspaceStatus("圆桌深挖结果已保存。");
      }
    } catch (error: unknown) {
      const activeRequest = roundtablePendingRef.current;
      if (!activeRequest || activeRequest.requestId !== requestId) {
        return;
      }
      setErrorState(formatDialogueError(error));
    } finally {
      clearRoundtablePending(requestId);
    }
  };

  const handlePromoteRoundtableAsQuestion = () => {
    if (!roundtableArtifact) {
      return;
    }
    const nextQuestion = roundtableArtifact.state.nextQuestion?.trim();
    if (!nextQuestion) {
      return;
    }
    if (roundtableArtifact.sourceNodeId) {
      startTransition(() => {
        setFocusedNodeId(roundtableArtifact.sourceNodeId);
        setComposerParentId(roundtableArtifact.sourceNodeId);
      });
    }
    setDraft(nextQuestion);
    setVisibleRoundtableArtifact(null);
    setErrorState(null);
    setWorkspaceStatus("已填入圆桌追问，可以继续生成正 / 反。");
    window.setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 0);
  };

  const focusRoundtableReturnTarget = useCallback((sourceNodeId?: string | null) => {
    const directTarget = [
      roundtableReturnFocusRef.current,
      roundtableSummonButtonRef.current,
      roundtableSavedButtonRef.current
    ].find((target) => target?.isConnected && !target.disabled);

    if (directTarget) {
      directTarget.focus();
      return;
    }

    if (!sourceNodeId || !graphSnapshot.graph.nodes[sourceNodeId]) {
      return;
    }

    startTransition(() => {
      setFocusedNodeId(sourceNodeId);
    });
    window.setTimeout(() => {
      const fallbackTarget = roundtableSummonButtonRef.current;
      if (fallbackTarget?.isConnected && !fallbackTarget.disabled) {
        fallbackTarget.focus();
      }
    }, 0);
  }, [graphSnapshot.graph, setFocusedNodeId]);

  const handleCloseRoundtableDrawer = useCallback(() => {
    const sourceNodeId = roundtableArtifact?.sourceNodeId || null;
    setVisibleRoundtableArtifact(null);
    window.setTimeout(() => focusRoundtableReturnTarget(sourceNodeId), 0);
  }, [focusRoundtableReturnTarget, roundtableArtifact?.sourceNodeId, setVisibleRoundtableArtifact]);

  useEffect(() => {
    if (!roundtableArtifact) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      handleCloseRoundtableDrawer();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseRoundtableDrawer, roundtableArtifact]);

  const handleGenerateSynthesis = async (action: DialogueSynthesisAction) => {
    if (!action.available || hasPendingRequest) {
      return;
    }

    const graph = graphSnapshot.graph;
    const thesisNode = graph.nodes[action.thesisId];
    const antithesisNode = graph.nodes[action.antithesisId];
    if (!thesisNode || !antithesisNode) {
      return;
    }

    const requestId = createClientId("req");
    beginPending("synthesis", {
      requestId,
      workspaceSessionId,
      focusSnapshotId: view.focusSnapshotId,
      composerTargetId: view.composerTarget.nodeId,
      sourceLabel: action.label,
      synthesisActionKey: action.key
    });

    try {
      const contextMessages = serializeContextMessages(
        buildWorkspaceContext({
          targetId: action.thesisId,
          queryText: buildSynthesisRetrievalQueryText(thesisNode, antithesisNode),
          systemPrelude: "",
          graph,
          retrieval: { enabled: isDialogueWorkspaceRetrievalContextEnabled() }
        }).messages
      );
      const response = await postJson<SynthesisResponse>("/api/synthesis", {
        requestId,
        thesis: {
          text: thesisNode.text || "",
          summary: thesisNode.meta?.summary || "",
          label: thesisNode.meta?.label || thesisNode.branchType || "正",
          stance: "正"
        },
        antithesis: {
          text: antithesisNode.text || "",
          summary: antithesisNode.meta?.summary || "",
          label: antithesisNode.meta?.label || antithesisNode.branchType || "反",
          stance: "反"
        },
        contextMessages
      });
      const activePending = useDialogueUiStore.getState().pending.synthesis;
      if (
        !activePending ||
        activePending.requestId !== response.requestId ||
        activePending.workspaceSessionId !== useDialogueUiStore.getState().workspaceSessionId
      ) {
        return;
      }

      const synthesisId = branchGraphStore.createSynthesisAssistant([action.thesisId, action.antithesisId], {
        text: response.synthesis.text,
        summary: response.synthesis.summary,
        label: response.synthesis.label
      });
      const updatedGraph = branchGraphStore.getGraph();
      const shouldAutoFocus = shouldAutoFocusPendingResult(activePending, updatedGraph);

      clearPending("synthesis");
      setErrorState(null);
      void emitDialogueTelemetry(buildSynthesisCreatedEvent(updatedGraph, synthesisId));
      if (shouldAutoFocus) {
        setWorkspaceStatus(null);
        setSynthesisRevealId(synthesisId);
        startTransition(() => {
          setFocusedNodeId(synthesisId);
        });
        window.setTimeout(() => {
          document.getElementById("conversation-panel-heading")?.focus();
        }, 0);
      } else {
        setWorkspaceStatus("合流已生成：查看合流记录，或基于它继续追问。");
      }
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.synthesis;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("synthesis");
      setErrorState(formatDialogueError(error));
    }
  };

  const relevantSynthesisAction = findRelevantSynthesisAction(
    graphSnapshot.graph,
    view.focusNodeId,
    view.availableSynthesisActions
  );
  const savedRoundtableArtifacts = listRoundtableArtifactsForNode(workspaceId, view.currentNode?.id);
  const latestSavedRoundtableArtifact = savedRoundtableArtifacts[0] || null;
  const roundtablePendingSourceNodeId = roundtablePendingRequest?.sourceNodeId || null;
  const roundtablePendingSourceLabel = getRoundtablePendingSourceLabel(
    graphSnapshot.graph,
    roundtablePendingSourceNodeId
  );
  const roundtableDrawerState = roundtableArtifact?.state || null;
  const roundtableLatestRound = roundtableDrawerState?.rounds.length
    ? roundtableDrawerState.rounds[roundtableDrawerState.rounds.length - 1]
    : null;
  const roundtableDrawerBusy = Boolean(
    roundtableArtifact && roundtablePendingRequest?.sourceNodeId === roundtableArtifact.sourceNodeId
  );
  const synthesisPendingActionKey = pending.synthesis?.synthesisActionKey || null;
  const isSynthesisPendingForCurrentAction = Boolean(
    relevantSynthesisAction && synthesisPendingActionKey === relevantSynthesisAction.key
  );
  const synthesisBlockedByOtherPending = Boolean(
    relevantSynthesisAction && hasPendingRequest && !isSynthesisPendingForCurrentAction
  );
  const synthesisPendingSourceLabel = pending.synthesis?.sourceLabel || null;
  const pendingRootPrompt = pending.branches && !pending.branches.composerTargetId && isEmptyWorkspace
    ? draft.trim()
    : null;
  const pendingRootSidebar = pendingRootPrompt
    ? {
        label: getShortPromptLabel(pendingRootPrompt),
        summary: "正在生成正与反。"
      }
    : null;
  const stagePendingPreview = pending.branches
    ? {
        kind: "branches" as const,
        anchorNodeId: pending.branches.composerTargetId,
        prompt: draft
      }
    : pending.synthesis && relevantSynthesisAction && pending.synthesis.synthesisActionKey === relevantSynthesisAction.key
      ? {
          kind: "synthesis" as const,
          thesisId: relevantSynthesisAction.thesisId,
          antithesisId: relevantSynthesisAction.antithesisId,
          label: pending.synthesis.sourceLabel || relevantSynthesisAction.label
        }
      : null;
  const nextStepChoice =
    view.currentNode?.kind === "user" &&
    composerTarget.kind === "root" &&
    relevantSynthesisAction?.available
      ? {
          currentLabel: getPlainTextSnippet(view.currentNode.text || view.currentNode.label, 30) || view.currentNode.label,
          thesisLabel: getDialogueNodeLabel(graphSnapshot.graph, relevantSynthesisAction.thesisId),
          antithesisLabel: getDialogueNodeLabel(graphSnapshot.graph, relevantSynthesisAction.antithesisId),
          thesisSummary: getDialogueNodeSnippet(graphSnapshot.graph, relevantSynthesisAction.thesisId),
          antithesisSummary: getDialogueNodeSnippet(graphSnapshot.graph, relevantSynthesisAction.antithesisId),
          synthesisLabel: relevantSynthesisAction.label,
          synthesisBusy: isSynthesisPendingForCurrentAction,
          synthesisDisabled: hasPendingRequest || synthesisBlockedByOtherPending,
          onSelectThesis: () => handleSelectStageNode(relevantSynthesisAction.thesisId),
          onSelectAntithesis: () => handleSelectStageNode(relevantSynthesisAction.antithesisId),
          onSynthesize: () => handleGenerateSynthesis(relevantSynthesisAction)
        }
      : null;
  const flowStatusHandledInContext = Boolean(
    (nextStepChoice && workspaceStatus?.startsWith("正反已生成")) ||
    workspaceStatus?.startsWith("画作视角已生成")
  );
  const retrievalDebugPreview = useMemo(() => {
    if (!retrievalDebugPreviewEnabled) {
      return null;
    }

    const targetId = composerTarget.nodeId || view.focusNodeId;
    const queryText = buildRetrievalDebugPreviewQueryText({
      draft,
      currentNode: view.currentNode,
      graph: graphSnapshot.graph,
      synthesisAction: relevantSynthesisAction
    });
    const built = buildWorkspaceContext({
      targetId,
      queryText,
      systemPrelude: "",
      graph: graphSnapshot.graph,
      retrieval: {
        enabled: true,
        maxNodes: 6,
        maxEdges: 10,
        charBudget: 900
      }
    });
    const subgraph = built.retrieval?.subgraph;
    const omitted = subgraph?.omitted || {
      matches: 0,
      nodes: 0,
      edges: 0,
      excludedNodes: 0,
      danglingEdges: 0,
      duplicateEdges: 0
    };
    const notes = [
      !queryText.trim() ? "empty query" : null,
      queryText.trim() && !subgraph?.seedMatches.length ? "no seed matches" : null,
      built.coverage.coveredNodeIds.length > 0 ? "coverage exclusion active" : null,
      omitted.excludedNodes > 0 ? "retrieval hits were excluded by coverage" : null,
      omitted.matches || omitted.nodes || omitted.edges ? "result was clamped by retrieval limits" : null,
      !built.retrieval?.message && (subgraph?.nodes.length || 0) > 0 ? "render produced empty content" : null,
      ...(subgraph?.warnings || []).map((warning) => `warning: ${warning}`)
    ].filter((note): note is string => Boolean(note));

    return {
      content: built.retrieval?.message?.content || "",
      queryText,
      coveredNodeCount: built.coverage.coveredNodeIds.length,
      nodeCount: subgraph?.nodes.length || 0,
      edgeCount: subgraph?.edges.length || 0,
      omitted,
      notes
    };
  }, [
    composerTarget.nodeId,
    draft,
    graphSnapshot.graph,
    relevantSynthesisAction,
    retrievalDebugPreviewEnabled,
    view.currentNode,
    view.focusNodeId
  ]);

  if (!workspaceReady) {
    return (
      <main className={styles.shell} data-testid="dialogue-shell" aria-busy="true">
        <div className={styles.ambient} />
        <div className={styles.ambientSecondary} />
        <div className={styles.ambientTertiary} />
        <section className={styles.bootPanel} role="status" aria-live="polite" data-testid="dialogue-boot">
          <p className={styles.eyebrow}>Anicca 对话场</p>
          <h1>正在恢复工作区</h1>
          <p>先接回本地谱系，再开放舞台和续写入口。</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell} data-testid="dialogue-shell">
      <div className={styles.ambient} />
      <div className={styles.ambientSecondary} />
      <div className={styles.ambientTertiary} />

      <header className={styles.hero}>
        <p className={styles.eyebrow}>Anicca 对话场</p>
        <h1>让一个问题，先分岔，再收束。</h1>
        <p className={styles.heroCopy}>
          把它放进场里，先长出正与反；等张力清楚了，再触发一次合流并留下记录。
        </p>
      </header>

      <WorkspaceBar
        currentWorkspaceId={workspaceId}
        currentTitle={
          workspaceEntries.find((entry) => entry.id === workspaceId)?.title || "未命名工作区"
        }
        items={workspaceEntries}
        statusMessage={workspaceStatus}
        onCreate={handleCreateWorkspace}
        onSelect={handleSwitchWorkspace}
        onRename={handleRenameWorkspace}
        onExport={handleExportWorkspace}
        onImport={() => importInputRef.current?.click()}
      />
      <input
        ref={importInputRef}
        data-testid="dialogue-import-input"
        type="file"
        accept="application/json"
        tabIndex={-1}
        aria-hidden="true"
        className={styles.hiddenFileInput}
        onChange={handleImportWorkspace}
      />
      {workspaceStatus && !flowStatusHandledInContext ? (
        <p className={styles.flowStatus} aria-hidden="true" data-testid="dialogue-flow-status">
          {workspaceStatus}
        </p>
      ) : null}

      <div className={styles.workspace} data-mode={nextStepChoice ? "choice" : undefined}>
        <BubbleStage
          layoutKey={view.focusSnapshotId}
          nodes={view.stageNodes}
          focusNodeId={view.focusNodeId}
          convergenceEventId={relevantSynthesisAction?.synthesisId || null}
          eventNodeId={synthesisRevealId}
          pendingPreview={stagePendingPreview}
          onSelect={handleSelectStageNode}
          onPrimaryAction={(nodeId) => {
            if (!nodeId) {
              focusComposerSoon();
            }
          }}
          emptyAction={
            demoWorkspaceEnabled && isEmptyWorkspace
              ? {
                  label: "载入示例谱系",
                  onTrigger: handleLoadDemoWorkspace
                }
              : null
          }
        />
        <BranchSidebar
          breadcrumb={view.breadcrumb}
          items={view.sidebarItems}
          pendingRoot={pendingRootSidebar}
          onSelect={handleSelectNode}
        />
        <ConversationPanel
          node={view.currentNode}
          pendingBranchPrompt={pendingRootPrompt}
          synthesisAction={relevantSynthesisAction}
          synthesisPending={isSynthesisPendingForCurrentAction}
          synthesisBlocked={synthesisBlockedByOtherPending}
          synthesisPendingSourceLabel={synthesisPendingSourceLabel}
          suppressSynthesisAction={Boolean(nextStepChoice && !hasPendingRequest)}
          roundtablePending={roundtablePending}
          roundtablePendingSourceLabel={roundtablePendingSourceLabel}
          roundtableSummonButtonRef={roundtableSummonButtonRef}
          roundtableSavedButtonRef={roundtableSavedButtonRef}
          savedRoundtableCount={savedRoundtableArtifacts.length}
          onGenerateSynthesis={handleGenerateSynthesis}
          onSelectSource={handleSelectNode}
          onSummonRoundtable={handleSummonRoundtable}
          onOpenSavedRoundtable={() => {
            if (latestSavedRoundtableArtifact) {
              roundtableReturnFocusRef.current = roundtableSavedButtonRef.current;
              setVisibleRoundtableArtifact(latestSavedRoundtableArtifact);
            }
          }}
        />
        {retrievalDebugPreview ? (
          <aside className={styles.retrievalDebugPanel} data-testid="dialogue-retrieval-debug" aria-label="Retrieval debug preview">
            <div className={styles.retrievalDebugHeader}>
              <span>retrieval_context preview</span>
              <small>
                nodes {retrievalDebugPreview.nodeCount} · edges {retrievalDebugPreview.edgeCount} · excluded {retrievalDebugPreview.coveredNodeCount}
              </small>
            </div>
            <dl className={styles.retrievalDebugStats}>
              <div>
                <dt>query</dt>
                <dd>{retrievalDebugPreview.queryText || "(empty)"}</dd>
              </div>
              <div>
                <dt>omitted</dt>
                <dd>
                  matches {retrievalDebugPreview.omitted.matches} · nodes {retrievalDebugPreview.omitted.nodes} · edges {retrievalDebugPreview.omitted.edges}
                </dd>
              </div>
              <div>
                <dt>graph hygiene</dt>
                <dd>
                  dangling {retrievalDebugPreview.omitted.danglingEdges} · duplicate {retrievalDebugPreview.omitted.duplicateEdges}
                </dd>
              </div>
            </dl>
            {retrievalDebugPreview.notes.length ? (
              <ul className={styles.retrievalDebugNotes}>
                {retrievalDebugPreview.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            {retrievalDebugPreview.content ? (
              <pre>{retrievalDebugPreview.content}</pre>
            ) : (
              <p>无可注入片段</p>
            )}
          </aside>
        ) : null}
        {shouldShowComposer ? (
          <DialogueComposer
            target={composerTarget}
            value={draft}
            disabled={hasPendingRequest}
            pendingAction={pendingAction}
            nextStepChoice={nextStepChoice}
            isEmptyStart={isEmptyWorkspace}
            emptyStartOpen={emptyComposerOpen}
            targetFrozen={composerTargetFrozen}
            targetFrozenReason={composerTargetFrozenReason}
            errorState={errorState}
            textareaRef={composerTextareaRef}
            onChange={handleDraftChange}
            onSubmit={handleSubmit}
            onGrowthSubmit={handleGrowthSubmit}
          />
        ) : null}
      </div>

      {roundtableArtifact ? (
        <aside
          ref={roundtableDrawerRef}
          className={styles.roundtableDrawer}
          role="region"
          aria-labelledby="dialogue-roundtable-drawer-title"
          tabIndex={-1}
          data-testid="dialogue-roundtable-drawer"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              handleCloseRoundtableDrawer();
            }
          }}
        >
          <header className={styles.roundtableDrawerHeader}>
            <p className={styles.eyebrow}>Roundtable Theater</p>
            <h2 id="dialogue-roundtable-drawer-title">圆桌会议剧场</h2>
          </header>
          <p className={styles.roundtableDrawerTopic}>{roundtableArtifact.topic}</p>

          <section className={styles.roundtableParticipants} aria-label="参会者">
            {(roundtableDrawerState?.participants || []).length ? (
              roundtableDrawerState!.participants.slice(0, 5).map((participant) => (
                <article className={styles.roundtableParticipant} key={participant.name}>
                  <strong>{participant.name}</strong>
                  <span>{participant.stance}</span>
                </article>
              ))
            ) : (
              <p className={styles.roundtableEmpty}>这场圆桌还没有生成参会者。</p>
            )}
          </section>

          <section className={styles.roundtableInsights} aria-label="圆桌结论">
            <article>
              <span>核心争议</span>
              <p>{roundtableArtifact.state.lastCoreTension || roundtableLatestRound?.coreTension || "（无）"}</p>
            </article>
            <article>
              <span>下一问</span>
              <p>{roundtableArtifact.state.nextQuestion || roundtableLatestRound?.nextQuestion || "（无）"}</p>
            </article>
          </section>

          <div className={styles.roundtableDrawerActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handlePromoteRoundtableAsQuestion}
              disabled={!roundtableArtifact.state.nextQuestion?.trim()}
            >
              带回主线
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleDeepenRoundtable}
              disabled={roundtableArtifact.state.status !== "active" || roundtableDrawerBusy}
              aria-busy={roundtableDrawerBusy ? "true" : undefined}
            >
              {roundtableDrawerBusy ? "深挖中..." : "深挖一轮"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleCloseRoundtableDrawer}
            >
              收起
            </button>
          </div>

          {roundtableLatestRound ? (
            <section className={styles.roundtableRound} aria-label="最新一轮发言">
              <div className={styles.roundtableRoundHeader}>
                <span>最新一轮</span>
                <strong>{roundtableLatestRound.guidingQuestion}</strong>
              </div>
              <div className={styles.roundtableUtterances}>
                {roundtableLatestRound.utterances.map((utterance, index) => (
                  <article className={styles.roundtableUtterance} key={`${utterance.speaker}-${index}`}>
                    <header>
                      <strong>{utterance.speaker}</strong>
                      <span>{utterance.action}</span>
                    </header>
                    <p>{utterance.text}</p>
                    {utterance.summary ? <small>{utterance.summary}</small> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className={styles.roundtableRound} aria-label="最新一轮发言">
              <p className={styles.roundtableEmpty}>圆桌已保存，下一轮深挖后会在这里展开发言现场。</p>
            </section>
          )}
        </aside>
      ) : null}
    </main>
  );
}
