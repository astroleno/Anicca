"use client";

import {
  ChangeEvent,
  startTransition,
  useCallback,
  useEffect,
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
import { buildParentContext } from "@/chat/context";
import { BranchSidebar } from "@/components/dialogue/BranchSidebar";
import { BubbleStage } from "@/components/dialogue/BubbleStage";
import { ConversationPanel } from "@/components/dialogue/ConversationPanel";
import { DialogueComposer } from "@/components/dialogue/DialogueComposer";
import { WorkspaceBar } from "@/components/dialogue/WorkspaceBar";
import { createDialogueDemoWorkspace } from "@/features/dialectic/demoWorkspace";
import { createClientId, DialogueErrorState, useDialogueUiStore } from "@/features/dialectic/store";
import {
  DialogueSynthesisAction,
  deriveDialogueView
} from "@/features/dialectic/viewModel";
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

export function isDialogueDemoWorkspaceEnabled(locationLike: DialogueLocationLike) {
  const params = new URLSearchParams(locationLike.search);
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(locationLike.hostname);
  return isLocalHost || params.get("demo") === "1";
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

export function DialogueShell() {
  const graphSnapshot = useSyncExternalStore(
    branchGraphStore.subscribe.bind(branchGraphStore),
    branchGraphStore.getSnapshot.bind(branchGraphStore),
    branchGraphStore.getSnapshot.bind(branchGraphStore)
  );
  const [draft, setDraft] = useState("");
  const [demoWorkspaceEnabled, setDemoWorkspaceEnabled] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(() => branchGraphStore.getGraph().entryIds.length > 0);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceRegistryEntry[]>([]);
  const [roundtableArtifact, setRoundtableArtifact] = useState<WorkspaceRoundtableArtifact | null>(null);
  const [roundtablePending, setRoundtablePending] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
  }, []);

  const view = deriveDialogueView(graphSnapshot.graph, focusedNodeId);
  const isBranchPending = pending.branches !== null;
  const isSynthesisPending = pending.synthesis !== null;
  const hasPendingRequest = isBranchPending || isSynthesisPending;

  useEffect(() => {
    if (view.focusNodeId !== focusedNodeId) {
      setFocusedNodeId(view.focusNodeId);
    }
  }, [focusedNodeId, setFocusedNodeId, view.focusNodeId]);

  useEffect(() => {
    if (composerParentId !== view.composerTarget.nodeId) {
      setComposerParentId(view.composerTarget.nodeId);
    }
  }, [composerParentId, setComposerParentId, view.composerTarget.nodeId]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    const existingRecord = loadWorkspaceRecord(workspaceId);
    saveActiveWorkspaceSnapshot({
      workspaceId,
      graph: graphSnapshot.graph,
      focusedNodeId: view.focusNodeId,
      composerParentId: view.composerTarget.nodeId,
      stageLayouts,
      artifacts: existingRecord?.snapshot.artifacts
    });
    refreshWorkspaceRegistryView(workspaceId);
  }, [
    graphSnapshot,
    refreshWorkspaceRegistryView,
    stageLayouts,
    view.focusNodeId,
    view.composerTarget.nodeId,
    workspaceId,
    workspaceReady
  ]);

  const handleSelectNode = (nodeId: string) => {
    startTransition(() => {
      setFocusedNodeId(nodeId);
      setErrorState(null);
    });
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
    setRoundtableArtifact(null);
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
    setRoundtableArtifact(null);
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
    setRoundtableArtifact(null);
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
    } catch {
      setErrorState({
        title: "导出工作区失败",
        detail: "当前工作区没有被序列化成 bundle。",
        recovery: "稍后重试；如果反复失败，先检查本地存储状态。"
      });
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
      setRoundtableArtifact(null);
      setErrorState(null);
    } catch (error: unknown) {
      setErrorState(formatWorkspaceBundleError(error));
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
      const contextMessages = targetId
        ? serializeContextMessages(buildParentContext(targetId, "").messages)
        : [];
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

      clearPending("branches");
      setDraft("");
      void emitDialogueTelemetry(
        buildContinuationCreatedEvent(updatedGraph, targetId)
      );
      startTransition(() => {
        setFocusedNodeId(userNodeId);
        setErrorState(null);
      });
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("branches");
      setErrorState(formatDialogueError(error));
    }
  };

  const handleSummonRoundtable = async () => {
    if (!view.currentNode || roundtablePending || !workspaceId) {
      return;
    }

    const requestId = createClientId("req");
    const focusNode = branchGraphStore.getGraph().nodes[view.currentNode.id];
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
    setRoundtablePending(true);
    try {
      const response = await postJson<RoundtableResponse>("/api/roundtable", {
        requestId,
        command: "start",
        topic
      });
      if (requestSessionId !== useDialogueUiStore.getState().workspaceSessionId) {
        return;
      }

      const now = new Date().toISOString();
      const artifactId = createClientId("roundtable");
      const artifact: WorkspaceRoundtableArtifact = {
        id: artifactId,
        topic,
        sourceNodeId: view.currentNode.id,
        createdAt: now,
        updatedAt: now,
        state: response.state
      };

      const record = loadWorkspaceRecord(workspaceId);
      if (!record) {
        throw new Error("workspace_roundtable_save_failed");
      }
      saveWorkspaceRecord({
        id: workspaceId,
        title: record.entry.title,
        titleSource: record.entry.titleSource,
        createdAt: record.entry.createdAt,
        updatedAt: now,
        lastOpenedAt: record.entry.lastOpenedAt,
        snapshot: {
          ...record.snapshot,
          artifacts: {
            ...(record.snapshot.artifacts || {}),
            roundtables: {
              ...(record.snapshot.artifacts?.roundtables || {}),
              [artifactId]: artifact
            }
          }
        }
      });
      setRoundtableArtifact(artifact);
      setErrorState(null);
    } catch (error: unknown) {
      setErrorState(formatDialogueError(error));
    } finally {
      setRoundtablePending(false);
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
    setRoundtableArtifact(null);
    setErrorState(null);
  };

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
      composerTargetId: view.composerTarget.nodeId
    });

    try {
      const contextMessages = serializeContextMessages(buildParentContext(action.thesisId, "").messages);
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

      clearPending("synthesis");
      void emitDialogueTelemetry(buildSynthesisCreatedEvent(updatedGraph, synthesisId));
      startTransition(() => {
        setFocusedNodeId(synthesisId);
        setErrorState(null);
      });
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

  return (
    <main className={styles.shell} data-testid="dialogue-shell">
      <div className={styles.ambient} />
      <div className={styles.ambientSecondary} />
      <div className={styles.ambientTertiary} />

      <header className={styles.hero}>
        <p className={styles.eyebrow}>Anicca 对话场</p>
        <h1>让一个问题，先分岔，再收束。</h1>
        <p className={styles.heroCopy}>
          把它放进场里，先长出正与反；等张力清楚了，再决定要不要把它们收成合。
        </p>
        <div className={styles.heroActions}>
          <a className={`${styles.heroActionButton} ${styles.heroActionLink}`} href="/roundtable">
            圆桌实验页
          </a>
          <button
            type="button"
            className={styles.heroActionButton}
            onClick={handleExportWorkspace}
          >
            导出工作区
          </button>
          <button
            type="button"
            className={styles.heroActionButton}
            onClick={() => importInputRef.current?.click()}
          >
            导入工作区
          </button>
          <input
            ref={importInputRef}
            data-testid="dialogue-import-input"
            type="file"
            accept="application/json"
            className={styles.hiddenFileInput}
            onChange={handleImportWorkspace}
          />
        </div>
      </header>

      <WorkspaceBar
        currentWorkspaceId={workspaceId}
        currentTitle={
          workspaceEntries.find((entry) => entry.id === workspaceId)?.title || "未命名工作区"
        }
        items={workspaceEntries}
        onCreate={handleCreateWorkspace}
        onSelect={handleSwitchWorkspace}
        onRename={handleRenameWorkspace}
      />

      <div className={styles.workspace}>
        <BranchSidebar breadcrumb={view.breadcrumb} items={view.sidebarItems} onSelect={handleSelectNode} />
        <BubbleStage
          layoutKey={view.focusSnapshotId}
          nodes={view.stageNodes}
          focusNodeId={view.focusNodeId}
          onSelect={handleSelectNode}
          emptyAction={
            demoWorkspaceEnabled && graphSnapshot.graph.entryIds.length === 0
              ? {
                  label: "载入示例谱系",
                  onTrigger: handleLoadDemoWorkspace
                }
              : null
          }
        />
        <ConversationPanel
          node={view.currentNode}
          synthesisAction={relevantSynthesisAction}
          synthesisPending={isSynthesisPending}
          onGenerateSynthesis={handleGenerateSynthesis}
          onSelectSource={handleSelectNode}
          onSummonRoundtable={handleSummonRoundtable}
        />
      </div>

      {roundtableArtifact ? (
        <aside className={styles.roundtableDrawer} data-testid="dialogue-roundtable-drawer">
          <header className={styles.roundtableDrawerHeader}>
            <p className={styles.eyebrow}>Roundtable Artifact</p>
            <strong>圆桌已保存</strong>
          </header>
          <p className={styles.roundtableDrawerTopic}>{roundtableArtifact.topic}</p>
          <p className={styles.roundtableDrawerSummary}>
            核心争议：{roundtableArtifact.state.lastCoreTension || "（无）"}
          </p>
          <p className={styles.roundtableDrawerSummary}>
            下一问：{roundtableArtifact.state.nextQuestion || "（无）"}
          </p>
          <div className={styles.roundtableDrawerActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handlePromoteRoundtableAsQuestion}
              disabled={!roundtableArtifact.state.nextQuestion?.trim()}
            >
              作为追问继续
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setRoundtableArtifact(null)}
            >
              收起
            </button>
          </div>
        </aside>
      ) : null}

      <DialogueComposer
        target={view.composerTarget}
        value={draft}
        disabled={hasPendingRequest}
        pendingAction={pendingAction}
        errorState={errorState}
        onChange={setDraft}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
