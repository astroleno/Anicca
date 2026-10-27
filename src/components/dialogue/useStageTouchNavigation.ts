"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { orbitSeedSpace, clampSeedZoom, type SeedOrbit } from "./liquid/space";

type Point = { x: number; y: number };
type View = { orbit: SeedOrbit; zoom: number };
type Options = {
  hostRef: RefObject<HTMLDivElement | null>;
  layoutKey: string;
  disabled: boolean;
  getView(): View;
  setView(view: View): void;
  onStart(): void;
  onEnd(): void;
};

function geometry(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
}

/** Two touches own the view until all fingers lift; a leftover finger never picks up a seed. */
export function useStageTouchNavigation(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const points = useRef(new Map<number, Point>());
  const navigation = useRef<null | { ids: [number, number]; origins: [Point, Point]; start: ReturnType<typeof geometry>; view: View;
    mode: "pending" | "rotate" | "zoom"; intentAt: number | null }>(null);
  const frame = useRef(0);
  const ending = useRef(false);
  const [navigating, setNavigating] = useState(false);

  const finish = () => {
    const active = navigation.current;
    navigation.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (!active) return;
    ending.current = points.current.size > 0;
    const host = latest.current.hostRef.current;
    if (host) delete host.dataset.spaceTouchMode;
    if (host && !ending.current) {
      delete host.dataset.spaceNavigating;
    }
    setNavigating(false);
    latest.current.onEnd();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const clear = () => {
    const ids = [...points.current.keys()];
    finishRef.current();
    points.current.clear();
    ending.current = false;
    const host = latest.current.hostRef.current;
    if (host) delete host.dataset.spaceNavigating;
    for (const id of ids) if (host?.hasPointerCapture?.(id)) host.releasePointerCapture(id);
  };
  const clearRef = useRef(clear);
  clearRef.current = clear;

  useEffect(() => {
    const updateView = (now: number) => {
      frame.current = 0;
      const active = navigation.current;
      if (!active || latest.current.disabled) return;
      const a = points.current.get(active.ids[0]), b = points.current.get(active.ids[1]);
      if (!a || !b) return;
      const current = geometry(a, b), dx = current.x - active.start.x, dy = current.y - active.start.y;
      if (active.mode === "pending") {
        const slide = Math.hypot(dx, dy), pinch = Math.abs(current.distance - active.start.distance) / 2;
        if (Math.max(slide, pinch) < 6) return;
        active.intentAt ??= now;
        const da = { x: a.x - active.origins[0].x, y: a.y - active.origins[0].y };
        const db = { x: b.x - active.origins[1].x, y: b.y - active.origins[1].y };
        const la = Math.hypot(da.x, da.y), lb = Math.hypot(db.x, db.y);
        const alignment = la > 4 && lb > 4 ? (da.x * db.x + da.y * db.y) / (la * lb) : 0;
        if (pinch > slide * 1.3) active.mode = "zoom";
        else if (slide > pinch * 1.3 || alignment > .35) active.mode = "rotate";
        else if (alignment < -.35 || now - active.intentAt >= 80) active.mode = "zoom";
        else { frame.current = requestAnimationFrame(updateView); return; }
        const host = latest.current.hostRef.current;
        if (host) host.dataset.spaceTouchMode = active.mode;
      }
      latest.current.setView({
        orbit: active.mode === "rotate" ? orbitSeedSpace(active.view.orbit, dx * 2, dy * 2) : active.view.orbit,
        zoom: active.mode === "zoom" ? clampSeedZoom(active.view.zoom * current.distance / active.start.distance) : active.view.zoom
      });
    };
    const move = (event: PointerEvent) => {
      if (!points.current.has(event.pointerId)) return;
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const active = navigation.current;
      if (!active || latest.current.disabled) return;
      event.preventDefault();
      // Read both fingers together once per frame rather than classifying the first event alone.
      if (!frame.current) frame.current = requestAnimationFrame(updateView);
    };
    const release = (event: PointerEvent) => {
      // A pending loss from the old seed is not a loss of the newly transferred view capture.
      if (event.type === "lostpointercapture" && navigation.current && event.target !== latest.current.hostRef.current) return;
      points.current.delete(event.pointerId);
      if (navigation.current?.ids.includes(event.pointerId)) finishRef.current();
      if (!points.current.size) {
        ending.current = false;
        const host = latest.current.hostRef.current;
        if (host) delete host.dataset.spaceNavigating;
      }
    };
    const cancel = () => clearRef.current();
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("lostpointercapture", release);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [options.layoutKey]);

  useEffect(() => {
    if (options.disabled) {
      clearRef.current();
    }
  }, [options.disabled]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || latest.current.disabled) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (navigation.current || ending.current || points.current.size !== 2) return;
    const [a, b] = [...points.current.entries()];
    const view = latest.current.getView();
    latest.current.onStart();
    // Cancelling the old seed capture may synchronously emit lostpointercapture.
    points.current.set(a[0], a[1]); points.current.set(b[0], b[1]);
    navigation.current = { ids: [a[0], b[0]], origins: [a[1], b[1]], start: geometry(a[1], b[1]), view, mode: "pending", intentAt: null };
    const host = latest.current.hostRef.current;
    if (host) {
      host.dataset.spaceNavigating = "true";
      for (const id of navigation.current.ids) host.setPointerCapture?.(id);
    }
    event.preventDefault();
    setNavigating(true);
  };

  return { navigating, onPointerDownCapture,
    blocksSinglePointer: () => Boolean(navigation.current || ending.current || points.current.size > 1) };
}
