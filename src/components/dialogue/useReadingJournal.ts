"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Graph, SeedInstances } from "@/types/anicca";
import { seedConceptId } from "@/features/dialectic/seedInstances";
import { loadReadingState, saveReadingState, type ReadingPosition, type WorkspaceReadingState } from "@/lib/persist/readingState";

type Owner = { token: string; workspaceId: string; state: WorkspaceReadingState };

/** Reading has its own small journal; scrolling never rewrites a graph snapshot. */
export function useReadingJournal({ workspaceId, sessionId, ready, graph, instances, readingOpen, activeId, setReadingOpen, onRestore }: {
  workspaceId: string | null; sessionId: string; ready: boolean; graph: Graph; instances: SeedInstances;
  readingOpen: boolean; activeId: string | null;
  setReadingOpen(open: boolean): void; onRestore(instanceId: string, conceptId: string): void;
}) {
  const token = JSON.stringify([workspaceId, sessionId]);
  const owner = useRef<Owner | null>(null);
  const cache = useRef(new Map<string, WorkspaceReadingState>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydratedToken, setHydratedToken] = useState("");
  const restore = useRef(onRestore); restore.current = onRestore;
  const graphRef = useRef(graph); graphRef.current = graph;
  const instancesRef = useRef(instances); instancesRef.current = instances;
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (owner.current) saveReadingState(owner.current.workspaceId, owner.current.state);
  }, []);

  useLayoutEffect(() => {
    if (!ready || !workspaceId || owner.current?.token === token) return;
    flush();
    const state = cache.current.get(workspaceId) || loadReadingState(workspaceId, graphRef.current, instancesRef.current);
    cache.current.set(workspaceId, state);
    owner.current = { token, workspaceId, state };
    const conceptId = seedConceptId(graphRef.current, instancesRef.current, state.activeId);
    setReadingOpen(Boolean(conceptId));
    if (state.activeId && conceptId) restore.current(state.activeId, conceptId);
    setHydratedToken(token);
  }, [ready, workspaceId, token, flush, setReadingOpen]);

  useLayoutEffect(() => {
    if (!ready || hydratedToken !== token || owner.current?.token !== token) return;
    owner.current.state.activeId = readingOpen && seedConceptId(graph, instances, activeId) ? activeId : null;
    flush();
  }, [ready, hydratedToken, token, readingOpen, activeId, graph, instances, flush]);

  const getReadingPosition = useCallback((id: string) => owner.current?.token === token ? owner.current.state.positions[id] : undefined, [token]);
  const rememberReadingPosition = useCallback((id: string, position: ReadingPosition) => {
    // An outgoing inspector may clean up after a new workspace has mounted.
    if (owner.current?.token !== token) return;
    owner.current.state.positions[id] = position;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 160);
  }, [token, flush]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush); document.addEventListener("visibilitychange", hide);
    return () => { flush(); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hide); };
  }, [flush]);
  return { getReadingPosition, rememberReadingPosition };
}
