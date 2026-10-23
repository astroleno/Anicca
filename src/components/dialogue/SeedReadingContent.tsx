"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./DialogueShell.module.css";

/** Reading is a state of the stage, with no separate card surface. */
export function SeedReadingContent({ open = true, originNodeId, onDismiss, children }: {
  open?: boolean; originNodeId?: string; onDismiss(): void; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const origin = useRef({ x: 0, y: 12 });

  useLayoutEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!present || !element) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || typeof element.animate !== "function") {
      if (!open) setPresent(false);
      return;
    }

    if (open) {
      const seed = Array.from(document.querySelectorAll<HTMLElement>("[data-metaball-surface]"))
        .find(node => node.dataset.metaballSurface === originNodeId);
      if (seed) {
        const seedBox = seed.getBoundingClientRect();
        const readingBox = element.getBoundingClientRect();
        origin.current = {
          x: Math.max(-64, Math.min(64, (seedBox.x + seedBox.width / 2 - readingBox.x - readingBox.width / 2) * 0.2)),
          y: Math.max(-40, Math.min(40, (seedBox.y + seedBox.height / 2 - readingBox.y - readingBox.height / 2) * 0.2))
        };
      }
    }

    const away = { opacity: 0, translate: `${origin.current.x}px ${origin.current.y}px` };
    const resting = { opacity: 1, translate: "0px 0px" };
    const animation = element.animate(open ? [away, resting] : [resting, away], {
      duration: open ? 340 : 200,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both"
    });
    let cancelled = false;
    if (!open) animation.finished.then(() => {
      if (!cancelled) setPresent(false);
    }, () => {});
    return () => {
      cancelled = true;
      animation.cancel();
    };
  }, [open, present, originNodeId]);

  useEffect(() => {
    if (!open || !present) return;
    const stage = document.querySelector<HTMLElement>('[data-testid="dialogue-stage-track"]');
    const previousInert = stage?.inert ?? false;
    if (stage) stage.inert = true;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-testid="dialogue-workspace-bar"], [data-preserve-seed-reading], dialog[open]')) return;
      if (event.target instanceof Node && !root.current?.contains(event.target)) onDismiss();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      if (stage) stage.inert = previousInert;
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [onDismiss, open, present]);
  if (!present) return null;
  return <div ref={root} id="dialogue-reading-drawer" className={styles.seedReadingContent}
    data-open={open ? "true" : "false"} inert={open ? undefined : true} aria-hidden={open ? undefined : true}>
    {children}
  </div>;
}
