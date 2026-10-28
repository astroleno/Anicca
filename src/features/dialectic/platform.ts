export type DialogueViewportMetrics = {
  width: number;
  height: number;
  offsetTop: number;
  keyboardInset: number;
};

export function stageGestureHint(coarsePointer: boolean) {
  return coarsePointer ? "拖空白平移 · 拖球合成 · 双指转动与缩放" : "拖动空白，转动视角";
}

type ViewportWindow = Pick<Window, "innerWidth" | "innerHeight" | "visualViewport">;

export function readDialogueViewport(win: ViewportWindow): DialogueViewportMetrics {
  const viewport = win.visualViewport;
  // Native pinch zoom must retain the layout viewport and allow the browser to
  // pan it. Following visualViewport here would shrink the stage and cancel pan.
  if (viewport && viewport.scale > 1) {
    return { width: Math.max(1, win.innerWidth), height: Math.max(1, win.innerHeight), offsetTop: 0, keyboardInset: 0 };
  }
  const width = Math.max(1, viewport?.width || win.innerWidth || 1);
  const height = Math.max(1, viewport?.height || win.innerHeight || 1);
  const offsetTop = Math.max(0, viewport?.offsetTop || 0);
  const keyboardInset = Math.max(
    0,
    (win.innerHeight || height) - height - offsetTop
  );

  return { width, height, offsetTop, keyboardInset };
}

export function observeDialogueViewport(
  onChange: (metrics: DialogueViewportMetrics) => void,
  win: Window = window
): () => void {
  const update = () => onChange(readDialogueViewport(win));
  const viewport = win.visualViewport;

  update();
  win.addEventListener("resize", update, { passive: true });
  viewport?.addEventListener("resize", update, { passive: true });
  viewport?.addEventListener("scroll", update, { passive: true });

  return () => {
    win.removeEventListener("resize", update);
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
  };
}
