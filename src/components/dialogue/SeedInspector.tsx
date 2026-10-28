"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Graph, SeedInstances } from "@/types/anicca";
import { seedLabel } from "@/features/dialectic/seeds";
import { conceptInstances, sourceInstances, seedConceptId } from "@/features/dialectic/seedInstances";
import { defaultThinkingSpace, normalizeSeedPerspective, normalizeThinkingSpace, perspectiveLabel, seedPerspectiveLabel, type ThinkingSpace } from "@/features/perspectives/model";
import { normalizePolarityOrigin, polarityAxis, polarityLabel } from "@/features/perspectives/polarity";
import styles from "./DialogueShell.module.css";
import { deferredSyntheses, readUnderstandingChange } from "@/features/dialectic/meaning";
import { DeferredEncounter, UnderstandingChange } from "./SeedMeaning";
import { SeedPassage } from "./SeedPassage";
import { inquiryLabel, readInquiryOrigin, type InquiryTarget } from "@/features/dialectic/inquiry";
import { readNovelty } from "@/features/dialectic/novelty";
import type { ReadingPosition } from "@/lib/persist/readingState";
import { captureReadingPosition, restoreReadingPosition } from "./readingPosition";
import { SeedPrimaryActions } from "./SeedPrimaryActions";

export function SeedInspector({ graph, nodeId, instanceId = nodeId, instances = {}, space = defaultThinkingSpace(), combining, busy, activeDeferredId, onContinueDeferred, onClose, onSplit, onExpandPolarity, onWrite, onCombine, onPick, onCreateInstance, onRemoveInstance, onExpandSources, onInquiry, inquiryTarget, inquiryComposer, companionId, getReadingPosition, onRememberPosition, onReadingIntent, onReadNewResponse, polarityRequest = 0 }: {
  graph: Graph; nodeId: string; combining: boolean; busy: boolean;
  instanceId?: string; instances?: SeedInstances;
  space?: ThinkingSpace;
  activeDeferredId?: string | null;
  onContinueDeferred?(id: string): void;
  onClose(): void; onSplit(frame?: ThinkingSpace): void; onWrite(): void; onCombine(): void; onPick(id: string): void;
  onExpandPolarity?(axisId: string, frame: ThinkingSpace): void;
  onInquiry?(target: InquiryTarget): void;
  inquiryTarget?: InquiryTarget; inquiryComposer?: ReactNode; companionId?: string;
  getReadingPosition?(id: string): ReadingPosition | undefined; onRememberPosition?(id: string, position: ReadingPosition): void;
  onReadingIntent?(): void; onReadNewResponse?(): void;
  polarityRequest?: number;
  onCreateInstance?(): void; onRemoveInstance?(): void; onExpandSources?(): void;
}) {
  const [query, setQuery] = useState("");
  const [polarityOpen, setPolarityOpen] = useState(false);
  const [axisId, setAxisId] = useState("");
  const [useCurrentAngle, setUseCurrentAngle] = useState(false);
  const [selectionActive, setSelectionActive] = useState(false);
  const selecting = selectionActive || Boolean(inquiryTarget);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const polarityButtonRef = useRef<HTMLButtonElement>(null);
  const lastPolarityRequest = useRef(0);
  const readingPositionRef = useRef<ReadingPosition>({ scrollTop: 0 });
  const wasChoosingRef = useRef(false);
  const wasInlineRef = useRef(Boolean(inquiryComposer));
  useLayoutEffect(() => {
    if (polarityRequest && polarityRequest !== lastPolarityRequest.current) {
      if (inspectorRef.current) readingPositionRef.current = captureReadingPosition(inspectorRef.current);
      setPolarityOpen(true);
    }
    lastPolarityRequest.current = polarityRequest;
  }, [polarityRequest]);
  useLayoutEffect(() => {
    const panel = inspectorRef.current;
    if (!panel) return;
    readingPositionRef.current = getReadingPosition?.(nodeId) || { scrollTop: 0 };
    restoreReadingPosition(panel, readingPositionRef.current);
    let disposed = false, interacted = false, frame = 0;
    const interact = () => { interacted = true; };
    const afterLayout = () => {
      if (disposed || interacted || panel.dataset.mode !== "read") return;
      restoreReadingPosition(panel, readingPositionRef.current);
    };
    frame = requestAnimationFrame(afterLayout);
    // Font metrics may arrive after the first paint. Never move text after a
    // reader has started interacting with it.
    void document.fonts?.ready.then(() => { if (!disposed && !interacted) { cancelAnimationFrame(frame); frame = requestAnimationFrame(afterLayout); } });
    panel.addEventListener("pointerdown", interact, true); panel.addEventListener("wheel", interact, true); panel.addEventListener("keydown", interact, true);
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      panel.removeEventListener("pointerdown", interact, true); panel.removeEventListener("wheel", interact, true); panel.removeEventListener("keydown", interact, true);
      onRememberPosition?.(nodeId, readingPositionRef.current);
    };
  }, [nodeId, getReadingPosition, onRememberPosition]);
  useLayoutEffect(() => {
    const panel = inspectorRef.current;
    if (!panel) return;
    if (polarityOpen) {
      panel.scrollTop = 0;
      panel.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    } else if (wasChoosingRef.current) {
      restoreReadingPosition(panel, readingPositionRef.current);
      polarityButtonRef.current?.focus({ preventScroll: true });
    }
    wasChoosingRef.current = polarityOpen;
  }, [polarityOpen]);
  useLayoutEffect(() => {
    if (wasInlineRef.current && !inquiryComposer && inspectorRef.current) {
      // Removing the completed inline question must not move the line being read.
      restoreReadingPosition(inspectorRef.current, readingPositionRef.current);
    }
    wasInlineRef.current = Boolean(inquiryComposer);
  }, [inquiryComposer]);
  const node = graph.nodes[nodeId];
  if (!node) return null;
  const perspective = normalizeSeedPerspective(node.meta?.perspective);
  const inquiry = readInquiryOrigin(node.meta?.inquiry, graph);
  const origin = normalizePolarityOrigin(node.meta?.polarity);
  const originAxis = origin ? polarityAxis(origin) : null;
  const capturedFrame = origin?.frame || (node.meta?.fissionFrame ? normalizeThinkingSpace(node.meta.fissionFrame) : null);
  const expansionFrame = capturedFrame && !useCurrentAngle ? capturedFrame : space;
  const frameDiffers = capturedFrame && JSON.stringify(capturedFrame) !== JSON.stringify(normalizeThinkingSpace(space));
  const chosenAxis = expansionFrame.axes.find(axis => axis.id === axisId) || expansionFrame.axes[0];
  const otherAngles = chosenAxis ? perspectiveLabel({ ...expansionFrame,
    focus: Object.fromEntries(Object.entries(expansionFrame.focus).filter(([id]) => id !== chosenAxis.id)) }) : "";
  const continuationLens = perspectiveLabel(expansionFrame);
  const lens = seedPerspectiveLabel(perspective);
  const axes = perspective?.axes.filter(axis => Math.abs(axis.value) > .1) || [];
  const copies = conceptInstances(instances, nodeId);
  const sources = sourceInstances(graph, instances, instanceId);
  const encounters = deferredSyntheses(graph, nodeId).filter(item => !item.resolvedNodeId).map(item => ({ ...item,
    sourceInstanceIds: item.sourceNodeIds.map((id, index) => {
      const saved = item.sourceInstanceIds?.[index];
      return saved && seedConceptId(graph, instances, saved) === id ? saved : id;
    }) as [string, string]
  }));
  const activeEncounter = encounters.find(item => item.id === activeDeferredId);
  const allCandidates = Object.values(graph.nodes).filter(candidate => candidate.id !== nodeId && candidate.text?.trim()).reverse();
  const candidates = allCandidates.filter(candidate => `${candidate.text} ${candidate.meta?.label || ""}`.includes(query.trim()));
  const companion = candidates.find(candidate => candidate.id === companionId);
  const otherCandidates = candidates.filter(candidate => candidate.id !== companion?.id);
  const novelty = readNovelty(node.meta?.novelty);
  const continuationText = (novelty?.status !== "unchecked" && novelty?.status !== "revisit" ? readUnderstandingChange(node.meta?.change) : undefined)
    || node.meta?.summary || seedLabel(graph, nodeId);
  const expansionControls = <div className={styles.seedContinuation} aria-label="接着这个想法展开">
    {polarityOpen ? <p className={styles.seedExpansionAnchor}>围绕：{continuationText}</p> :
      <SeedPrimaryActions disabled={busy || !node.text?.trim()} onSplit={() => onSplit(expansionFrame)} onCombine={onCombine}
        polarityRef={polarityButtonRef} polarityOpen={polarityOpen}
        onPolarity={onExpandPolarity ? () => { if (inspectorRef.current) readingPositionRef.current = captureReadingPosition(inspectorRef.current); setPolarityOpen(true); } : undefined} />}
    {capturedFrame && (continuationLens || frameDiffers) ? <p className={styles.seedLensHint}>
      {continuationLens ? `从「${continuationLens}」继续` : useCurrentAngle ? "当前入口未限定极性" : "沿用原来的入口，未限定极性"}
      {frameDiffers ? <button type="button" disabled={busy} onClick={() => setUseCurrentAngle(value => !value)}>
        {useCurrentAngle ? "用种子原来的角度" : "改用当前角度"}</button> : null}
    </p> : null}
    {!expansionFrame.axes.length ? <p className={styles.seedLensHint}>在「换个角度」中添加维度，就可以沿两端展开。</p> : null}
    {polarityOpen && chosenAxis && onExpandPolarity ? <fieldset id="seed-polarity-picker" className={styles.polarityPicker}>
      <legend>沿哪条维度展开</legend>
      <div className={styles.polarityAxes}>{expansionFrame.axes.map(axis => <label key={axis.id}>
        <input type="radio" name="seed-polarity-axis" value={axis.id} checked={chosenAxis.id === axis.id}
          onChange={() => setAxisId(axis.id)} />
        <span>{axis.label}<small>{axis.negative} <span aria-hidden="true">↔</span> {axis.positive}</small></span>
      </label>)}</div>
      <p>从「{chosenAxis.negative}」和「{chosenAxis.positive}」分别看这个想法，两端都能继续推演正反。</p>
      <p>{otherAngles ? `其余角度保持：${otherAngles}` : "其余维度不限定观察入口。"}</p>
      {chosenAxis.evidence === "self-report" ? <p>两端作为待确认的假设探索，不推断谁已经知道什么。</p> : null}
      <div className={styles.polarityPickerActions}>
        <button type="button" onClick={() => setPolarityOpen(false)}>收起选择</button>
        <button type="button" disabled={busy} onClick={() => onExpandPolarity(chosenAxis.id, expansionFrame)}>沿「{chosenAxis.label}」展开</button>
      </div>
    </fieldset> : null}
  </div>;
  return (
    <div className={styles.seedInspectorFrame}
      onKeyDown={event => {
        if (event.key !== "Escape" || !polarityOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setPolarityOpen(false);
      }}>
      <div className={styles.seedReadingToolbar}>
        {onReadNewResponse ? <button type="button" className={styles.seedNewResponse} onClick={onReadNewResponse}
          aria-label="阅读新回应">新回应已保存 · 阅读</button>
          : <span>{polarityOpen ? `从「${seedLabel(graph, nodeId)}」继续` : combining ? "组合" : activeEncounter ? "暂不融合" : inquiry ? inquiryLabel(inquiry.intent) : origin ? "极性视角" : node.branchType || "想法"}</span>}
        <button type="button" className={styles.seedReadingBack} aria-label={polarityOpen ? "返回种子阅读" : "返回种子，收起阅读"}
          onClick={polarityOpen ? () => setPolarityOpen(false) : onClose}>{polarityOpen ? "返回阅读" : "返回种子"}</button>
      </div>
    <section ref={inspectorRef} className={styles.seedInspector} data-testid="dialogue-panel" aria-labelledby="conversation-panel-heading"
      data-mode={polarityOpen ? "polarity" : combining ? "combine" : "read"} data-selecting={selecting ? "true" : undefined}
      onWheel={event => { if (!(event.target instanceof Element) || !event.target.closest("input, textarea, select, [contenteditable='true']")) onReadingIntent?.(); }}
      onPointerDown={event => {
        if (event.target instanceof Element && !event.target.closest("button, a, input, textarea, select, label, summary, [contenteditable='true']")) onReadingIntent?.();
      }}
      onKeyDown={event => {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key) &&
          event.target instanceof Element && !event.target.closest("button, a, input, textarea, select, summary, [contenteditable='true']")) onReadingIntent?.();
      }}
      onScroll={event => { if (!polarityOpen && !combining) { readingPositionRef.current = captureReadingPosition(event.currentTarget); onRememberPosition?.(nodeId, readingPositionRef.current); } }}>
      <header className={styles.seedInspectorHeader}>
        <h2 id="conversation-panel-heading" tabIndex={-1}>{polarityOpen ? "沿极性展开" : combining ? "让想法相遇" : seedLabel(graph, nodeId)}</h2>
      </header>
      {combining ? (
        <>
          <p className={styles.seedContextHint}>与「{seedLabel(graph, nodeId)}」组合</p>
          <input className={styles.seedSearch} aria-label="搜索种子" placeholder="搜索已有想法…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className={styles.seedPicker} role="group" aria-label="选择组合对象">
            {companion ? <><p className={styles.seedPickerHeading}>本轮另一端</p>
              <button type="button" disabled={busy} onClick={() => onPick(companion.id)}>
                <small>{polarityLabel(companion.meta?.polarity) || companion.branchType || "想法"}</small><span>{seedLabel(graph, companion.id)}</span>
              </button></> : null}
            {companion && otherCandidates.length ? <p className={styles.seedPickerHeading}>其他想法</p> : null}
            {otherCandidates.map((candidate) => (
              <button key={candidate.id} type="button" disabled={busy} onClick={() => onPick(candidate.id)}>
                <small>{polarityLabel(candidate.meta?.polarity) || candidate.branchType || "想法"}</small><span>{seedLabel(graph, candidate.id)}</span>
              </button>
            ))}
            {!candidates.length ? allCandidates.length ? <div role="status"><p>没有找到匹配的种子，换个词试试。</p>
              <button type="button" onClick={() => setQuery("")}>清空搜索</button></div>
              : <p>还没有可组合的种子。可以先写一个想法，或裂变当前种子。</p> : null}
          </div>
        </>
      ) : activeEncounter ? (
        <DeferredEncounter encounter={activeEncounter} graph={graph} busy={busy} onPick={onPick} onDismiss={onClose}
          onContinue={onContinueDeferred ? () => onContinueDeferred(activeEncounter.id) : undefined} />
      ) : (
        <>
          {originAxis ? <p className={styles.seedPolarityOrigin}>沿「{originAxis.label}」· {polarityLabel(origin)}
            {originAxis.evidence === "self-report" ? " · 待确认的假设视角" : ""}</p> : null}
          {inquiry ? <details className={styles.seedInquiryOrigin} data-seed-meaning>
            <summary title={inquiry.quote}>原句 · {inquiry.quote}</summary>
            <button type="button" onClick={() => onPick(inquiry.sourceNodeId)}>从「{seedLabel(graph, inquiry.sourceNodeId)}」的一句话继续</button>
            <blockquote>{inquiry.quote}</blockquote><p>{inquiry.question}</p>
          </details> : null}
          <UnderstandingChange node={node} graph={graph} onPick={onPick}
            onReframe={onExpandPolarity && !busy && !selecting ? () => { if (inspectorRef.current) readingPositionRef.current = captureReadingPosition(inspectorRef.current); setPolarityOpen(true); } : undefined} />
          {!selecting ? expansionControls : null}
          <SeedPassage key={node.id} nodeId={node.id} text={node.text || "这颗种子还没有正文。"} className={styles.seedBody}
            busy={busy} onInquiry={!polarityOpen && node.text?.trim() ? onInquiry : undefined}
            inquiryTarget={inquiryTarget} inquiryComposer={inquiryComposer} onSelectionChange={setSelectionActive} />
          {node.meta?.connectionInput ? <details className={styles.seedPerspective} data-seed-meaning><summary>这次补充的联系</summary><p>{node.meta.connectionInput}</p></details> : null}
          {encounters.length ? <details className={styles.seedPerspective} data-seed-meaning><summary>暂存的相遇 · {encounters.length}</summary>
            {encounters.map(encounter => <DeferredEncounter key={encounter.id} encounter={encounter} graph={graph} busy={busy} onPick={onPick}
              onContinue={onContinueDeferred ? () => onContinueDeferred(encounter.id) : undefined} />)}
          </details> : null}
          {axes.length ? <details className={styles.seedPerspective}>
            <summary>{lens ? `当时从「${lens}」看` : "这个种子的角度"}</summary>
            <ul>{axes.map(axis => <li key={axis.id}>{axis.label}：{axis.value > 0 ? axis.positive : axis.negative}
              <span>{axis.source === "model" ? "内容偏向" : "所选角度"}</span></li>)}</ul>
          </details> : null}
          {sources.length ? (
            <div className={styles.seedSources} aria-label="合的来源">
              <span>来自</span>
              {sources.map((id) => <button key={id} type="button" onClick={() => onPick(id)}>{seedLabel(graph, seedConceptId(graph, instances, id) || id)}</button>)}
              {onExpandSources ? <button type="button" onClick={onExpandSources}>展开来源</button> : null}
            </div>
          ) : null}
          {copies.length ? <details className={styles.seedInstanceList}>
            <summary>同一概念 · 原种子与 {copies.length} 个分身</summary>
            <p>内容共享，各自的位置与融合记录独立。</p>
            <div aria-label="同一概念的种子">
              {[{ id: nodeId, ordinal: 0 }, ...copies].map((instance) => <button key={instance.id} type="button"
                aria-current={instance.id === instanceId ? "true" : undefined} onClick={() => onPick(instance.id)}>
                {instance.ordinal ? `分身 ${instance.ordinal}` : "原种子"}
              </button>)}
            </div>
          </details> : null}
          {!selecting ? <div className={styles.seedActions}>
            {onCreateInstance ? <button className={styles.secondaryButton} type="button" disabled={busy || !node.text?.trim()} onClick={onCreateInstance}>分身</button> : null}
            <button className={styles.secondaryButton} type="button" disabled={busy} onClick={onWrite}>继续写</button>
            {instanceId !== nodeId && onRemoveInstance ? <button className={styles.secondaryButton} type="button" disabled={busy} onClick={onRemoveInstance}>收起这个分身</button> : null}
          </div> : null}
        </>
      )}
    </section>
    </div>
  );
}
