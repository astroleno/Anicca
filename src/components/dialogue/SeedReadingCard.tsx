"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./DialogueShell.module.css";

export function SeedReadingCard({ nodeId, onDismiss, children }: {
  nodeId: string; onDismiss(): void; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = root.current;
    if (!card) return;
    const anchor = document.querySelector<HTMLElement>(`[data-testid="dialogue-stage-node-${nodeId}"]`);
    const composer = document.querySelector<HTMLElement>('[data-testid="dialogue-composer"]');
    let frame = 0;
    const place = () => {
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const topEdge = (viewport?.offsetTop || 0) + 68;
      const width = viewport?.width || window.innerWidth;
      const bottom = Math.min((viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 12,
        (composer?.getBoundingClientRect().top ?? window.innerHeight) - 12);
      const available = Math.max(80, bottom - topEdge);
      const cardWidth = Math.min(360, width - 24);
      card.style.width = `${cardWidth}px`;
      card.style.maxHeight = `${Math.min(440, available)}px`;
      const rect = anchor?.getBoundingClientRect();
      const height = card.getBoundingClientRect().height;
      const side = rect && rect.right + 16 + cardWidth < leftEdge + width - 24 ? rect.right + 16
        : rect ? rect.left - cardWidth - 16 : (width - cardWidth) / 2;
      const desiredTop = width > 680 ? rect?.top ?? topEdge
        : rect && rect.bottom + height + 12 <= bottom ? rect.bottom + 12 : (rect?.top ?? bottom) - height - 12;
      card.style.left = `${Math.max(leftEdge, Math.min(leftEdge + width - cardWidth - 24, side))}px`;
      card.style.top = `${Math.max(topEdge, Math.min(bottom - height, desiredTop))}px`;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(card);
    if (composer) observer?.observe(composer);
    const mutations = new MutationObserver(schedule);
    if (anchor) mutations.observe(anchor, { attributes: true, attributeFilter: ["style"] });
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!card.contains(target) && !target.closest('[data-testid^="dialogue-stage-node-"]')) onDismiss();
    };
    place();
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [nodeId, onDismiss]);
  return <div ref={root} id="dialogue-reading-drawer" className={styles.seedReadingCard} data-open="true">
    {children}
  </div>;
}
