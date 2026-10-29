"use client";

import { useEffect, useRef, useState } from "react";
import { appPath } from "@/lib/appPath";
import { defaultThinkingSpace, johariThinkingSpace, newThinkingAxis, normalizeAxisSuggestions, normalizeThinkingSpace, perspectiveLabel,
  type AxisPlacement, type AxisSuggestion, type ThinkingAxis, type ThinkingSpace } from "@/features/perspectives/model";
import type { PerspectiveControlsProps } from "./PerspectiveControls";
import type { SeedViewDirection } from "./liquid/space";
import styles from "./PerspectivePanel.module.css";

const placementLabel: Record<AxisPlacement, string> = { x: "左右", y: "上下", z: "前后", none: "附加维度" };
const poleView: Record<Exclude<AxisPlacement, "none">, [SeedViewDirection, SeedViewDirection]> = { x: ["left", "right"], y: ["bottom", "top"], z: ["front", "back"] };

export type PerspectivePanelProps = Omit<PerspectiveControlsProps, "workspaceId"> & {
  draft: ThinkingSpace;
  onDraftChange(draft: ThinkingSpace): void;
  onDiscardDraft(): void;
  onClose(): void;
};

export function PerspectivePanel({ space, draft, onDraftChange, onDiscardDraft, topic, suggestions: offered, onChange, onLook, onArrange, onResetView, onClose }: PerspectivePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [editing, setEditing] = useState(false);
  const setDraft = (next: ThinkingSpace | ((current: ThinkingSpace) => ThinkingSpace)) => onDraftChange(typeof next === "function" ? next(draft) : next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposals, setProposals] = useState<AxisSuggestion[]>([]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    }
    return () => { abortRef.current?.abort(); previous?.focus({ preventScroll: true }); };
  }, []);

  const suggestions = normalizeAxisSuggestions([...proposals, ...offered], draft.axes);
  const selectPole = (axis: ThinkingAxis, value: number) => {
    onChange({ ...space, focus: { ...space.focus, [axis.id]: value } });
    if (axis.placement !== "none" && value) onLook(poleView[axis.placement][value > 0 ? 1 : 0]);
  };
  const patchAxis = (id: string, patch: Partial<ThinkingAxis>) => {
    setDraft(current => ({ ...current, axes: current.axes.map(axis => axis.id === id ? { ...axis, ...patch }
      : patch.placement && patch.placement !== "none" && axis.placement === patch.placement ? { ...axis, placement: "none" } : axis) }));
  };
  const askForAxes = async () => {
    if (!topic.trim() || busy) return;
    const controller = new AbortController(); abortRef.current?.abort(); abortRef.current = controller;
    setBusy(true); setError("");
    try {
      const response = await fetch(appPath("/api/perspectives"), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, perspective: space }), signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      const axes = response.ok ? normalizeAxisSuggestions(body.axes, space.axes) : [];
      if (!axes.length) throw new Error("empty");
      setProposals(axes);
    } catch {
      if (!controller.signal.aborted) setError("暂时没能得到新维度。你的设置已保留，可以重试。");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const adopt = (axis: AxisSuggestion) => {
    if (draft.axes.length >= 24) return;
    setDraft({ ...draft, axes: [...draft.axes, { ...axis, id: newThinkingAxis().id, placement: "none" }] });
    setEditing(true); setError("");
  };
  const save = () => {
    if (draft.axes.some(axis => !axis.label.trim() || !axis.negative.trim() || !axis.positive.trim() || axis.negative.trim() === axis.positive.trim())) {
      setError("给维度和两端各起一个名字，两端需要有所区别。"); return;
    }
    onChange(normalizeThinkingSpace({ ...draft, focus: space.focus })); onDiscardDraft(); setEditing(false); setError("");
  };
  const hasJohari = space.axes.some(axis => axis.id === "johari-self") && space.axes.some(axis => axis.id === "johari-others");

  return <dialog ref={dialogRef} className={styles.panel} aria-labelledby="thinking-space-title" onCancel={onClose} data-preserve-seed-reading
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className={styles.header}><div><p>思考空间</p><h2 id="thinking-space-title">换个角度看</h2></div>
      <button type="button" className={styles.close} aria-label="关闭思考空间" onClick={onClose}>×</button></header>
    <nav className={styles.tabs} aria-label="思考空间设置">
      <button type="button" aria-pressed={!editing} onClick={() => { setEditing(false); setError(""); }}>观察</button>
      <button type="button" aria-pressed={editing} onClick={() => { setEditing(true); setError(""); }}>编辑维度</button>
    </nav>
    {editing ? <form className={styles.editor} onSubmit={event => { event.preventDefault(); save(); }}>
      <p className={styles.help}>三条维度可以放入空间，其余仍参与思考。新维度用于之后的生成，每颗种子保留当时的角度。</p>
      {draft.axes.map((axis, index) => <fieldset key={axis.id} className={styles.axisEditor}>
        <legend>维度 {index + 1}</legend>
        <label>名称<input value={axis.label} maxLength={24} onChange={event => patchAxis(axis.id, { label: event.target.value })} required /></label>
        <div className={styles.ends}><label>一端<input value={axis.negative} maxLength={32} onChange={event => patchAxis(axis.id, { negative: event.target.value })} required /></label>
          <span aria-hidden="true">↔</span><label>另一端<input value={axis.positive} maxLength={32} onChange={event => patchAxis(axis.id, { positive: event.target.value })} required /></label></div>
        <div className={styles.mapping}><label>放在<select value={axis.placement} onChange={event => patchAxis(axis.id, { placement: event.target.value as AxisPlacement })}>
          <option value="none">不放入空间</option><option value="x">左右方向</option><option value="y">上下方向</option><option value="z">前后方向</option></select></label>
          <button type="button" onClick={() => setDraft(current => ({ ...current, axes: current.axes.filter(item => item.id !== axis.id) }))} aria-label={`删除${axis.label}维度`}>删除</button></div>
        <label className={styles.confirmed}><input type="checkbox" checked={axis.evidence === "self-report"} onChange={event => patchAxis(axis.id, { evidence: event.target.checked ? "self-report" : "content" })} />
          需要我确认，AI 只提出探索问题</label>
      </fieldset>)}
      <div className={styles.editorActions}><button type="button" disabled={draft.axes.length >= 24} onClick={() => setDraft(current => ({ ...current, axes: [...current.axes, newThinkingAxis()] }))}>＋ 添加维度</button>
        <button type="button" onClick={() => setDraft(johariThinkingSpace())}>乔哈里模板</button>
        <button type="button" onClick={() => setDraft(defaultThinkingSpace())}>默认维度</button></div>
      <footer className={styles.footer}><button type="button" onClick={() => { onDiscardDraft(); setEditing(false); setError(""); }}>取消编辑</button><button type="submit" className={styles.primary}>保存维度</button></footer>
    </form> : <>
      <p className={styles.help}>选一端，新的写作与组合会从这里展开。已有种子继续推演时沿用原来的角度，也可以改用当前角度。</p>
      <p className={styles.help}>种子的色相随极性微调，偏向越明确颜色越浓，后代略亮。</p>
      {hasJohari ? <div className={styles.johari}><p>按你的了解选择区域；未知的部分留作问题。</p><div>{([
        ["公开区", 1, 1], ["盲区", -1, 1], ["隐藏区", 1, -1], ["未知区", -1, -1]
      ] as const).map(([label, self, others]) => <button type="button" key={label}
        aria-pressed={space.focus["johari-self"] === self && space.focus["johari-others"] === others}
        onClick={() => onChange({ ...space, focus: { ...space.focus, "johari-self": self, "johari-others": others } })}>{label}</button>)}</div></div> : null}
      <div className={styles.axes}>{space.axes.map(axis => <section key={axis.id} className={styles.axis} aria-label={axis.label}>
        <div className={styles.axisHeading}><h3>{axis.label}</h3><small>{placementLabel[axis.placement]}</small></div>
        <div className={styles.poles}><button type="button" aria-pressed={(space.focus[axis.id] || 0) < 0} onClick={() => selectPole(axis, -1)}>{axis.negative}</button>
          <button type="button" className={styles.neutral} aria-label={`${axis.label}不限定`} aria-pressed={!space.focus[axis.id]} onClick={() => selectPole(axis, 0)}>不限定</button>
          <button type="button" aria-pressed={(space.focus[axis.id] || 0) > 0} onClick={() => selectPole(axis, 1)}>{axis.positive}</button></div>
      </section>)}</div>
      <div className={styles.current}><span>{perspectiveLabel(space) ? `将从「${perspectiveLabel(space)}」展开` : "当前不限定观察角度"}</span>
        {perspectiveLabel(space) ? <button type="button" onClick={() => onChange({ ...space, focus: {} })}>清空选择</button> : null}</div>
      <div className={styles.views}><span>只改变观察方向</span><div>{([ ["front", "前"], ["back", "后"], ["left", "左"], ["right", "右"], ["top", "上"], ["bottom", "下"] ] as const).map(([direction, label]) =>
        <button type="button" key={direction} aria-label={`从${label}方观察`} onClick={() => { onLook(direction); onClose(); }}>{label}</button>)}</div></div>
      <button type="button" className={styles.arrange} onClick={() => { onResetView(); onClose(); }}>复位观察方向与缩放</button>
      <button type="button" className={styles.arrange} onClick={() => { onArrange(); onClose(); }}>按已有角度归位</button>
      <section className={styles.suggestions} aria-label="可补充的视角"><div className={styles.suggestionHeading}><h3>还有什么没看见</h3>
        <button type="button" disabled={busy || !topic.trim() || draft.axes.length >= 24} onClick={() => void askForAxes()}>{busy ? "正在寻找…" : "请 AI 提醒"}</button></div>
        {!topic.trim() ? <p>先写下一个问题，再一起找新的维度。</p> : !suggestions.length ? <p>AI 可以建议新的维度，由你决定是否采用。</p> : null}
        <div aria-live="polite" aria-busy={busy}>{suggestions.map(axis => <article key={axis.id} className={styles.suggestion}>
          <h4>{axis.label} <span>{axis.negative} ↔ {axis.positive}</span></h4><p>{axis.reason}</p>
          <button type="button" aria-label={`编辑并采用${axis.label}维度`} disabled={draft.axes.length >= 24} onClick={() => adopt(axis)}>编辑并采用</button>
        </article>)}</div>
      </section>
    </>}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </dialog>;
}
