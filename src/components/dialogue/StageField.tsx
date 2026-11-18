"use client";

import type { ReactNode } from "react";
import type { DialogueStageNode } from "@/features/dialectic/viewModel";
import type { ThinkingAxis, ThinkingSpace } from "@/features/perspectives/model";
import { defaultThinkingSpace } from "@/features/perspectives/model";
import styles from "./DialogueShell.module.css";

type Sign = 1 | -1;
type FocusPatch = Record<string, number>;

/** Johari regions in the panel's terms: x = what I know, y = what others know. */
const JOHARI_REGIONS: ReadonlyArray<{ label: string; self: Sign; others: Sign }> = [
  { label: "盲区", self: -1, others: 1 },
  { label: "公开区", self: 1, others: 1 },
  { label: "未知区", self: -1, others: -1 },
  { label: "隐藏区", self: 1, others: -1 }
];
const DEFAULT_AXIS_IDS = new Set(defaultThinkingSpace().axes.map(axis => axis.id));
/** A seed counts as leaning toward a pole the same way placement does. */
const LEANS = .4;

function placed(space: ThinkingSpace, placement: "x" | "y") {
  return space.axes.find(axis => axis.placement === placement);
}

function lean(value: number | undefined): Sign | 0 {
  return value === undefined || Math.abs(value) < LEANS ? 0 : value > 0 ? 1 : -1;
}

/**
 * The faint field behind the seeds: where a thinking direction is laid out on the stage, its poles
 * are named at the edges. It rests nearly invisible, rises while a seed is carried, and an unexplored
 * Johari region breathes softly. Choosing a region or pole only aims the next thought; nothing moves.
 */
export function StageField({ space, nodes, carrying = false, hidden = false, onFocus }: {
  space: ThinkingSpace;
  nodes: readonly DialogueStageNode[];
  carrying?: boolean;
  hidden?: boolean;
  onFocus(patch: FocusPatch): void;
}) {
  const xAxis = placed(space, "x"), yAxis = placed(space, "y");
  if (!xAxis && !yAxis) return null;
  const johari = xAxis?.id === "johari-self" && yAxis?.id === "johari-others";
  const directed = nodes.filter(node => node.spatialCoordinates);
  // The built-in directions only surface while a seed is carried; chosen ones (Johari, your own axes) rest faintly.
  const chosenSpace = space.axes.some(axis => !DEFAULT_AXIS_IDS.has(axis.id)) || Object.keys(space.focus).length > 0;
  const asleep = hidden || (!chosenSpace && !carrying);
  const field = (content: ReactNode) => <div className={styles.stageField} data-testid="dialogue-stage-field"
    data-carrying={carrying ? "true" : undefined} data-hidden={asleep ? "true" : undefined}
    inert={asleep ? true : undefined}>
    {xAxis ? <span className={styles.stageFieldAxis} data-axis="x" aria-hidden="true" /> : null}
    {yAxis ? <span className={styles.stageFieldAxis} data-axis="y" aria-hidden="true" /> : null}
    {content}
  </div>;

  if (johari) {
    const focusSelf = lean(space.focus["johari-self"]), focusOthers = lean(space.focus["johari-others"]);
    return field(JOHARI_REGIONS.map(region => {
      const chosen = focusSelf === region.self && focusOthers === region.others;
      const visited = directed.some(node => lean(node.spatialCoordinates?.x) === region.self && lean(node.spatialCoordinates?.y) === region.others);
      return <button key={region.label} type="button" className={styles.stageFieldRegion}
        data-self={region.self} data-others={region.others}
        data-unexplored={directed.length && !visited ? "true" : undefined}
        aria-pressed={chosen} aria-label={`下一个想法从「${region.label}」展开`}
        onClick={() => onFocus(chosen ? { "johari-self": 0, "johari-others": 0 } : { "johari-self": region.self, "johari-others": region.others })}>
        {region.label}
      </button>;
    }));
  }

  const pole = (axis: ThinkingAxis, value: Sign, side: string) => {
    const chosen = lean(space.focus[axis.id]) === value;
    const name = value > 0 ? axis.positive : axis.negative;
    return <button key={`${axis.id}${value}`} type="button" className={styles.stageFieldPole} data-side={side}
      aria-pressed={chosen} aria-label={`下一个想法偏向「${name}」`}
      onClick={() => onFocus({ [axis.id]: chosen ? 0 : value })}>{name}</button>;
  };
  return field(<>
    {xAxis ? [pole(xAxis, -1, "left"), pole(xAxis, 1, "right")] : null}
    {yAxis ? [pole(yAxis, 1, "top"), pole(yAxis, -1, "bottom")] : null}
  </>);
}
