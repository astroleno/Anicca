"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Graph } from "@/types/anicca";
import { compactEvolution, evolutionPath, projectEvolution, searchEvolution, type EvolutionNode } from "@/features/dialectic/evolution";
import { annotatePerspective } from "@/features/perspectives/model";
import { semanticSeedColor, seedColorPolarity } from "./liquid/color";
import styles from "./EvolutionOverview.module.css";
import { layoutEvolutionLabels, type EvolutionLabelBox } from "./evolutionLabels";
import { UnderstandingChange } from "./SeedMeaning";
import { clusterEvolutionNodes } from "./evolutionClustering";

type Props = { graph: Graph; initialNodeId: string | null; theme: "light" | "dark"; returnFocus?: HTMLElement | null; onEnter(id: string): void; onDismiss(): void };
type Camera = { x: number; y: number; scale: number };
type Hit = { x: number; y: number; ids: string[]; nodes: EvolutionNode[]; labelBox?: EvolutionLabelBox; radius?: number };
const PAGE_SIZE = 8;
const clampScale = (scale: number) => Math.max(.00001, Math.min(4, scale));

export function EvolutionOverview({ graph, initialNodeId, theme, returnFocus, onEnter, onDismiss }: Props) {
  const model = useMemo(() => projectEvolution(graph), [graph]);
  const panoramaModel = useMemo(() => compactEvolution(model), [model]);
  const [selectedId, setSelectedId] = useState(initialNodeId || model.nodes[model.nodes.length - 1]?.id || "");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [members, setMembers] = useState<string[] | null>(null);
  const [replay, setReplay] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 0 });
  const hits = useRef<Hit[]>([]);
  const redraw = useRef(() => {});
  const view = useRef<{ fit(): void; focus(id: string): void; zoom(factor: number): void; stop(): void }>({ fit() {}, focus() {}, zoom() {}, stop() {} });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureBounds = useRef<DOMRect | null>(null);
  const drag = useRef<{ camera: Camera; x: number; y: number; distance: number; moved: boolean } | null>(null);
  const cancelPointers = useCallback(() => {
    const ids = [...pointers.current.keys()];
    pointers.current.clear(); drag.current = null; gestureBounds.current = null;
    for (const id of ids) {
      if (canvasRef.current?.hasPointerCapture?.(id)) canvasRef.current.releasePointerCapture(id);
    }
  }, []);
  const skipReturnFocus = useRef(false);
  const returnFocusRef = useRef(returnFocus);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const results = useMemo(() => {
    const ids = members && new Set(members);
    return searchEvolution(model, query, kind).filter(node => !ids || ids.has(node.id));
  }, [model, query, kind, members]);
  const activeId = replay.length ? replay[step] : selectedId;
  const active = model.byId.get(activeId);
  const candidatePath = useMemo(() => evolutionPath(model, activeId), [model, activeId]);
  const mapModel = useMemo(() => {
    if (!replay.length) return panoramaModel;
    // Re-layout only the complete ancestor closure, so an unrelated dense
    // branch cannot push the two sources of a replay off opposite horizons.
    return projectEvolution({ ...graph, nodes: Object.fromEntries(replay.filter(id => graph.nodes[id]).map(id => [id, graph.nodes[id]])), edges: {} });
  }, [graph, panoramaModel, replay]);
  const colors = useMemo(() => new Map(model.nodes.map(node => [node.id,
    semanticSeedColor(node.role, node.generation, seedColorPolarity(node.source.perspective || (node.source.polarity ? annotatePerspective(node.source.polarity.frame) : undefined))).map(value => Math.round(value * 255)).join(",")
  ])), [model]);
  const state = useRef({ model: mapModel, activeId, replay, step, colors, theme });
  state.current = { model: mapModel, activeId, replay, step, colors, theme };

  const choose = (id: string) => { setPlaying(false); setReplay([]); setSelectedId(id); setSearchOpen(false); setMembers(null); view.current.focus(id); };
  const enter = (id: string) => { skipReturnFocus.current = true; onEnter(id); };
  const seek = (index: number) => { setPlaying(false); setStep(Math.max(0, Math.min(replay.length - 1, index))); };
  const beginReplay = () => {
    if (!candidatePath.length) return;
    setReplay(candidatePath); setStep(0);
    setPlaying(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && candidatePath.length > 1);
  };

  useEffect(() => {
    const interrupt = () => { cancelPointers(); view.current.stop(); setPlaying(false); };
    const hidden = () => { if (document.hidden) interrupt(); };
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", hidden);
      cancelPointers();
    };
  }, [cancelPointers]);

  useEffect(() => {
    const previous = returnFocusRef.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const first = () => rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    first();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); dismissRef.current(); return; }
      if (event.key !== "Tab") return;
      const root = rootRef.current;
      const items = root && Array.from(root.querySelectorAll<HTMLElement>("*")).filter(element => element.tabIndex >= 0 && !element.matches(":disabled"));
      if (!root || !items?.length) return;
      const firstItem = items[0], lastItem = items[items.length - 1];
      if (!root.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? lastItem : firstItem).focus(); }
      else if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    const focus = (event: FocusEvent) => {
      if (event.target !== document.body && event.target instanceof Node && !rootRef.current?.contains(event.target) && !document.querySelector("dialog[open]")) first();
    };
    window.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focus);
    return () => {
      window.removeEventListener("keydown", keydown); document.removeEventListener("focusin", focus);
      if (!skipReturnFocus.current && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!playing || !replay.length) return;
    if (step >= replay.length - 1 || replay.some(id => !model.byId.has(id))) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setStep(value => value + 1), 2100);
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pause);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", pause); };
  }, [playing, replay, step, model]);

  useEffect(() => { if (replay.length) view.current.focus(activeId); }, [activeId, replay.length]);
  useEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, [activeId, replay.length, query, kind, members]);
  useEffect(() => { redraw.current(); }, [mapModel, activeId, replay, step, theme]);
  useEffect(() => { if (!camera.current.scale && model.nodes.length) view.current.fit(); }, [model]);
  useEffect(() => { if (!replay.length) view.current.fit(); }, [mapModel, replay.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let width = 0, height = 0, frame = 0, disposed = false;
    let font = "sans-serif";
    const textWidths = new Map<string, number>();
    let tween: { start: number; from: Camera; to: Camera } | null = null;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const request = () => { if (!disposed && !frame) frame = requestAnimationFrame(draw); };
    const move = (to: Camera, animate = true) => {
      if (animate && !reduced?.matches) tween = { start: performance.now(), from: { ...camera.current }, to };
      else { tween = null; camera.current = to; }
      request();
    };
    const fitBounds = (nodes: EvolutionNode[], animate = true) => {
      if (!nodes.length) return;
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const node of nodes) { left = Math.min(left, node.x); right = Math.max(right, node.x); top = Math.min(top, node.y); bottom = Math.max(bottom, node.y); }
      const scale = clampScale(Math.min(1.4, (width - 150) / Math.max(180, right - left), (height - 155) / Math.max(120, bottom - top)));
      move({ scale, x: width / 2 - (left + right) / 2 * scale, y: height / 2 - 15 - (top + bottom) / 2 * scale }, animate);
    };
    const zoom = (factor: number, x = width / 2, y = height / 2) => {
      if (!camera.current.scale) { fitBounds(state.current.model.nodes); return; }
      const c = camera.current, scale = clampScale(c.scale * factor), ratio = scale / c.scale;
      move({ scale, x: x - (x - c.x) * ratio, y: y - (y - c.y) * ratio }, false);
    };
    view.current = {
      fit: () => fitBounds(state.current.model.nodes),
      zoom,
      stop: () => { tween = null; },
      focus: id => {
        const node = state.current.model.byId.get(id); if (!node) return;
        const scale = Math.max(.9, camera.current.scale);
        move({ scale, x: width / 2 - node.x * scale, y: height / 2 - 15 - node.y * scale });
      }
    };
    const draw = (now: number) => {
      frame = 0;
      if (disposed) return;
      if (tween) {
        const t = Math.min(1, (now - tween.start) / 380), ease = 1 - (1 - t) ** 3;
        camera.current = { x: tween.from.x + (tween.to.x - tween.from.x) * ease, y: tween.from.y + (tween.to.y - tween.from.y) * ease, scale: tween.from.scale + (tween.to.scale - tween.from.scale) * ease };
        if (t === 1) tween = null;
      }
      const { model: m, activeId: selected, replay: path, step: index, colors: palette, theme: appearance } = state.current;
      const c = camera.current, dark = appearance === "dark";
      const ink = dark ? "#e1dbe9" : "#41384c", muted = dark ? "#bbb0c7" : "#756a80";
      context.clearRect(0, 0, width, height);
      context.font = `12px ${font}`;
      context.textAlign = "center"; context.textBaseline = "middle";
      const tick = Math.max(1, Math.ceil(90 / (220 * c.scale)));
      const first = Math.max(0, Math.ceil((-c.x / c.scale - 100) / 220 / tick) * tick);
      for (let depth = first; depth <= Math.min(m.maxGeneration, (width - c.x) / c.scale / 220); depth += tick) {
        const x = (100 + depth * 220) * c.scale + c.x;
        context.fillStyle = muted; context.fillText(`第 ${depth} 代`, x, 22);
        context.strokeStyle = dark ? "rgba(205,193,218,.05)" : "rgba(107,87,122,.05)";
        context.beginPath(); context.moveTo(x, 42); context.lineTo(x, height); context.stroke();
      }
      const protectedIds = new Set([selected, ...(m.byId.get(selected)?.parents || []), ...path.slice(Math.max(0, index - 1), index + 1)]);
      const groups: Hit[] = clusterEvolutionNodes(m.nodes, c, { width, height }, protectedIds, node => {
        const label = node.label.length > 11 ? `${node.label.slice(0, 11)}…` : node.label;
        if (!textWidths.has(label)) { if (textWidths.size > 512) textWidths.clear(); textWidths.set(label, context.measureText(label).width); }
        return textWidths.get(label)!;
      });
      const endpoints = new Map<string, Hit>();
      for (const group of groups) for (const id of group.ids) endpoints.set(id, group);
      const seenPath = new Set(path.slice(0, index + 1)), allPath = new Set(path);
      const relevant = path.length ? allPath : new Set(evolutionPath(m, selected));
      const drawnEdges = new Set<string>();
      for (const edge of m.edges) {
        const fromNode = m.byId.get(edge.from)!, toNode = m.byId.get(edge.to)!;
        const a = endpoints.get(edge.from) || { x: fromNode.x * c.scale + c.x, y: fromNode.y * c.scale + c.y };
        const b = endpoints.get(edge.to) || { x: toNode.x * c.scale + c.x, y: toNode.y * c.scale + c.y };
        if (a === b || Math.max(a.x, b.x) < 0 || Math.min(a.x, b.x) > width || Math.max(a.y, b.y) < 40 || Math.min(a.y, b.y) > height) continue;
        const key = `${a.x},${a.y}:${b.x},${b.y}`; if (drawnEdges.has(key)) continue; drawnEdges.add(key);
        const inPath = relevant.has(edge.from) && relevant.has(edge.to);
        const revealed = !path.length || seenPath.has(edge.to);
        context.globalAlpha = inPath && revealed ? .65 : path.length ? .07 : .14;
        context.strokeStyle = muted; context.lineWidth = edge.relation === "synthesis" && inPath ? 1.6 : 1;
        context.setLineDash(edge.relation === "polarity" ? [4, 6] : []);
        context.beginPath(); context.moveTo(a.x, a.y);
        const bend = Math.max(36, Math.abs(b.x - a.x) * .45);
        context.bezierCurveTo(a.x + bend, a.y, b.x - bend, b.y, b.x, b.y); context.stroke();
      }
      context.setLineDash([]); context.globalAlpha = 1;
      hits.current = groups.sort((a, b) => Number(b.ids.includes(selected)) - Number(a.ids.includes(selected)));
      const labels = hits.current.map(group => {
        const node = group.nodes.find(item => item.id === selected) || group.nodes[0];
        const label = group.ids.length > 1 ? `${group.ids.length} 个想法` : node.label.length > 11 ? `${node.label.slice(0, 11)}…` : node.label;
        const caption = group.ids.length === 1 && (m.nodes.length <= 8 || c.scale >= .78 || protectedIds.has(node.id)) ? node.kind === "polarity" ? polarityCaption(node)
          : node.kind === "fission" ? `${node.source.branchType} · 推演正反` : node.kind === "inquiry" ? "一句话追问" : node.kind === "synthesis" ? "合流" : node.parents.length ? "延续" : "起点" : "";
        const measure = (text: string) => {
          if (!textWidths.has(text)) { if (textWidths.size > 512) textWidths.clear(); textWidths.set(text, context.measureText(text).width); }
          return textWidths.get(text)!;
        };
        return { id: group.ids[0], x: group.x, y: group.y, radius: group.ids.length > 1 ? 24 + Math.min(4, Math.log2(group.ids.length) * .6) : 27,
          width: Math.max(measure(label), measure(caption)) + 6, height: caption ? 33 : 14, label, caption };
      });
      const labelBoxes = layoutEvolutionLabels(labels, width, height);
      let labelIndex = 0;
      for (const group of hits.current) {
        const { x, y, ids } = group, node = group.nodes.find(item => item.id === selected) || group.nodes[0];
        const current = ids.includes(selected), future = path.length && !ids.some(id => seenPath.has(id));
        context.globalAlpha = future ? .28 : 1;
        const text = labels[labelIndex++], radius = text.radius, rgb = palette.get(node.id)!;
        group.radius = radius; group.labelBox = labelBoxes.get(text.id);
        const gradient = context.createRadialGradient(x - 5, y - 5, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(${rgb},${dark ? .9 : .95})`);
        gradient.addColorStop(.55, `rgba(${rgb},${dark ? .65 : .7})`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        context.fillStyle = gradient; context.beginPath(); context.ellipse(x, y, radius * 1.15, radius, -.18, 0, Math.PI * 2); context.fill();
        if (current) {
          context.strokeStyle = dark ? "rgba(212,199,225,.6)" : "rgba(125,104,142,.45)";
          context.lineWidth = 1; context.beginPath(); context.ellipse(x, y, radius + 7, radius + 3, -.18, 0, Math.PI * 2); context.stroke();
        }
        if (!group.labelBox) continue;
        const box = group.labelBox, center = box.x + box.width / 2;
        context.fillStyle = dark ? "#191620" : "#f8f7f9";
        context.fillRect(box.x - 2, box.y - 1, box.width + 4, box.height + 2);
        context.fillStyle = ink; context.fillText(text.label, center, box.y + 7);
        if (text.caption) { context.fillStyle = muted; context.fillText(text.caption, center, box.y + 26); }
      }
      context.globalAlpha = 1;
      canvas.dataset.draws = String(Number(canvas.dataset.draws || 0) + 1);
      canvas.dataset.visibleNodes = String(groups.length);
      canvas.dataset.scale = c.scale.toFixed(4);
      if (tween) request();
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width), nextHeight = Math.max(1, bounds.height);
      if (width && height && (width !== nextWidth || height !== nextHeight)) {
        // Keep the same world point in view across keyboard/orientation changes.
        const dx = (nextWidth - width) / 2, dy = (nextHeight - height) / 2;
        camera.current = { ...camera.current, x: camera.current.x + dx, y: camera.current.y + dy };
        if (tween) {
          tween.from = { ...tween.from, x: tween.from.x + dx, y: tween.from.y + dy };
          tween.to = { ...tween.to, x: tween.to.x + dx, y: tween.to.y + dy };
        }
        cancelPointers();
      }
      width = nextWidth; height = nextHeight;
      font = getComputedStyle(canvas).fontFamily;
      textWidths.clear();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pixelsWide = Math.round(width * dpr), pixelsHigh = Math.round(height * dpr);
      if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
      if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!camera.current.scale) fitBounds(state.current.model.nodes, false);
      request();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); setPlaying(false);
      const rect = canvas.getBoundingClientRect();
      zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .004), event.clientX - rect.left, event.clientY - rect.top);
    };
    redraw.current = request;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(canvas); canvas.addEventListener("wheel", wheel, { passive: false }); resize();
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); canvas.removeEventListener("wheel", wheel); redraw.current = () => {}; };
  }, [cancelPointers]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = gestureBounds.current || event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const startDrag = () => {
    const positions = [...pointers.current.values()], a = positions[0], b = positions[1];
    drag.current = a ? { camera: { ...camera.current }, x: b ? (a.x + b.x) / 2 : a.x, y: b ? (a.y + b.y) / 2 : a.y,
      distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, moved: Boolean(b) } : null;
  };
  const finishPointer = (event: PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    if (!pointers.current.has(event.pointerId)) return;
    const p = point(event), clicked = !cancelled && !drag.current?.moved && pointers.current.size === 1;
    const moved = drag.current?.moved;
    pointers.current.delete(event.pointerId); startDrag();
    if (!pointers.current.size) gestureBounds.current = null;
    if (drag.current && moved) drag.current.moved = true;
    if (!clicked) return;
    let hit: Hit | undefined;
    for (let index = hits.current.length - 1; index >= 0; index--) {
      const item = hits.current[index];
      const box = item.labelBox;
      const inLabel = box && p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
      if (inLabel || Math.hypot((item.x - p.x) / 1.15, item.y - p.y) <= (item.radius || 27) + 8) { hit = item; break; }
    }
    if (!hit) return;
    if (hit.ids.length === 1) choose(hit.ids[0]);
    else if (model.nodes.length > 120 && !replay.length) {
      setMembers(hit.ids); setQuery(""); setKind("all"); setPage(0); setSearchOpen(true); setSelectedId(hit.ids[0]);
      if (detailRef.current) detailRef.current.scrollTop = 0;
    }
    else { view.current.zoom(2); camera.current.x += (event.currentTarget.clientWidth / 2 - hit.x) * 2; camera.current.y += (event.currentTarget.clientHeight / 2 - hit.y) * 2; redraw.current(); }
  };

  return <section ref={rootRef} className={styles.overview} role="dialog" aria-modal="true" aria-labelledby="evolution-title" data-testid="evolution-overview">
    <header className={styles.header}>
      <div><p>anicca · 思想的来路</p><h2 id="evolution-title">演化全景</h2></div>
      <button type="button" onClick={onDismiss}>返回种子</button>
    </header>
    <div className={styles.tools}>
      <label className={styles.search}>寻找想法<input aria-label="搜索想法或极性" value={query} placeholder="想法、极性或视角…"
        onFocus={() => setSearchOpen(true)}
        onChange={event => { setQuery(event.target.value); setMembers(null); setPage(0); setPlaying(false); setSelectedId(activeId); setReplay([]); setSearchOpen(true); }}
        onKeyDown={event => { if (event.key === "Enter" && results[0]) choose(results[0].id); }} /></label>
      <select aria-label="筛选演化关系" value={kind} onChange={event => { setKind(event.target.value); setMembers(null); setPage(0); setPlaying(false); setSelectedId(activeId); setReplay([]); setSearchOpen(true); }}>
        <option value="all">全部关系</option><option value="polarity">沿极性展开</option><option value="fission">推演正反</option><option value="synthesis">合流</option><option value="inquiry">一句话追问</option>
      </select>
      <span className={styles.count}>{model.nodes.length} 个想法 · {model.nodes.length ? model.maxGeneration + 1 : 0} 代</span>
    </div>
    <div className={styles.body}>
      <div className={styles.map}>
        <canvas ref={canvasRef} tabIndex={0} role="img" aria-label="演化关系图：拖动平移，滚轮或双指缩放；左右键逐个查看想法，Enter 阅读，Home 查看全景"
          onKeyDown={event => {
            const index = model.nodes.findIndex(node => node.id === activeId);
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); choose(model.nodes[Math.max(0, Math.min(model.nodes.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))]?.id || ""); }
            if (event.key === "Home") { event.preventDefault(); setPlaying(false); view.current.fit(); }
            if (event.key === "+" || event.key === "=") { event.preventDefault(); view.current.zoom(1.4); }
            if (event.key === "-") { event.preventDefault(); view.current.zoom(1 / 1.4); }
            if (event.key === "Enter" && active) enter(active.id);
          }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            if (!pointers.current.size) gestureBounds.current = event.currentTarget.getBoundingClientRect();
            setPlaying(false); view.current.stop(); event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, point(event)); startDrag();
          }}
          onPointerMove={event => {
            if (!pointers.current.has(event.pointerId) || !drag.current) return;
            pointers.current.set(event.pointerId, point(event));
            const [a, b] = [...pointers.current.values()], d = drag.current;
            const x = b ? (a.x + b.x) / 2 : a.x, y = b ? (a.y + b.y) / 2 : a.y;
            const ratio = b && d.distance ? Math.hypot(a.x - b.x, a.y - b.y) / d.distance : 1;
            const scale = clampScale(d.camera.scale * ratio), zoom = scale / d.camera.scale;
            if (Math.hypot(x - d.x, y - d.y) > 4 || b) d.moved = true;
            if (!d.moved) return;
            camera.current = { scale, x: x - (d.x - d.camera.x) * zoom, y: y - (d.y - d.camera.y) * zoom }; redraw.current();
          }} onPointerUp={event => finishPointer(event)} onPointerCancel={event => finishPointer(event, true)} onLostPointerCapture={event => finishPointer(event, true)} />
        <div className={styles.mapControls}><button type="button" aria-label="缩小全景" onClick={() => { setPlaying(false); view.current.zoom(1 / 1.4); }}>−</button>
          <button type="button" onClick={() => { setPlaying(false); view.current.fit(); }}>适应全景</button><button type="button" aria-label="放大全景" onClick={() => { setPlaying(false); view.current.zoom(1.4); }}>＋</button></div>
        <p className={styles.hint}>虚线 · 极性　实线 · 正反与延续　汇入 · 合流</p>
      </div>
      <aside ref={detailRef} className={styles.detail} aria-label="路径与想法">
        {searchOpen && !replay.length && (members || query || kind !== "all") ? <div className={styles.results}>
          <p role="status">{members ? "这一簇 · " : "找到 "}{results.length} 个想法</p>
          {members ? <button type="button" onClick={() => { setMembers(null); setSearchOpen(false); }}>返回全部</button> : null}
          {results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(node => <button type="button" key={node.id} aria-pressed={activeId === node.id} onClick={() => choose(node.id)}>{node.label}<small>{node.phase}</small></button>)}
          {results.length > PAGE_SIZE ? <nav aria-label="搜索分页"><button type="button" disabled={!page} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page + 1}/{Math.ceil(results.length / PAGE_SIZE)}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= results.length} onClick={() => setPage(value => value + 1)}>下一页</button></nav> : null}
        </div> : null}
        {active ? <article className={styles.reading}>
          <p className={styles.phase} role="status">{active.cyclic ? "来源待梳理" : `第 ${active.generation} 代`} · {active.phase}</p>
          <h3>{active.label}</h3>
          <div className={styles.readActions}><button type="button" onClick={() => enter(active.id)}>进入种子</button>
            <button type="button" disabled={!candidatePath.length || replay.length > 0} onClick={beginReplay}>回放来路</button></div>
          <UnderstandingChange node={graph.nodes[active.id]} graph={graph} onPick={choose} />
          {active.source.inquiry ? <p className={styles.lens}>围绕原句 · {active.source.inquiry.quote}</p> : null}
          {active.lens ? <p className={styles.lens}>当时的思考角度 · {active.lens}</p> : null}
          <p className={styles.summary}>{active.summary}</p>
          {active.parents.length ? <div className={styles.sources}><span>{active.kind === "synthesis" ? "共同来源" : "从这里生长"}</span>{active.parents.map(id => <button key={id} type="button" onClick={() => choose(id)}>{model.byId.get(id)?.label}</button>)}</div> : null}
          {active.cyclic ? <p>这条来路有循环，请先在来源中梳理关系。</p> : null}
        </article> : <p>种下一个想法，便能看见它的来路。</p>}
      </aside>
    </div>
    <footer className={styles.replay} aria-label="路径回放">
      {replay.length ? <><div className={styles.transport}>
        <button type="button" disabled={step === 0} onClick={() => seek(step - 1)}>上一幕</button>
        <button type="button" disabled={replay.length < 2} onClick={() => { if (step === replay.length - 1) setStep(0); setPlaying(value => !value); }}>{playing ? "暂停" : step === replay.length - 1 ? "重播" : "播放"}</button>
        <button type="button" disabled={step === replay.length - 1} onClick={() => seek(step + 1)}>下一幕</button>
        <button type="button" onClick={() => { setSelectedId(activeId); setPlaying(false); setReplay([]); }}>结束回放</button></div>
        <label>第 {step + 1} / {replay.length} 幕<input aria-label="回放进度" type="range" min={0} max={replay.length - 1} value={step} onChange={event => seek(Number(event.target.value))} /></label>
        <p>{replay.some(id => model.byId.get(id)?.kind === "synthesis") ? "顺着来源回看，共同来源在合流处相遇。" : "顺着来源回看，观察视角如何逐步展开。"}</p></> : <p>{model.nodes.length > 120 ? "远景已聚合，点击簇查看成员，进入种子继续探索。" : "选择一颗种子，回看来路。极性是观察角度，正反是推演方式。"}</p>}
    </footer>
  </section>;
}

function polarityCaption(node: EvolutionNode) {
  const origin = node.source.polarity;
  if (!origin) return "极性";
  const axis = origin.frame.axes.find(item => item.id === origin.axisId)!;
  return `${axis.label} · ${origin.pole < 0 ? axis.negative : axis.positive}`;
}
