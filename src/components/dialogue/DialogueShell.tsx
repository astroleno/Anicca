"use client";

import {
  startTransition,
  useEffect,
  useState,
  useSyncExternalStore
} from "react";
import { buildParentContext } from "@/chat/context";
import { BranchSidebar } from "@/components/dialogue/BranchSidebar";
import { BubbleStage } from "@/components/dialogue/BubbleStage";
import { ConversationPanel } from "@/components/dialogue/ConversationPanel";
import { DialogueComposer } from "@/components/dialogue/DialogueComposer";
import { createClientId, useDialogueUiStore } from "@/features/dialectic/store";
import {
  DialogueSynthesisAction,
  deriveDialogueView
} from "@/features/dialectic/viewModel";
import {
  ANICCA_WORKSPACE_SCHEMA_VERSION,
  loadGraphLocal,
  saveGraphLocal
} from "@/lib/persist/local";
import { branchGraphStore } from "@/store/branchGraph";
import { Message } from "@/types/chat";
import { Graph } from "@/types/anicca";
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

function formatDialogueError(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "";

  if (message.startsWith("invalid_model_output")) {
    return "这轮生成没能收束成可用结果，请再试一次。";
  }

  if (message.startsWith("branches_failed")) {
    return "这一轮正反生成失败了，请稍后再试。";
  }

  if (message.startsWith("synthesis_failed")) {
    return "这一轮收束失败了，请稍后再试。";
  }

  return "这轮生成出了点问题，请再试一次。";
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
  const workspaceSessionId = useDialogueUiStore((state) => state.workspaceSessionId);
  const focusedNodeId = useDialogueUiStore((state) => state.focusedNodeId);
  const composerParentId = useDialogueUiStore((state) => state.composerParentId);
  const pendingAction = useDialogueUiStore((state) => state.pendingAction);
  const pending = useDialogueUiStore((state) => state.pending);
  const errorMessage = useDialogueUiStore((state) => state.errorMessage);
  const hydrateWorkspace = useDialogueUiStore((state) => state.hydrateWorkspace);
  const setFocusedNodeId = useDialogueUiStore((state) => state.setFocusedNodeId);
  const setComposerParentId = useDialogueUiStore((state) => state.setComposerParentId);
  const beginPending = useDialogueUiStore((state) => state.beginPending);
  const clearPending = useDialogueUiStore((state) => state.clearPending);
  const setErrorMessage = useDialogueUiStore((state) => state.setErrorMessage);

  useEffect(() => {
    const snapshot = loadGraphLocal();
    if (!snapshot) {
      return;
    }

    branchGraphStore.setGraph(snapshot.graph);
    hydrateWorkspace({
      workspaceSessionId: snapshot.workspaceSessionId,
      focusedNodeId: snapshot.focusedNodeId,
      composerParentId: snapshot.composerParentId
    });
  }, [hydrateWorkspace]);

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
    saveGraphLocal({
      schemaVersion: ANICCA_WORKSPACE_SCHEMA_VERSION,
      workspaceSessionId,
      graph: graphSnapshot.graph,
      focusedNodeId: view.focusNodeId,
      composerParentId: view.composerTarget.nodeId
    });
  }, [graphSnapshot, view.focusNodeId, view.composerTarget.nodeId, workspaceSessionId]);

  const handleSelectNode = (nodeId: string) => {
    startTransition(() => {
      setFocusedNodeId(nodeId);
      setErrorMessage(null);
    });
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

      clearPending("branches");
      setDraft("");
      startTransition(() => {
        setFocusedNodeId(userNodeId);
        setErrorMessage(null);
      });
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.branches;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("branches");
      setErrorMessage(formatDialogueError(error));
    }
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

      clearPending("synthesis");
      startTransition(() => {
        setFocusedNodeId(synthesisId);
        setErrorMessage(null);
      });
    } catch (error: unknown) {
      const activePending = useDialogueUiStore.getState().pending.synthesis;
      if (!activePending || activePending.requestId !== requestId) {
        return;
      }

      clearPending("synthesis");
      setErrorMessage(formatDialogueError(error));
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
        <h1>让一个问题，同时向两边生长。</h1>
        <p className={styles.heroCopy}>
          先听正，也听反；等你愿意，再让它们在同一条谱系里慢慢收束成合。
        </p>
      </header>

      <div className={styles.workspace}>
        <BranchSidebar breadcrumb={view.breadcrumb} items={view.sidebarItems} onSelect={handleSelectNode} />
        <BubbleStage nodes={view.stageNodes} focusNodeId={view.focusNodeId} onSelect={handleSelectNode} />
        <ConversationPanel
          node={view.currentNode}
          synthesisAction={relevantSynthesisAction}
          synthesisPending={isSynthesisPending}
          onGenerateSynthesis={handleGenerateSynthesis}
          onSelectSource={handleSelectNode}
        />
      </div>

      <DialogueComposer
        target={view.composerTarget}
        value={draft}
        disabled={hasPendingRequest}
        pendingAction={pendingAction}
        errorMessage={errorMessage}
        onChange={setDraft}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
