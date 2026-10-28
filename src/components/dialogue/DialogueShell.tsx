"use client";

import { appPath } from "@/lib/appPath";
import { SeedGuide } from "./SeedGuide";
import { useLiquidRenderer } from "./useLiquidRenderer";
import { LIQUID_RENDERER_OPTIONS, type LiquidRendererStatus } from "./liquid/preference";
import { EvolutionOverview } from "./EvolutionOverview";

import {
  ChangeEvent,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { SeedInspector } from "@/components/dialogue/SeedInspector";
import { SeedReadingContent } from "@/components/dialogue/SeedReadingContent";
import { DialogueComposer } from "@/components/dialogue/DialogueComposer";
import { PerspectiveControls } from "@/components/dialogue/PerspectiveControls";
import { annotatePerspective, normalizeThinkingSpace, perspectiveLabel, type AxisSuggestion, type ThinkingAxis, type ThinkingSpace } from "@/features/perspectives/model";
import { normalizePolarityOrigin, polarityAxis } from "@/features/perspectives/polarity";
import { readSeedOrbit, readSpatialFrame, separateSpatialSeeds, type SeedViewDirection } from "./liquid/space";
import { WorkspaceBar } from "@/components/dialogue/WorkspaceBar";
import { createDialogueDemoWorkspace } from "@/features/dialectic/demoWorkspace";
import { isAbortError } from "@/features/dialectic/api";
import { deferredSyntheses, readUnderstandingChange } from "@/features/dialectic/meaning";
import { buildComparisonSeeds } from "@/features/dialectic/novelty";
import { inquiryQuestion, readInquiryTarget, type InquiryTarget, type InquiryOrigin } from "@/features/dialectic/inquiry";
import { loadComposerDraft, saveComposerDraft, type ComposerDraft } from "@/lib/persist/composerDraft";
import {
  commitBranchesResult,
  commitPolarityResult,
  commitSeedSplitResult,
  commitSynthesisResult,
  DialogueController,
  ownsPendingResponse
} from "@/features/dialectic/controller";
import { observeDialogueViewport } from "@/features/dialectic/platform";
import { buildSeedContext, fissionPair, seedLabel } from "@/features/dialectic/seeds";
import { buildSeedInstanceScene, seedConceptId, seedInstancePairAction, sourceInstances, unfoldedSourcePositions, separatedEncounterPositions } from "@/features/dialectic/seedInstances";
import { arrangeSeedScene } from "@/features/dialectic/seedPlacement";
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
import { useDialogueTheme } from "./useDialogueTheme";
import { useReadingJournal } from "./useReadingJournal";


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

function formatDialogueError(error: unknown): DialogueErrorState {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "";

  if (message.startsWith("invalid_model_output")) {
    return {
      title: "这次回答还不完整",
      detail: "这次结果没有写入，已有想法和当前草稿都已保留。",
      recovery: "可以重试上次，或调整输入后生成。"
    };
  }

  if (message.includes("openai_api_key_missing")) {
    return {
      title: "生成服务暂未就绪",
      detail: "这次没有生成新内容，已有想法和当前草稿都已保留。",
      recovery: "可以先继续写，稍后再重试上次。"
    };
  }

  if (message.includes("provider_auth_failed")) {
    return {
      title: "生成服务暂时无法响应",
      detail: "这次没有生成新内容，已有想法和当前草稿都已保留。",
      recovery: "可以先继续写，稍后再重试上次。"
    };
  }

  if (message.includes("provider_unreachable")) {
    return {
      title: "模型服务暂时不可达",
      detail: "这轮请求没有连到模型服务。",
      recovery: "可以重试上次，或先保留草稿继续思考。"
    };
  }

  if (message.includes("provider_rate_limited")) {
    return {
      title: "模型服务触发限流",
      detail: "上游暂时拒绝了过多请求，当前图和圆桌记录都没有被改动。",
      recovery: "稍等一会儿再重试上次，也可以先继续写。"
    };
  }

  if (message.includes("provider_overloaded")) {
    return {
      title: "模型服务负载已满",
      detail: "上游当前没有容量处理这轮请求，当前图和圆桌记录都没有被改动。",
      recovery: "稍后再重试上次，已有想法和当前草稿都已保留。"
    };
  }

  if (message.startsWith("polarities_failed")) {
    return { title: "这一轮两端没有展开", detail: "起点仍在原处，没有留下半颗种子。", recovery: "稍后重试，或换一条维度再看。" };
  }

  if (message.startsWith("branches_failed")) {
    return {
      title: "这一轮正反没有生成出来",
      detail: "主线图保持了原样，没有留下半截节点。",
      recovery: "可以重试上次，或先沿已有种子继续思考。"
    };
  }

  if (message.startsWith("synthesis_failed")) {
    return {
      title: "这一轮收束没有完成",
      detail: "正与反还在原处，图状态没有被破坏。",
      recovery: "可以重试上次，或先沿正反两端继续思考。"
    };
  }

  return {
    title: "这轮生成出了点问题",
    detail: "当前图状态没有被改坏，你可以直接再试一次。",
    recovery: "可以重试上次；也可以继续写，准备好后再生成。"
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
  const response = await fetch(appPath(url), {
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
  if (!node) {
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
    kind: node.kind === "assistant" ? "assistant" : "seed",
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
  if (!currentFocusedNodeId && pendingRequest.focusSnapshotId.startsWith("focus:root|")) return true;
  return deriveDialogueView(graph, currentFocusedNodeId).focusSnapshotId === pendingRequest.focusSnapshotId;
}

type SeedExpansionResult = { sourceId: string; firstId: string; secondId: string; axis?: ThinkingAxis; lens?: string };

export function DialogueShell() {
  const { theme, preference: themePreference, selectTheme } = useDialogueTheme();
  const { rendererMode, selectRenderer } = useLiquidRenderer();
  const [rendererStatus, setRendererStatus] = useState<LiquidRendererStatus | null>(null);
  const graphSnapshot = useSyncExternalStore(
    branchGraphStore.subscribe.bind(branchGraphStore),
    branchGraphStore.getSnapshot.bind(branchGraphStore),
    branchGraphStore.getSnapshot.bind(branchGraphStore)
  );
  const [draft, setDraftState] = useState("");
  const draftSnapshotRef = useRef<ComposerDraft>({ text: "", targetId: null });
  const draftWorkspaceRef = useRef<string | null>(null);
  const unsavedDraftsRef = useRef(new Map<string, ComposerDraft>());
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [inquiryTarget, setInquiryTarget] = useState<InquiryTarget | null>(null);
  const setDraft = useCallback((value: string) => {
    draftSnapshotRef.current = { ...draftSnapshotRef.current, text: value };
    setDraftState(value);
  }, []);
  const flushDraft = useCallback(() => {
    if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
    const owner = draftWorkspaceRef.current;
    if (!owner) return true;
    const saved = saveComposerDraft(owner, draftSnapshotRef.current);
    if (saved) unsavedDraftsRef.current.delete(owner);
    else unsavedDraftsRef.current.set(owner, draftSnapshotRef.current);
    return saved;
  }, []);
  const draftVersionRef = useRef(0);
  const attentionVersionRef = useRef(0);
  const submittedTextRef = useRef("");
  const [emptyComposerOpen, setEmptyComposerOpen] = useState(false);
  const [demoWorkspaceEnabled, setDemoWorkspaceEnabled] = useState(false);
  const [retrievalDebugPreviewEnabled, setRetrievalDebugPreviewEnabled] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(() => branchGraphStore.getGraph().entryIds.length > 0);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceRegistryEntry[]>([]);
  const [roundtableArtifact, setRoundtableArtifact] = useState<WorkspaceRoundtableArtifact | null>(null);
  const [roundtablePendingRequest, setRoundtablePendingRequest] = useState<RoundtablePendingRequest | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);
  const [generationAnnouncement, setGenerationAnnouncement] = useState<string | null>(null);
  const [synthesisRevealId, setSynthesisRevealId] = useState<string | null>(null);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const evolutionReturnFocusRef = useRef<HTMLElement | null>(null);
  const [readingOpen, setReadingOpen] = useState(false);
  const [guideRequest, setGuideRequest] = useState(0);
  const [atmosphereVisible, setAtmosphereVisible] = useState(false);
  const [axisSuggestions, setAxisSuggestions] = useState<AxisSuggestion[]>([]);
  const [cameraView, setCameraView] = useState<{ direction: SeedViewDirection | "reset"; revision: number } | null>(null);
  const pendingPerspectiveRef = useRef<ThinkingSpace | null>(null);
  const [combineSourceId, setCombineSourceId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<DialogueSynthesisAction | null>(null);
  const [activeDeferredId, setActiveDeferredId] = useState<string | null>(null);
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [expansionResult, setExpansionResult] = useState<SeedExpansionResult | null>(null);
  const dismissSeedReading = useCallback(() => {
    attentionVersionRef.current += 1;
    setReadingOpen(false);
    setCombineSourceId(null);
    setActiveDeferredId(null);
  }, []);
  const openEvolution = useCallback(() => {
    attentionVersionRef.current += 1;
    evolutionReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    evolutionReturnFocusRef.current?.blur();
    setEvolutionOpen(true); setLineageOpen(false);
  }, []);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const composerRootRef = useRef<HTMLFormElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const readingMotionRef = useRef<"instant" | "soft">("instant");
  const roundtableDrawerRef = useRef<HTMLElement | null>(null);
  const lineageDrawerRef = useRef<HTMLDivElement | null>(null);
  const roundtableSummonButtonRef = useRef<HTMLButtonElement | null>(null);
  const roundtableSavedButtonRef = useRef<HTMLButtonElement | null>(null);
  const roundtableReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const roundtablePendingRef = useRef<RoundtablePendingRequest | null>(null);
  const roundtableArtifactRef = useRef<WorkspaceRoundtableArtifact | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const dialogueControllerRef = useRef<DialogueController | null>(null);
  if (!dialogueControllerRef.current) {
    dialogueControllerRef.current = new DialogueController();
  }
  const workspaceId = useDialogueUiStore((state) => state.workspaceId);
  const workspaceSessionId = useDialogueUiStore((state) => state.workspaceSessionId);
  const retryRef = useRef<{ sessionId: string; run: () => void; error?: DialogueErrorState } | null>(null);
  const focusedNodeId = useDialogueUiStore((state) => state.focusedNodeId);
  const composerParentId = useDialogueUiStore((state) => state.composerParentId);
  const stageLayouts = useDialogueUiStore((state) => state.stageLayouts);
  const seedInstances = useDialogueUiStore((state) => state.seedInstances);
  const thinkingSpace = useDialogueUiStore((state) => state.thinkingSpace);
  const setThinkingSpace = useDialogueUiStore((state) => state.setThinkingSpace);
  const arrangeStage = useDialogueUiStore((state) => state.arrangeStage);
  useLayoutEffect(() => {
    setAxisSuggestions([]); setCameraView(null); pendingPerspectiveRef.current = null;
    setActiveInstanceId(null); setExpandedResultId(null); setExpansionResult(null);
    setEvolutionOpen(false);
    setActiveDeferredId(null); setConnectionTargetId(null);
  }, [workspaceSessionId]);
  const pendingAction = useDialogueUiStore((state) => state.pendingAction);
  const pending = useDialogueUiStore((state) => state.pending);
  const errorState = useDialogueUiStore((state) => state.errorState);
  const hydrateWorkspace = useDialogueUiStore((state) => state.hydrateWorkspace);
  const setFocusedNodeId = useDialogueUiStore((state) => state.setFocusedNodeId);
  const setComposerParentId = useDialogueUiStore((state) => state.setComposerParentId);
  const beginPending = useDialogueUiStore((state) => state.beginPending);
  const clearPending = useDialogueUiStore((state) => state.clearPending);
  const cancelPendingRequests = useDialogueUiStore((state) => state.cancelPendingRequests);
  const setErrorState = useDialogueUiStore((state) => state.setErrorState);
  const { getReadingPosition, rememberReadingPosition } = useReadingJournal({
    workspaceId, sessionId: workspaceSessionId, ready: workspaceReady, graph: graphSnapshot.graph, instances: seedInstances,
    readingOpen, activeId: seedConceptId(graphSnapshot.graph, seedInstances, activeInstanceId) === focusedNodeId ? activeInstanceId : focusedNodeId,
    setReadingOpen,
    onRestore: (instanceId, conceptId) => {
      readingMotionRef.current = "instant";
      setActiveInstanceId(instanceId); setFocusedNodeId(conceptId);
    }
  });

  useEffect(() => {
    const pointer = () => { readingMotionRef.current = "soft"; };
    const keyboard = () => { readingMotionRef.current = "instant"; };
    const activate = (event: MouseEvent) => { if (event.detail === 0) keyboard(); };
    document.addEventListener("pointerdown", pointer, true); document.addEventListener("keydown", keyboard, true); document.addEventListener("click", activate, true);
    return () => { document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("keydown", keyboard, true); document.removeEventListener("click", activate, true); };
  }, []);

  // Restore before paint so a workspace cannot briefly display or accept edits
  // into its predecessor's draft. Flush the previous owner before changing it.
  useLayoutEffect(() => {
    if (!workspaceReady || !workspaceId || draftWorkspaceRef.current === workspaceId) return;
    flushDraft();
    const restored = unsavedDraftsRef.current.get(workspaceId) || loadComposerDraft(workspaceId, branchGraphStore.getGraph());
    draftWorkspaceRef.current = workspaceId;
    draftSnapshotRef.current = restored || { text: "", targetId: useDialogueUiStore.getState().composerParentId };
    setDraftState(restored?.text || ""); setInquiryTarget(restored?.inquiry || null);
    setConnectionTargetId(restored?.connectionId || null); setDraftSaveError(unsavedDraftsRef.current.has(workspaceId));
    if (restored) setComposerParentId(restored.targetId);
    setDraftOwner(workspaceId);
  }, [workspaceReady, workspaceId, flushDraft, setComposerParentId]);

  useEffect(() => {
    if (!workspaceReady || draftOwner !== workspaceId || draftWorkspaceRef.current !== workspaceId) return;
    draftSnapshotRef.current = { text: draft, targetId: composerParentId,
      ...(inquiryTarget ? { inquiry: inquiryTarget } : {}), ...(connectionTargetId ? { connectionId: connectionTargetId } : {}) };
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => setDraftSaveError(!flushDraft()), 160);
  }, [draft, composerParentId, inquiryTarget, connectionTargetId, draftOwner, workspaceId, workspaceReady, flushDraft]);

  useEffect(() => {
    const save = () => { setDraftSaveError(!flushDraft()); };
    const hide = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save); document.addEventListener("visibilitychange", hide);
    return () => { flushDraft(); window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", hide); };
  }, [flushDraft]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    let focusFrame: number | null = null;
    const stop = observeDialogueViewport((viewport) => {
      shell.style.setProperty("--dialogue-viewport-height", `${viewport.height}px`);
      shell.style.setProperty("--dialogue-viewport-offset-top", `${viewport.offsetTop}px`);
      shell.style.setProperty("--dialogue-keyboard-inset", `${viewport.keyboardInset}px`);
      shell.dataset.keyboardOpen = viewport.keyboardInset > 96 ? "true" : "false";
      if (focusFrame !== null) { window.cancelAnimationFrame(focusFrame); focusFrame = null; }
      if (viewport.keyboardInset > 96 && composerTextareaRef.current?.closest('[data-inline="true"]')) {
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = null;
          const field = composerTextareaRef.current;
          if (field && document.activeElement === field) field.closest<HTMLElement>('form[data-inline="true"]')?.scrollIntoView?.({ block: "nearest" });
        });
      }
    });
    return () => { stop(); if (focusFrame !== null) window.cancelAnimationFrame(focusFrame); };
  }, []);

  useEffect(() => {
    const controller = dialogueControllerRef.current;
    return () => controller?.cancelAll();
  }, []);

  const setVisibleRoundtableArtifact = useCallback((artifact: WorkspaceRoundtableArtifact | null) => {
    roundtableArtifactRef.current = artifact;
    setRoundtableArtifact(artifact);
  }, []);

  const openRoundtableArtifact = useCallback((artifact: WorkspaceRoundtableArtifact) => {
    setVisibleRoundtableArtifact(artifact);
  }, [setVisibleRoundtableArtifact]);

  useEffect(() => {
    if (!roundtableArtifact?.id) {
      return;
    }
    roundtableDrawerRef.current?.focus();
  }, [roundtableArtifact?.id]);

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
      stageLayouts: activeWorkspace.snapshot.stageLayouts,
      seedInstances: activeWorkspace.snapshot.seedInstances,
      thinkingSpace: activeWorkspace.snapshot.thinkingSpace
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

  const view = useMemo(() => deriveDialogueView(graphSnapshot.graph, focusedNodeId), [graphSnapshot, focusedNodeId]);
  const focusedInstanceId = seedConceptId(graphSnapshot.graph, seedInstances, activeInstanceId) === view.focusNodeId
    ? activeInstanceId : view.focusNodeId;
  const visibleExpansion = useMemo<SeedExpansionResult | null>(() => {
    if (expansionResult) return expansionResult;
    const node = graphSnapshot.graph.nodes[view.focusNodeId || ""];
    const ordinaryPair = node && fissionPair(graphSnapshot.graph, node.id);
    if (ordinaryPair) return { ...ordinaryPair,
      lens: node.meta?.fissionFrame ? perspectiveLabel(normalizeThinkingSpace(node.meta.fissionFrame)) : undefined };
    const origin = normalizePolarityOrigin(node?.meta?.polarity);
    if (!origin || !node?.parents[0]) return null;
    const siblings = (graphSnapshot.graph.nodes[node.parents[0]]?.children || []).map(id => graphSnapshot.graph.nodes[id])
      .filter(sibling => normalizePolarityOrigin(sibling?.meta?.polarity)?.groupId === origin.groupId);
    const first = siblings.find(sibling => sibling.meta?.polarity?.pole === -1);
    const second = siblings.find(sibling => sibling.meta?.polarity?.pole === 1);
    return first && second ? { sourceId: node.parents[0], firstId: first.id, secondId: second.id, axis: polarityAxis(origin),
      lens: perspectiveLabel({ ...origin.frame, focus: Object.fromEntries(Object.entries(origin.frame.focus).filter(([id]) => id !== origin.axisId)) }) } : null;
  }, [expansionResult, graphSnapshot, view.focusNodeId]);
  const encounters = useMemo(() => deferredSyntheses(graphSnapshot.graph), [graphSnapshot]);
  const connectionTarget = encounters.find(item => item.id === connectionTargetId && !item.resolvedNodeId);
  const activeEncounter = encounters.find(item => item.id === activeDeferredId && !item.resolvedNodeId);
  const encounterInstances = useMemo(() => {
    const encounter = activeEncounter || connectionTarget;
    return encounter?.sourceNodeIds.map((id, index) => {
      const instance = encounter.sourceInstanceIds?.[index];
      return instance && seedConceptId(graphSnapshot.graph, seedInstances, instance) === id ? instance : id;
    });
  }, [activeEncounter, connectionTarget, graphSnapshot, seedInstances]);
  const seedScene = useMemo(() => arrangeSeedScene(buildSeedInstanceScene({
    graph: graphSnapshot.graph, instances: seedInstances, focusId: view.focusNodeId,
    activeInstanceId: focusedInstanceId, expandedResultId, thinkingSpace,
    pinnedInstanceIds: selectedPair?.sourceInstanceIds || encounterInstances || (combineSourceId ? [combineSourceId]
      : visibleExpansion ? [visibleExpansion.sourceId, visibleExpansion.firstId, visibleExpansion.secondId] : [])
  })), [graphSnapshot, seedInstances, view.focusNodeId, focusedInstanceId, expandedResultId, thinkingSpace, selectedPair, encounterInstances, combineSourceId, visibleExpansion]);
  const attentionIds = useMemo(() => {
    if (selectedPair?.sourceInstanceIds) return selectedPair.sourceInstanceIds;
    if (encounterInstances) return encounterInstances;
    if (expandedResultId) return [expandedResultId, ...sourceInstances(graphSnapshot.graph, seedInstances, expandedResultId)];
    if (visibleExpansion) return [visibleExpansion.sourceId, visibleExpansion.firstId, visibleExpansion.secondId];
    const sources = focusedInstanceId ? sourceInstances(graphSnapshot.graph, seedInstances, focusedInstanceId) : [];
    if (sources.length) return [focusedInstanceId!, ...sources];
    if (readingOpen && focusedInstanceId) return [focusedInstanceId, ...(graphSnapshot.graph.nodes[view.currentNode?.id || ""]?.parents || [])];
    return null;
  }, [selectedPair, encounterInstances, expandedResultId, graphSnapshot, seedInstances, visibleExpansion, focusedInstanceId, readingOpen, view.currentNode]);
  const resolveSeedPair = useCallback((left: string, right: string) => seedInstancePairAction(graphSnapshot.graph, seedInstances, left, right), [graphSnapshot, seedInstances]);
  const isEmptyWorkspace = graphSnapshot.graph.entryIds.length === 0;
  const isBranchPending = pending.branches !== null;
  const isSynthesisPending = pending.synthesis !== null;
  const hasPendingRequest = isBranchPending || isSynthesisPending;
  const composerPerspectiveLabel = pending.branches?.polarityAxis
    ? `${pending.branches.polarityAxis.negative} ↔ ${pending.branches.polarityAxis.positive}`
    : perspectiveLabel(hasPendingRequest && pendingPerspectiveRef.current ? pendingPerspectiveRef.current : thinkingSpace);
  const roundtablePending = roundtablePendingRequest !== null;
  const frozenComposerTarget = pending.branches
    ? getComposerTargetFromNodeId(graphSnapshot.graph, pending.branches.composerTargetId)
    : pending.synthesis
      ? getSynthesisPendingComposerTarget(pending.synthesis)
      : null;
  const composerTarget = frozenComposerTarget || getComposerTargetFromNodeId(graphSnapshot.graph, composerParentId);
  const composerTargetFrozenReason = pending.branches ? "branches" : pending.synthesis ? "synthesis" : null;
  const composerTargetFrozen = Boolean(frozenComposerTarget);
  const inlineInquiry = Boolean(readingOpen && inquiryTarget && inquiryTarget.sourceNodeId === view.currentNode?.id &&
    !combineSourceId && !activeDeferredId && !evolutionOpen);
  const companionId = visibleExpansion ? visibleExpansion.firstId === view.currentNode?.id ? visibleExpansion.secondId
    : visibleExpansion.secondId === view.currentNode?.id ? visibleExpansion.firstId : undefined : undefined;

  useEffect(() => {
    const shell = shellRef.current, composer = composerRootRef.current;
    if (!shell || !composer) return;
    const syncComposerHeight = () => {
      const height = Math.ceil(composer.getBoundingClientRect().height);
      if (height > 0) shell.style.setProperty("--dialogue-composer-height", `${height}px`);
    };
    syncComposerHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncComposerHeight);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [workspaceReady, inlineInquiry]);

  const closeSeedPanel = useCallback(() => {
    dismissSeedReading();
    setLineageOpen(false);
    const id = focusedInstanceId;
    window.setTimeout(() => {
      const button = document.querySelector<HTMLElement>(`[data-testid="dialogue-stage-node-${id}"]`);
      (button || composerTextareaRef.current)?.focus();
    }, 0);
  }, [dismissSeedReading, focusedInstanceId]);

  const closeLineagePanel = useCallback(() => {
    setLineageOpen(false);
    window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="dialogue-more-button"]')?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!lineageOpen) return;
    const timer = window.setTimeout(() => lineageDrawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [lineageOpen]);

  useEffect(() => { setGenerationAnnouncement(null); }, [workspaceSessionId]);

  useEffect(() => {
    if (!readingOpen || roundtableArtifactRef.current) return;
    const timer = window.setTimeout(() => document.getElementById("conversation-panel-heading")?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [readingOpen, view.currentNode?.id, combineSourceId]);

  useEffect(() => {
    if ((!readingOpen && !lineageOpen) || roundtableArtifact || evolutionOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) { event.preventDefault(); if (lineageOpen) closeLineagePanel(); else closeSeedPanel(); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [readingOpen, lineageOpen, roundtableArtifact, evolutionOpen, closeSeedPanel, closeLineagePanel]);

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
    setLineageOpen(false);
    setReadingOpen(false);
    setCombineSourceId(null);
    setSelectedPair(null);
  };

  const focusComposerSoon = useCallback(() => {
    setEmptyComposerOpen(true);
    window.setTimeout(() => {
      const field = composerTextareaRef.current;
      field?.focus({ preventScroll: true });
      if (field?.closest('[data-inline="true"]')) field.scrollIntoView?.({ block: "nearest" });
    }, 0);
  }, []);

  const handleDraftChange = useCallback((value: string) => {
    draftVersionRef.current += 1;
    attentionVersionRef.current += 1;
    const state = useDialogueUiStore.getState();
    const hasRetry = retryRef.current?.sessionId === state.workspaceSessionId && retryRef.current?.error === state.errorState;
    if (!state.pendingAction && !hasRetry) {
      retryRef.current = null;
      setErrorState(null);
    }
    if (isEmptyWorkspace) {
      setEmptyComposerOpen(true);
    }
    setDraft(value);
  }, [isEmptyWorkspace, setErrorState, setDraft]);

  useEffect(() => {
    setEmptyComposerOpen(false);
  }, [workspaceId]);

  useEffect(() => {
    if (view.focusNodeId !== focusedNodeId) {
      setFocusedNodeId(view.focusNodeId);
    }
  }, [focusedNodeId, setFocusedNodeId, view.focusNodeId]);

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
      seedInstances,
      thinkingSpace,
      artifacts: existingRecord?.snapshot.artifacts
    });
    refreshWorkspaceRegistryView(workspaceId);
  }, [
    graphSnapshot,
    refreshWorkspaceRegistryView,
    stageLayouts,
    seedInstances,
    thinkingSpace,
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

  const handleSelectNode = (nodeId: string, fromOverview = false) => {
    attentionVersionRef.current += 1;
    setActiveDeferredId(null);
    if (!fromOverview && combineSourceId && !selectedPair && !hasPendingRequest) {
      const pair = resolveSeedPair(combineSourceId, nodeId);
      if (pair) {
        setReadingOpen(false);
        setLineageOpen(false);
        void handleGenerateSynthesis(pair);
      }
      return;
    }
    const conceptId = seedConceptId(graphSnapshot.graph, seedInstances, nodeId);
    if (!conceptId) return;
    if (fromOverview) setCombineSourceId(null);
    if (expansionResult && ![expansionResult.sourceId, expansionResult.firstId, expansionResult.secondId].some(id =>
      seedConceptId(graphSnapshot.graph, seedInstances, id) === conceptId)) setExpansionResult(null);
    setActiveInstanceId(nodeId);
    startTransition(() => {
      setFocusedNodeId(conceptId);
      // Browsing is independent of the destination of unfinished writing.
      if (!hasPendingRequest && !draft.trim() && !inquiryTarget && !connectionTargetId) setComposerParentId(conceptId);
    });
    setLineageOpen(false);
    setReadingOpen(true);
  };

  const handleSelectStageNode = (nodeId: string) => {
    handleSelectNode(nodeId);
  };

  const handleCreateInstance = () => {
    if (!view.currentNode?.text?.trim() || hasPendingRequest) return;
    attentionVersionRef.current += 1;
    const id = useDialogueUiStore.getState().addSeedInstance(view.currentNode.id);
    setActiveInstanceId(id);
    setExpandedResultId(null);
    useDialogueUiStore.getState().endStagePreview();
    dismissSeedReading();
    setGenerationAnnouncement("已创建分身，与原种子共享内容，可以分别组合。");
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-testid="dialogue-stage-node-${id}"]`)?.focus(), 0);
  };

  const handleRemoveInstance = () => {
    if (!focusedInstanceId || !seedInstances[focusedInstanceId] || hasPendingRequest) return;
    attentionVersionRef.current += 1;
    useDialogueUiStore.getState().removeSeedInstance(focusedInstanceId);
    setActiveInstanceId(view.focusNodeId);
    setExpandedResultId(null);
    useDialogueUiStore.getState().endStagePreview();
    dismissSeedReading();
    setGenerationAnnouncement("已收起这个分身，概念和融合记录仍保留。");
  };

  const handleExpandSources = () => {
    if (!focusedInstanceId) return;
    const graph = graphSnapshot.graph;
    const sources = sourceInstances(graph, seedInstances, focusedInstanceId);
    if (!sources.length) return;
    attentionVersionRef.current += 1;
    const nodes = arrangeSeedScene(buildSeedInstanceScene({ graph, instances: seedInstances,
      focusId: view.focusNodeId, activeInstanceId: focusedInstanceId, expandedResultId: focusedInstanceId, thinkingSpace }));
    const state = useDialogueUiStore.getState(), key = `seeds:${workspaceId || "local"}`;
    const layout = state.stagePreview?.layoutKey === key ? state.stagePreview.view : state.stageLayouts[key];
    state.beginStagePreview(key,
      unfoldedSourcePositions(nodes, layout?.nodePositions || {}, focusedInstanceId, sources, false),
      unfoldedSourcePositions(nodes, layout?.compact?.nodePositions || {}, focusedInstanceId, sources, true));
    setExpandedResultId(focusedInstanceId);
    setExpansionResult(null);
    dismissSeedReading();
    setGenerationAnnouncement("来源已展开，合与来源均保留，可以继续拖动或阅读。");
  };

  const handleLoadDemoWorkspace = () => {
    flushDraft();
    dialogueControllerRef.current?.cancelAll();
    cancelPendingRequests();
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
      stageLayouts: activatedSnapshot.stageLayouts,
      seedInstances: activatedSnapshot.seedInstances,
      thinkingSpace: activatedSnapshot.thinkingSpace
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
    clearRoundtableRuntime();
    setErrorState(null);
  };

  const handleCreateWorkspace = () => {
    flushDraft();
    dialogueControllerRef.current?.cancelAll();
    cancelPendingRequests();
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
      stageLayouts: activeWorkspace.snapshot.stageLayouts,
      seedInstances: activeWorkspace.snapshot.seedInstances,
      thinkingSpace: activeWorkspace.snapshot.thinkingSpace
    });
    refreshWorkspaceRegistryView(activeWorkspace.snapshot.workspaceId);
    clearRoundtableRuntime();
    setErrorState(null);
  };

  const handleSwitchWorkspace = (nextWorkspaceId: string) => {
    if (!nextWorkspaceId || nextWorkspaceId === workspaceId) {
      return;
    }

    flushDraft();
    dialogueControllerRef.current?.cancelAll();
    cancelPendingRequests();

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
      stageLayouts: activatedSnapshot.stageLayouts,
      seedInstances: activatedSnapshot.seedInstances,
      thinkingSpace: activatedSnapshot.thinkingSpace
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
      dialogueControllerRef.current?.cancelAll();
      cancelPendingRequests();
      const imported = await importWorkspaceBundleFile(file);
      saveWorkspaceRecord({
        id: imported.id,
        title: imported.title,
        snapshot: imported.snapshot,
        createdAt: imported.createdAt,
        updatedAt: imported.updatedAt,
        lastOpenedAt: imported.lastOpenedAt
      });
      flushDraft();
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
        stageLayouts: activeWorkspace.snapshot.stageLayouts,
        seedInstances: activeWorkspace.snapshot.seedInstances,
        thinkingSpace: activeWorkspace.snapshot.thinkingSpace
      });
      clearRoundtableRuntime();
      setErrorState(null);
      setWorkspaceStatus(`工作区已导入：${imported.title}`);
    } catch (error: unknown) {
      setErrorState(formatWorkspaceBundleError(error));
      setWorkspaceStatus("导入工作区失败");
    }
  };

  const handleSubmit = async (splitSeedId?: string, retry?: { text: string; targetId: string | null; draftVersion: number; perspective?: ThinkingSpace }, frame?: ThinkingSpace) => {
    const text = retry?.text ?? (splitSeedId ? graphSnapshot.graph.nodes[splitSeedId]?.text?.trim() || "" : draft.trim());
    if (!text || useDialogueUiStore.getState().pendingAction) {
      return;
    }

    const requestId = createClientId("req");
    const targetId = retry ? retry.targetId : splitSeedId || composerTarget.nodeId;
    const draftVersion = retry?.draftVersion ?? draftVersionRef.current;
    const attentionVersion = attentionVersionRef.current;
    const source = splitSeedId ? graphSnapshot.graph.nodes[splitSeedId] : null;
    const inheritedFrame = normalizePolarityOrigin(source?.meta?.polarity)?.frame || source?.meta?.fissionFrame;
    const requestPerspective = normalizeThinkingSpace(retry?.perspective || frame || inheritedFrame || useDialogueUiStore.getState().thinkingSpace);
    pendingPerspectiveRef.current = requestPerspective;
    submittedTextRef.current = text;
    setExpansionResult(null); setExpandedResultId(null);
    useDialogueUiStore.getState().endStagePreview();
    retryRef.current = { sessionId: workspaceSessionId, run: () => { void handleSubmit(splitSeedId, { text, targetId, draftVersion, perspective: requestPerspective }); } };
    beginPending("branches", {
      requestId,
      workspaceSessionId,
      focusSnapshotId: view.focusSnapshotId,
      composerTargetId: targetId
    });

    try {
      const contextMessages = [...(targetId ? buildSeedContext(graphSnapshot.graph, [targetId]) : []), ...serializeContextMessages(
        buildWorkspaceContext({
          targetId,
          queryText: text,
          systemPrelude: "",
          graph: graphSnapshot.graph,
          retrieval: { enabled: isDialogueWorkspaceRetrievalContextEnabled() }
        }).messages
      )];
      const response = await dialogueControllerRef.current!.generateBranches({
        requestId,
        userText: text,
        perspective: requestPerspective,
        contextMessages,
        ...(targetId ? { comparisonSeeds: buildComparisonSeeds(graphSnapshot.graph, targetId) } : {})
      });
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!ownsPendingResponse(
        activePending,
        response.requestId,
        useDialogueUiStore.getState().workspaceSessionId
      )) {
        return;
      }

      let resultFocusId: string;
      let nextExpansion: SeedExpansionResult | null = null;
      if (splitSeedId) {
        const pair = commitSeedSplitResult(branchGraphStore, splitSeedId, response, requestPerspective);
        nextExpansion = { sourceId: focusedInstanceId && seedConceptId(graphSnapshot.graph, seedInstances, focusedInstanceId) === splitSeedId
          ? focusedInstanceId : splitSeedId, firstId: pair.thesisId, secondId: pair.antithesisId, lens: perspectiveLabel(requestPerspective) };
        resultFocusId = splitSeedId;
      } else {
        resultFocusId = commitBranchesResult(branchGraphStore, {
          targetAssistantId: targetId, userText: text, response, perspective: annotatePerspective(requestPerspective)
        }).userNodeId;
      }
      const updatedGraph = branchGraphStore.getGraph();
      setAxisSuggestions(response.suggestedAxes || []);
      const shouldAutoFocus = attentionVersion === attentionVersionRef.current && shouldAutoFocusPendingResult(activePending, updatedGraph);

      clearPending("branches");
      setGenerationAnnouncement("正反已生成，点开种子可以阅读或组合。");
      if (!splitSeedId && draftVersion === draftVersionRef.current) setDraft("");
      retryRef.current = null;
      setErrorState(null);
      void emitDialogueTelemetry(
        buildContinuationCreatedEvent(updatedGraph, targetId)
      );
      if (shouldAutoFocus) {
        setExpansionResult(nextExpansion);
        setComposerParentId(null);
        setReadingOpen(false);
        setWorkspaceStatus(null);
        startTransition(() => {
          setFocusedNodeId(resultFocusId);
        });
      } else {
        setWorkspaceStatus("正反已生成。");
      }
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("branches");
      if (isAbortError(error)) {
        return;
      }
      const formatted = formatDialogueError(error);
      if (retryRef.current) retryRef.current.error = formatted;
      setGenerationAnnouncement(null);
      setErrorState(formatted);
    }
  };

  const handlePolarityExpansion = async (seedId: string, axisId: string, frame: ThinkingSpace,
    retry?: { text: string; sourceInstanceId: string; contextMessages: ReturnType<typeof buildSeedContext> }) => {
    const text = retry?.text ?? graphSnapshot.graph.nodes[seedId]?.text?.trim() ?? "";
    if (!text || useDialogueUiStore.getState().pendingAction) return;
    const requestPerspective = normalizeThinkingSpace(frame);
    const axis = requestPerspective.axes.find(item => item.id === axisId);
    if (!axis) return;
    const sourceInstanceId = retry?.sourceInstanceId || (focusedInstanceId &&
      seedConceptId(graphSnapshot.graph, seedInstances, focusedInstanceId) === seedId ? focusedInstanceId : seedId);
    const contextMessages = retry?.contextMessages || buildSeedContext(graphSnapshot.graph, [seedId]);
    const requestId = createClientId("req"), attentionVersion = attentionVersionRef.current;
    pendingPerspectiveRef.current = requestPerspective;
    submittedTextRef.current = text;
    retryRef.current = { sessionId: workspaceSessionId, run: () => {
      void handlePolarityExpansion(seedId, axisId, requestPerspective, { text, sourceInstanceId, contextMessages });
    } };
    setReadingOpen(false); setCombineSourceId(null); setExpansionResult(null); setExpandedResultId(null);
    useDialogueUiStore.getState().endStagePreview();
    beginPending("branches", { requestId, workspaceSessionId, focusSnapshotId: view.focusSnapshotId,
      composerTargetId: seedId, polarityAxis: axis });
    try {
      const response = await dialogueControllerRef.current!.generatePolarity({ requestId, userText: text,
        contextMessages, perspective: requestPerspective, axisId });
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!ownsPendingResponse(activePending, response.requestId, useDialogueUiStore.getState().workspaceSessionId)) return;
      const pair = commitPolarityResult(branchGraphStore, seedId, requestPerspective, response);
      const shouldAutoFocus = attentionVersion === attentionVersionRef.current &&
        shouldAutoFocusPendingResult(activePending, branchGraphStore.getGraph());
      clearPending("branches");
      retryRef.current = null; setErrorState(null);
      setGenerationAnnouncement(`已沿「${axis.label}」展开「${axis.negative}」与「${axis.positive}」，两端都可以继续正反裂变。`);
      if (shouldAutoFocus) {
        setActiveInstanceId(sourceInstanceId);
        setExpansionResult({ sourceId: sourceInstanceId, firstId: pair.negativeId, secondId: pair.positiveId, axis,
          lens: perspectiveLabel({ ...requestPerspective, focus: Object.fromEntries(Object.entries(requestPerspective.focus).filter(([id]) => id !== axis.id)) }) });
        setComposerParentId(null); setWorkspaceStatus(null);
        startTransition(() => setFocusedNodeId(seedId));
      } else setWorkspaceStatus(`「${axis.negative}」与「${axis.positive}」已生成。`);
    } catch (error) {
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!activePending || activePending.requestId !== requestId) return;
      clearPending("branches");
      if (isAbortError(error)) return;
      const formatted = formatDialogueError(error);
      if (retryRef.current) retryRef.current.error = formatted;
      setGenerationAnnouncement(null); setErrorState(formatted);
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
          targetAssistantId: composerTarget.nodeId
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

  const handleCancelPending = () => {
    const activeSlot = useDialogueUiStore.getState().pendingAction;
    if (!activeSlot) {
      return;
    }

    dialogueControllerRef.current?.cancel(activeSlot);
    clearPending(activeSlot);
    setSelectedPair(null);
    setCombineSourceId(null);
    setGenerationAnnouncement(null);
    setWorkspaceStatus(activeSlot === "synthesis" ? "已取消本次合流。" : "已取消本次生成，输入内容仍保留。");
  };

  const handleContinueFromCurrentNode = (frame?: ThinkingSpace) => {
    const currentNodeId = view.currentNode?.id || null;
    const currentNode = currentNodeId ? graphSnapshot.graph.nodes[currentNodeId] : null;
    if (!currentNode) {
      return;
    }

    setReadingOpen(false);
    void handleSubmit(currentNode.id, undefined, frame);
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
        openRoundtableArtifact(artifact);
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
      const artifactStillVisible = roundtableArtifactRef.current?.id === updatedArtifact.id;
      const focusStillAtSource = useDialogueUiStore.getState().focusedNodeId === activeRequest.sourceNodeId;
      if (artifactStillVisible) {
        setVisibleRoundtableArtifact(updatedArtifact);
      }
      if (artifactStillVisible && focusStillAtSource) {
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
    setReadingOpen(false);
    setVisibleRoundtableArtifact(null);
    setErrorState(null);
    setWorkspaceStatus("已填入圆桌追问，可以继续生成正 / 反。");
    window.setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 0);
  };

  const focusRoundtableReturnTarget = useCallback(() => {
    const directTarget = [
      roundtableReturnFocusRef.current,
      roundtableSummonButtonRef.current,
      roundtableSavedButtonRef.current
    ].find((target) => target?.isConnected && !target.disabled);

    if (directTarget) {
      directTarget.focus();
      return;
    }

    // More-menu items unmount when chosen; return to their persistent trigger.
    document.querySelector<HTMLButtonElement>('[data-testid="dialogue-more-button"]')?.focus();
  }, []);

  const handleCloseRoundtableDrawer = useCallback(() => {
    setVisibleRoundtableArtifact(null);
    window.setTimeout(focusRoundtableReturnTarget, 0);
  }, [focusRoundtableReturnTarget, setVisibleRoundtableArtifact]);

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

  const handleGenerateSynthesis = async (action: DialogueSynthesisAction, retryPerspective?: ThinkingSpace,
    connection?: { encounterId: string; text: string; draftVersion: number }) => {
    if (!action.available || useDialogueUiStore.getState().pendingAction) {
      return;
    }

    const graph = graphSnapshot.graph;
    const thesisNode = graph.nodes[action.thesisId];
    const antithesisNode = graph.nodes[action.antithesisId];
    if (!thesisNode || !antithesisNode) {
      return;
    }
    const rootInput = [thesisNode.text, antithesisNode.text].filter(Boolean).join("\n\n");
    if (!rootInput.trim()) return;
    const requestPerspective = normalizeThinkingSpace(retryPerspective || useDialogueUiStore.getState().thinkingSpace);
    pendingPerspectiveRef.current = requestPerspective;
    retryRef.current = { sessionId: workspaceSessionId, run: () => { void handleGenerateSynthesis(action, requestPerspective, connection); } };
    const attentionVersion = attentionVersionRef.current;
    setSelectedPair(action);
    setExpansionResult(null);
    setCombineSourceId(null);
    setReadingOpen(false);
    setActiveDeferredId(null);

    const requestId = createClientId("req");
    beginPending("synthesis", {
      requestId,
      workspaceSessionId,
      focusSnapshotId: view.focusSnapshotId,
      composerTargetId: composerTarget.nodeId,
      sourceLabel: action.label,
      synthesisActionKey: action.key
    });

    try {
      const contextMessages = [
        ...buildSeedContext(graph, [action.thesisId, action.antithesisId]),
        ...serializeContextMessages(buildWorkspaceContext({
          targetId: action.thesisId, queryText: buildSynthesisRetrievalQueryText(thesisNode, antithesisNode),
          systemPrelude: "", graph, retrieval: { enabled: isDialogueWorkspaceRetrievalContextEnabled() }
        }).messages.filter((message) => message.role === "system"))
      ];
      const response = await dialogueControllerRef.current!.generateSynthesis({
        requestId,
        rootInput,
        perspective: requestPerspective,
        ...(connection ? { connectionInput: connection.text } : {}),
        sources: [{
          id: thesisNode.id,
          text: thesisNode.text || "",
          summary: thesisNode.meta?.summary || "",
          label: thesisNode.meta?.label || thesisNode.branchType || "正",
          stance: thesisNode.branchType || (normalizePolarityOrigin(thesisNode.meta?.polarity) ? "视角" : "想法")
        }, {
          id: antithesisNode.id,
          text: antithesisNode.text || "",
          summary: antithesisNode.meta?.summary || "",
          label: antithesisNode.meta?.label || antithesisNode.branchType || "反",
          stance: antithesisNode.branchType || (normalizePolarityOrigin(antithesisNode.meta?.polarity) ? "视角" : "想法")
        }],
        contextMessages
      });
      const activePending = useDialogueUiStore.getState().pending.synthesis;
      if (!ownsPendingResponse(
        activePending,
        response.requestId,
        useDialogueUiStore.getState().workspaceSessionId
      )) {
        return;
      }

      if (response.outcome === "deferred") {
        const shouldReveal = attentionVersion === attentionVersionRef.current && shouldAutoFocusPendingResult(activePending, graph);
        branchGraphStore.deferSynthesis({ id: response.requestId, ...response.deferred,
          sourceNodeIds: [action.thesisId, action.antithesisId], sourceInstanceIds: action.sourceInstanceIds,
          perspective: requestPerspective, createdAt: new Date().toISOString(), connectionInput: connection?.text });
        clearPending("synthesis"); setSelectedPair(null); setCombineSourceId(null); setErrorState(null);
        retryRef.current = null;
        setGenerationAnnouncement("暂不融合，两颗想法已保留。可以分别继续，也可以补充联系。");
        if (connection && connection.draftVersion === draftVersionRef.current) { setDraft(""); setConnectionTargetId(null); }
        if (shouldReveal) {
          const state = useDialogueUiStore.getState(), key = `seeds:${workspaceId || "local"}`;
          const ids = action.sourceInstanceIds || [action.thesisId, action.antithesisId];
          const nodes = arrangeSeedScene(buildSeedInstanceScene({ graph: branchGraphStore.getGraph(), instances: state.seedInstances,
            focusId: action.thesisId, activeInstanceId: ids[0], expandedResultId: null, thinkingSpace: state.thinkingSpace, pinnedInstanceIds: ids }));
          const layout = state.stagePreview?.layoutKey === key ? state.stagePreview.view : state.stageLayouts[key];
          let wide = separatedEncounterPositions(nodes, layout?.nodePositions || {}, ids, false);
          let compact = separatedEncounterPositions(nodes, layout?.compact?.nodePositions || {}, ids, true);
          const track = shellRef.current?.querySelector<HTMLElement>('[data-testid="dialogue-stage-track"]');
          const frame = track && readSpatialFrame(track), bounds = track?.parentElement?.getBoundingClientRect();
          if (track && frame && bounds?.width && bounds.height) {
            const orbit = readSeedOrbit(track), narrow = window.matchMedia("(max-width: 980px)").matches;
            if (Math.abs(orbit.yaw) + Math.abs(orbit.pitch) > .001) {
              const separated = separateSpatialSeeds(narrow ? compact : wide, ids, orbit, bounds, frame.height, frame.scale, narrow);
              if (narrow) compact = separated; else wide = separated;
            }
          }
          state.endStagePreview(); state.setStageNodePositions(key, wide, compact);
          setActiveInstanceId(action.sourceInstanceIds?.[0] || action.thesisId);
          setFocusedNodeId(action.thesisId); setActiveDeferredId(response.requestId);
          setExpandedResultId(null); setReadingOpen(true); setWorkspaceStatus(null);
        } else setWorkspaceStatus("暂不融合，原因已留在来源种子的「暂存的相遇」中。");
        return;
      }
      const synthesisId = commitSynthesisResult(branchGraphStore, {
        thesisId: action.thesisId,
        antithesisId: action.antithesisId,
        sourceInstanceIds: action.sourceInstanceIds,
        response,
        connectionInput: connection?.text
      });
      if (connection) {
        branchGraphStore.resolveDeferredSynthesis(connection.encounterId, synthesisId);
        if (connection.draftVersion === draftVersionRef.current) setDraft("");
        setConnectionTargetId(null);
      }
      setAxisSuggestions(response.suggestedAxes || []);
      const updatedGraph = branchGraphStore.getGraph();
      const shouldAutoFocus = attentionVersion === attentionVersionRef.current && shouldAutoFocusPendingResult(activePending, updatedGraph);

      clearPending("synthesis");
      setGenerationAnnouncement("合已生成，可以阅读来源或继续写。");
      retryRef.current = null;
      setSelectedPair(null);
      setCombineSourceId(null);
      setErrorState(null);
      void emitDialogueTelemetry(buildSynthesisCreatedEvent(updatedGraph, synthesisId));
      if (shouldAutoFocus) {
        setActiveInstanceId(synthesisId);
        setExpandedResultId(null);
        useDialogueUiStore.getState().endStagePreview();
        setComposerParentId(null);
        setWorkspaceStatus(null);
        setSynthesisRevealId(synthesisId);
        startTransition(() => {
          setFocusedNodeId(synthesisId);
        });
      } else {
        setWorkspaceStatus("合流已生成，继续从这里想。");
      }
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.synthesis;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("synthesis");
      setSelectedPair(null);
      if (isAbortError(error)) {
        return;
      }
      const formatted = formatDialogueError(error);
      if (retryRef.current) retryRef.current.error = formatted;
      setGenerationAnnouncement(null);
      setErrorState(formatted);
    }
  };

  const continueDeferred = (id: string) => {
    const encounter = encounters.find(item => item.id === id && !item.resolvedNodeId);
    if (!encounter || hasPendingRequest) return;
    attentionVersionRef.current += 1;
    setInquiryTarget(null); setConnectionTargetId(id); setActiveDeferredId(null); setReadingOpen(false); setCombineSourceId(null);
    if (!draft.trim() && encounter.connectionInput) handleDraftChange(encounter.connectionInput);
    focusComposerSoon();
  };

  const startInquiry = (target: InquiryTarget) => {
    const valid = readInquiryTarget(target, graphSnapshot.graph);
    if (!valid || hasPendingRequest) return;
    attentionVersionRef.current += 1;
    setInquiryTarget(valid); setConnectionTargetId(null); setComposerParentId(valid.sourceNodeId);
    setReadingOpen(true); setCombineSourceId(null);
    if (!draft.trim() || (inquiryTarget && draft === inquiryQuestion(inquiryTarget.intent))) handleDraftChange(inquiryQuestion(valid.intent));
    focusComposerSoon();
  };

  const submitInquiry = async (retry?: { origin: InquiryOrigin; draftVersion: number; perspective: ThinkingSpace }) => {
    const target = readInquiryTarget(retry?.origin || inquiryTarget, branchGraphStore.getGraph());
    const question = retry?.origin.question || draft.trim();
    if (!target || !question || useDialogueUiStore.getState().pendingAction) return;
    const origin = { ...target, question }, draftVersion = retry?.draftVersion ?? draftVersionRef.current;
    const requestId = createClientId("inquiry_req"), attentionVersion = attentionVersionRef.current;
    const source = branchGraphStore.getGraph().nodes[target.sourceNodeId];
    const inheritedFrame = normalizePolarityOrigin(source.meta?.polarity)?.frame || source.meta?.fissionFrame;
    const frame = normalizeThinkingSpace(retry?.perspective || inheritedFrame || useDialogueUiStore.getState().thinkingSpace);
    pendingPerspectiveRef.current = frame; submittedTextRef.current = question;
    setExpansionResult(null); setExpandedResultId(null);
    beginPending("branches", { requestId, workspaceSessionId, focusSnapshotId: view.focusSnapshotId,
      composerTargetId: target.sourceNodeId, inquiry: true });
    retryRef.current = { sessionId: workspaceSessionId, run: () => { void submitInquiry({ origin, draftVersion, perspective: frame }); } };
    try {
      const response = await dialogueControllerRef.current!.generateInquiry({ requestId, origin,
        sourceText: branchGraphStore.getGraph().nodes[target.sourceNodeId].text!, perspective: frame,
        contextMessages: buildSeedContext(branchGraphStore.getGraph(), [target.sourceNodeId]) });
      const active = useDialogueUiStore.getState().pending.branches;
      if (!ownsPendingResponse(active, response.requestId, useDialogueUiStore.getState().workspaceSessionId)) return;
      const { responseId } = branchGraphStore.createInquiry(origin, { ...response.inquiry, fissionFrame: frame });
      clearPending("branches"); retryRef.current = null; setErrorState(null);
      if (draftVersion === draftVersionRef.current) { setDraft(""); setInquiryTarget(null); setComposerParentId(responseId); }
      setGenerationAnnouncement("这一句的回应已保存，可以接着想。");
      if (attentionVersion === attentionVersionRef.current && shouldAutoFocusPendingResult(active, branchGraphStore.getGraph())) {
        setFocusedNodeId(responseId); setReadingOpen(true);
      }
    } catch (error) {
      if (useDialogueUiStore.getState().pending.branches?.requestId !== requestId) return;
      clearPending("branches");
      if (isAbortError(error)) return;
      const formatted = formatDialogueError(error); if (retryRef.current) retryRef.current.error = formatted;
      setGenerationAnnouncement(null); setErrorState(formatted);
    }
  };

  const rememberIdea = () => {
    if (!draft.trim() || hasPendingRequest || inquiryTarget || connectionTarget) return;
    const text = draft.trim(), perspective = annotatePerspective(thinkingSpace);
    const id = composerTarget.nodeId ? branchGraphStore.createChildUserNode(composerTarget.nodeId, text, perspective)
      : branchGraphStore.createUserNode(text, perspective);
    setDraft(""); setComposerParentId(null); setFocusedNodeId(id); setReadingOpen(false);
    setGenerationAnnouncement("已记下，想继续时再展开。");
  };

  const submitComposer = () => {
    if (inquiryTarget) { void submitInquiry(); return; }
    if (!connectionTarget) { void handleSubmit(); return; }
    if (hasPendingRequest || !draft.trim()) return;
    const ids = connectionTarget.sourceNodeIds.map((id, index) => {
      const saved = connectionTarget.sourceInstanceIds?.[index];
      return saved && seedConceptId(graphSnapshot.graph, seedInstances, saved) === id ? saved : id;
    });
    const pair = resolveSeedPair(ids[0], ids[1]);
    if (pair) void handleGenerateSynthesis(pair, connectionTarget.perspective, {
      encounterId: connectionTarget.id, text: draft.trim(), draftVersion: draftVersionRef.current
    });
  };

  const relevantSynthesisAction = selectedPair || findRelevantSynthesisAction(
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
  const pendingRootPrompt = pending.branches && !pending.branches.composerTargetId && isEmptyWorkspace
    ? submittedTextRef.current
    : null;
  const pendingRootSidebar = pendingRootPrompt
    ? {
        label: getShortPromptLabel(pendingRootPrompt),
        summary: "正在生成正与反。"
      }
    : null;
  const stagePendingPreview = pending.branches?.inquiry ? null : pending.branches
    ? {
        kind: "branches" as const,
        anchorNodeId: pending.branches.composerTargetId,
        prompt: submittedTextRef.current,
        polarityAxis: pending.branches.polarityAxis
      }
    : pending.synthesis && relevantSynthesisAction && pending.synthesis.synthesisActionKey === relevantSynthesisAction.key
      ? {
          kind: "synthesis" as const,
          thesisId: relevantSynthesisAction.sourceInstanceIds?.[0] || relevantSynthesisAction.thesisId,
          antithesisId: relevantSynthesisAction.sourceInstanceIds?.[1] || relevantSynthesisAction.antithesisId,
          label: pending.synthesis.sourceLabel || relevantSynthesisAction.label
        }
      : null;
  const flowStatusHandledInContext = workspaceStatus?.startsWith("画作视角已生成") ||
    workspaceStatus === "正反已生成。" || workspaceStatus === "合流已生成，继续从这里想。";
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

  const pendingMessage = pendingAction === "branches"
    ? pending.branches?.inquiry ? "正在围绕这句话继续想"
      : pending.branches?.polarityAxis ? `正在沿「${pending.branches.polarityAxis.label}」展开两端`
      : "正在展开正反两种视角"
    : pendingAction === "synthesis" ? "正在寻找两颗想法的新联系" : undefined;
  const resultContextVisible = !readingOpen && !hasPendingRequest && Boolean(
    expandedResultId || visibleExpansion || view.currentNode?.branchType === "合");

  const composer = <DialogueComposer
    inline={inlineInquiry}
    perspectiveLabel={composerPerspectiveLabel}
    inquiryTarget={inquiryTarget || undefined}
    draftSaveError={draftSaveError}
    onRemember={!inquiryTarget && !connectionTarget ? rememberIdea : undefined}
    connectionTarget={connectionTarget ? connectionTarget.sourceNodeIds.map(id => seedLabel(graphSnapshot.graph, id)).join(" / ") : undefined}
    target={composerTarget}
    value={draft}
    disabled={hasPendingRequest}
    pendingAction={pendingAction}
    pendingMessage={pendingMessage}
    isEmptyStart={isEmptyWorkspace}
    emptyStartOpen={emptyComposerOpen}
    targetFrozen={composerTargetFrozen}
    targetFrozenReason={composerTargetFrozenReason}
    errorState={errorState}
    rootRef={inlineInquiry ? undefined : composerRootRef}
    textareaRef={composerTextareaRef}
    onChange={handleDraftChange}
    onSubmit={submitComposer}
    onCancel={handleCancelPending}
    onRetry={errorState && retryRef.current?.error === errorState && retryRef.current?.sessionId === workspaceSessionId ? () => retryRef.current?.run() : undefined}
    onResetTarget={() => { setInquiryTarget(null); setConnectionTargetId(null); setComposerParentId(null); dismissSeedReading(); focusComposerSoon(); }}
  />;

  if (!workspaceReady) {
    return (
      <main ref={shellRef} className={styles.shell} data-theme={theme} data-testid="dialogue-shell" aria-busy="true">
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
    <main ref={shellRef} className={styles.shell} data-theme={theme} data-testid="dialogue-shell" data-reading={readingOpen && view.currentNode ? "true" : undefined}
      data-inline-inquiry={inlineInquiry ? "true" : undefined}
      data-composer-context={composerTarget.nodeId || pendingAction === "synthesis" || composerPerspectiveLabel ? "true" : undefined}>
      <a className={styles.skipToInput} href="#dialogue-input" onClick={(event) => {
        event.preventDefault(); dismissSeedReading(); setLineageOpen(false); focusComposerSoon();
      }}>直接输入想法</a>
      <div className={styles.ambient} />
      <div className={styles.ambientSecondary} />
      <div className={styles.ambientTertiary} />

      <header className={styles.hero}>
        <p className={styles.eyebrow}>Anicca</p>
        <h1>anicca</h1>
        <p className={styles.heroCopy}>
          点选阅读，拖动预览，明确确认后才合成。
        </p>
      </header>

      <WorkspaceBar
        onOpenEvolution={openEvolution}
        currentWorkspaceId={workspaceId}
        currentTitle={
          workspaceEntries.find((entry) => entry.id === workspaceId)?.title || "未命名工作区"
        }
        items={workspaceEntries}
        statusMessage={roundtablePendingSourceLabel ? `正在从「${roundtablePendingSourceLabel}」召集圆桌`
          : pendingMessage ? `${pendingMessage}，你可以取消本次${pendingAction === "synthesis" ? "合成" : "生成"}。`
          : workspaceStatus || generationAnnouncement}
        onCreate={handleCreateWorkspace}
        onSelect={handleSwitchWorkspace}
        onRename={handleRenameWorkspace}
        onExport={handleExportWorkspace}
        onImport={() => importInputRef.current?.click()}
        extraActions={<>
          <fieldset className={styles.themeControls}>
            <legend>外观</legend>
            <div>{([ ["light","浅色"], ["dark","深色"], ["system","跟随系统"] ] as const).map(([value,label]) =>
              <label key={value}><input type="radio" name="dialogue-theme" value={value}
                checked={themePreference === value} onChange={() => selectTheme(value)} /><span>{label}</span></label>
            )}</div>
          </fieldset>
          <div className={styles.workspaceOverflowGroup} role="group" aria-label="想法操作">
          <h3>想法</h3>
          <button type="button" className={styles.workspaceOverflowItem}
            onClick={() => { setLineageOpen(true); setReadingOpen(false); setCombineSourceId(null); }}>所有种子 · {view.sidebarItems.length}</button>
          <button type="button" className={styles.workspaceOverflowItem} disabled={!draft.trim() || hasPendingRequest}
            onClick={handleGrowthSubmit}>画作视角</button>
          <button type="button" ref={roundtableSummonButtonRef} className={styles.workspaceOverflowItem}
            aria-busy={roundtablePending}
            disabled={!view.currentNode || roundtablePending} onClick={handleSummonRoundtable}>
            {roundtablePending ? "圆桌生成中…" : "召集圆桌讨论此节点"}
          </button>
          {latestSavedRoundtableArtifact ? <button type="button" ref={roundtableSavedButtonRef} className={styles.workspaceOverflowItem}
            onClick={() => openRoundtableArtifact(latestSavedRoundtableArtifact)}>查看最近圆桌记录</button> : null}
          </div>
          <div className={styles.workspaceOverflowGroup} role="group" aria-label="帮助与实验">
            <h3>帮助与实验</h3>
            <fieldset className={styles.themeControls}>
              <legend>液体渲染对照</legend>
              <div>{LIQUID_RENDERER_OPTIONS.map(([value, label]) =>
                <label key={value}><input type="radio" name="liquid-renderer" value={value}
                  checked={rendererMode === value} onChange={() => selectRenderer(value)} /><span>{label}</span></label>
              )}</div>
              <p role="status" className={styles.rendererStatus}>
                {rendererStatus?.requested !== rendererMode ? "正在切换…"
                  : rendererStatus.backend === "unavailable" ? "图形不可用，已使用简化画面"
                  : rendererStatus.fallback ? "TSL 不可用，已回退原版"
                  : rendererStatus.backend === "original" ? "当前使用原版"
                  : `当前使用 TSL · ${rendererStatus.backend === "webgpu" ? "WebGPU" : "WebGL2"}`}
              </p>
            </fieldset>
            <button type="button" className={styles.workspaceOverflowItem} aria-pressed={atmosphereVisible}
              onClick={() => setAtmosphereVisible(value => !value)}>{atmosphereVisible ? "隐藏氛围背景" : "显示氛围背景"}</button>
            <button type="button" className={styles.workspaceOverflowItem} onClick={() => {
              if (view.currentNode) setReadingOpen(true);
              setGuideRequest(value => value + 1);
            }}>操作提示</button>
            <a className={styles.workspaceOverflowItem} href={appPath("/labs")}>视觉实验</a>
          </div>
        </>}
      />
      <PerspectiveControls workspaceId={workspaceId || "local"} space={thinkingSpace}
        topic={draft.trim() || view.currentNode?.text || graphSnapshot.graph.nodes[graphSnapshot.graph.entryIds[0]]?.text || ""}
        suggestions={axisSuggestions.filter(axis => !thinkingSpace.axes.some(existing => existing.negative === axis.negative && existing.positive === axis.positive))}
        onChange={setThinkingSpace}
        onLook={direction => setCameraView(current => ({ direction, revision: (current?.revision || 0) + 1 }))}
        onResetView={() => setCameraView(current => ({ direction: "reset", revision: (current?.revision || 0) + 1 }))}
        onArrange={() => { setExpandedResultId(null); arrangeStage(`seeds:${workspaceId || "local"}`); }} />
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
      {workspaceReady ? <SeedGuide empty={isEmptyWorkspace} requested={guideRequest} pending={hasPendingRequest}
        suspended={resultContextVisible}
        reading={readingOpen} combining={Boolean(combineSourceId)}
        completed={Object.values(graphSnapshot.graph.nodes).some(node => node.branchType === "合")}
        onStart={focusComposerSoon} /> : null}
      {workspaceStatus && !flowStatusHandledInContext ? (
        <p className={styles.flowStatus} aria-hidden="true" data-testid="dialogue-flow-status">
          {workspaceStatus}
        </p>
      ) : null}

      <div className={styles.workspace}>
        <BubbleStage
          rendererMode={rendererMode}
          onRendererStatus={setRendererStatus}
          suspended={evolutionOpen}
          reading={readingOpen}
          attentionIds={attentionIds}
          cameraView={cameraView}
          theme={theme}
          atmosphereVisible={atmosphereVisible}
          layoutKey={`seeds:${workspaceId || "local"}`}
          nodes={seedScene}
          focusNodeId={focusedInstanceId}
          convergenceEventId={relevantSynthesisAction?.synthesisId || null}
          eventNodeId={synthesisRevealId}
          arrivals={expansionResult}
          pendingPreview={stagePendingPreview}
          synthesisAction={relevantSynthesisAction}
          resolveSynthesisAction={resolveSeedPair}
          onSplit={(id) => {
            const conceptId = seedConceptId(graphSnapshot.graph, seedInstances, id);
            if (conceptId) { setReadingOpen(false); void handleSubmit(conceptId); }
          }}
          onInteractionStart={dismissSeedReading}
          generationBusy={hasPendingRequest}
          onProposeSynthesis={handleGenerateSynthesis}
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
        {expandedResultId && !readingOpen && !hasPendingRequest ? <div className={styles.sourceContextBar} aria-label="来源展开" data-testid="dialogue-source-context" data-stage-label-chrome="top">
          <span>来源 · {seedLabel(graphSnapshot.graph, seedConceptId(graphSnapshot.graph, seedInstances, expandedResultId) || "")}</span>
          <button type="button" onClick={() => handleSelectNode(expandedResultId)}>阅读合</button>
          <button type="button" onClick={() => { setExpandedResultId(null); useDialogueUiStore.getState().endStagePreview(); }}>收起来源</button>
        </div> : null}
        {!expandedResultId && !readingOpen && !hasPendingRequest && visibleExpansion ? <div className={styles.explorationContext}
          role="region" aria-label="本轮展开" data-testid="dialogue-expansion-context" data-stage-label-chrome="top">
          <span>{visibleExpansion.axis ? `沿「${visibleExpansion.axis.label}」展开` : "正反裂变"}</span>
          <p>{visibleExpansion.axis ? `${visibleExpansion.axis.negative} ↔ ${visibleExpansion.axis.positive}` : "深化主张 ↔ 质疑前提"}
            {visibleExpansion.lens ? ` · ${visibleExpansion.lens}` : ""}</p>
          <div className={styles.seedResultReads} aria-label="阅读本轮两端">
            <button type="button" onClick={() => handleSelectNode(visibleExpansion.firstId)}
              aria-label={`阅读${visibleExpansion.axis?.negative || "正"}「${seedLabel(graphSnapshot.graph, visibleExpansion.firstId)}」`}>
              <small>{visibleExpansion.axis?.negative || "正"}</small><span>{seedLabel(graphSnapshot.graph, visibleExpansion.firstId)}</span>
            </button>
            <button type="button" onClick={() => handleSelectNode(visibleExpansion.secondId)}
              aria-label={`阅读${visibleExpansion.axis?.positive || "反"}「${seedLabel(graphSnapshot.graph, visibleExpansion.secondId)}」`}>
              <small>{visibleExpansion.axis?.positive || "反"}</small><span>{seedLabel(graphSnapshot.graph, visibleExpansion.secondId)}</span>
            </button>
          </div>
          <button className={styles.seedResultTrail} type="button" onClick={() => handleSelectNode(visibleExpansion.sourceId)}>回看起点</button>
        </div> : null}
        {!expandedResultId && !readingOpen && !hasPendingRequest && !visibleExpansion && view.currentNode?.branchType === "合" ? <div
          className={styles.explorationContext} role="region" aria-label="本轮合流" data-testid="dialogue-synthesis-context" data-stage-label-chrome="top">
          <span>合流 · {seedLabel(graphSnapshot.graph, view.currentNode.id)}</span>
          <p className={styles.synthesisInsight}>{readUnderstandingChange(graphSnapshot.graph.nodes[view.currentNode.id]?.meta?.change) || view.currentNode.summary || graphSnapshot.graph.nodes[view.currentNode.id]?.meta?.summary}</p>
          <button type="button" onClick={() => setReadingOpen(true)}>继续展开</button>
          <button type="button" onClick={handleExpandSources}>展开来源</button>
        </div> : null}
        <div
          id="dialogue-lineage-drawer"
          ref={lineageDrawerRef}
          role="region"
          aria-label="种子谱系"
          className={styles.lineageDrawer}
          data-open={lineageOpen ? "true" : "false"}
          inert={lineageOpen ? undefined : true}
        >
          <button
            type="button"
            className={styles.drawerCloseButton}
            onClick={closeLineagePanel}
            aria-label="收起谱系"
          >
            收起
          </button>
          <BranchSidebar
            breadcrumb={view.breadcrumb}
            items={view.sidebarItems}
            pendingRoot={pendingRootSidebar}
            onSelect={handleSelectNode}
          />
        </div>
        {view.currentNode ? (
          <SeedReadingContent open={readingOpen} suspended={evolutionOpen} motion={readingMotionRef.current} originNodeId={combineSourceId || focusedInstanceId || view.currentNode.id} onDismiss={dismissSeedReading}>
            <SeedInspector key={`${workspaceSessionId}:${combineSourceId || view.currentNode.id}`}
              space={thinkingSpace}
              graph={graphSnapshot.graph} nodeId={seedConceptId(graphSnapshot.graph, seedInstances, combineSourceId) || view.currentNode.id}
              instances={seedInstances} instanceId={focusedInstanceId || view.currentNode.id}
              combining={Boolean(combineSourceId)} busy={hasPendingRequest}
              activeDeferredId={activeDeferredId} onContinueDeferred={continueDeferred}
              onClose={closeSeedPanel}
              onSplit={handleContinueFromCurrentNode}
              onInquiry={startInquiry}
              inquiryTarget={inquiryTarget?.sourceNodeId === view.currentNode.id ? inquiryTarget : undefined}
              inquiryComposer={inlineInquiry ? composer : undefined}
              companionId={companionId}
              getReadingPosition={getReadingPosition} onRememberPosition={rememberReadingPosition}
              onExpandPolarity={(axisId, frame) => void handlePolarityExpansion(view.currentNode!.id, axisId, frame)}
              onWrite={() => { setInquiryTarget(null); setConnectionTargetId(null); setComposerParentId(view.currentNode!.id); setReadingOpen(false); focusComposerSoon(); }}
              onCombine={() => { setCombineSourceId(focusedInstanceId || view.currentNode!.id); setSelectedPair(null); }}
              onCreateInstance={handleCreateInstance}
              onRemoveInstance={handleRemoveInstance}
              onExpandSources={handleExpandSources}
              onPick={handleSelectNode}
            />
          </SeedReadingContent>
        ) : null}
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
        {!inlineInquiry ? composer : null}
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
      {evolutionOpen ? <EvolutionOverview key={workspaceSessionId} graph={graphSnapshot.graph} initialNodeId={focusedNodeId}
        theme={theme} returnFocus={evolutionReturnFocusRef.current} onDismiss={() => setEvolutionOpen(false)}
        onEnter={id => { setEvolutionOpen(false); handleSelectNode(id, true);
          window.setTimeout(() => document.getElementById("conversation-panel-heading")?.focus({ preventScroll: true }), 0);
        }} /> : null}
    </main>
  );
}
