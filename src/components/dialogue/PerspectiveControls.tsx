"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AxisSuggestion, ThinkingSpace } from "@/features/perspectives/model";
import { loadPerspectiveDraft, savePerspectiveDraft } from "@/lib/persist/perspectiveDraft";
import type { SeedViewDirection } from "./liquid/space";
import styles from "./PerspectivePanel.module.css";

const PerspectivePanel = dynamic(() => import("./PerspectivePanel").then(module => module.PerspectivePanel), { ssr: false });

export type PerspectiveControlsProps = {
  workspaceId: string;
  space: ThinkingSpace;
  topic: string;
  suggestions: AxisSuggestion[];
  onChange(space: ThinkingSpace): void;
  onLook(direction: SeedViewDirection): void;
  onArrange(): void;
  onResetView(): void;
};

export function PerspectiveControls(props: PerspectiveControlsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [drafts, setDrafts] = useState<Record<string, ThinkingSpace | null>>({});
  const stored = useMemo(() => loadPerspectiveDraft(props.workspaceId), [props.workspaceId]);
  const draft = (Object.prototype.hasOwnProperty.call(drafts, props.workspaceId) ? drafts[props.workspaceId] : stored) || props.space;
  const changeDraft = (next: ThinkingSpace | null) => {
    setDrafts(current => ({ ...current, [props.workspaceId]: next }));
    savePerspectiveDraft(props.workspaceId, next);
  };
  useLayoutEffect(() => { setOpen(false); }, [props.workspaceId]);
  return <>
    <button ref={triggerRef} type="button" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open}
      data-preserve-seed-reading
      aria-label="换个角度" aria-describedby={props.suggestions.length ? "perspective-new-suggestion" : undefined}
      onClick={() => setOpen(true)} title={props.suggestions.length ? "有可补充的新视角" : "设置思考维度与观察角度"}>
      换个角度{props.suggestions.length ? <><span className={styles.dot} aria-hidden="true" /><span className={styles.srOnly} id="perspective-new-suggestion">有新视角建议</span></> : null}
    </button>
    {open ? <PerspectivePanel key={props.workspaceId} {...props} draft={draft} onDraftChange={changeDraft}
      onDiscardDraft={() => changeDraft(null)} onClose={() => {
        setOpen(false);
        // The trigger owns return focus, including after a lazy dialog mounts.
        requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
      }} /> : null}
  </>;
}
