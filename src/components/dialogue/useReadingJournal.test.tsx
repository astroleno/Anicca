import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { BranchGraphStore } from "@/store/branchGraph";
import { loadReadingState, saveReadingState } from "@/lib/persist/readingState";
import { useReadingJournal } from "./useReadingJournal";

beforeEach(() => localStorage.clear());

it("restores the reader once per workspace, ignores outgoing cleanup and remembers an explicit close", () => {
  const a = new BranchGraphStore(), aId = a.createUserNode("花园的边界可以协商。"), b = new BranchGraphStore(), bId = b.createUserNode("维护关系也能继续探索。");
  const copy = { id: "copy", conceptId: aId, ordinal: 1, createdAt: "2026-10-28" };
  const position = { scrollTop: 640, anchor: { offset: 3, top: 16 } };
  saveReadingState("a", { activeId: "copy", positions: { [aId]: position } });
  const restore = vi.fn();
  const hook = renderHook(({ workspaceId }: { workspaceId: string }) => {
    const [open, setOpen] = useState(false), [active, setActive] = useState<string | null>(null);
    const graph = workspaceId === "a" ? a.getGraph() : b.getGraph();
    const journal = useReadingJournal({ workspaceId, sessionId: `session-${workspaceId}`, ready: true,
      graph, instances: workspaceId === "a" ? { copy } : {}, readingOpen: open, activeId: active, setReadingOpen: setOpen,
      onRestore: (id, concept) => { restore(id, concept); setActive(id); } });
    return { ...journal, open, active, setOpen, setActive };
  }, { initialProps: { workspaceId: "a" } });
  expect(hook.result.current).toMatchObject({ open: true, active: "copy" });
  expect(hook.result.current.getReadingPosition(aId)).toEqual(position);
  const outgoing = hook.result.current.rememberReadingPosition;
  hook.rerender({ workspaceId: "b" }); expect(hook.result.current.open).toBe(false);
  act(() => { hook.result.current.setActive(bId); hook.result.current.setOpen(true); });
  act(() => { hook.result.current.rememberReadingPosition(bId, { scrollTop: 30 }); outgoing(aId, { scrollTop: 999 }); });
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(loadReadingState("b", b.getGraph(), {})).toEqual({ activeId: bId, positions: { [bId]: { scrollTop: 30 } } });
  hook.rerender({ workspaceId: "a" });
  expect(hook.result.current).toMatchObject({ open: true, active: "copy" });
  expect(hook.result.current.getReadingPosition(aId)).toEqual(position);
  act(() => hook.result.current.setOpen(false)); hook.unmount();
  expect(loadReadingState("a", a.getGraph(), { copy })).toEqual({ activeId: null, positions: { [aId]: position } });
  expect(restore).toHaveBeenCalledTimes(2);
});
