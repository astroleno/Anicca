"use client";

import { Fragment, type ReactNode } from "react";
import type { DialogueStageNode } from "@/features/dialectic/viewModel";
import type { ThinkingAxis, ThinkingSpace } from "@/features/perspectives/model";
import { isChosenSpace, isJohari, JOHARI_REGIONS, lean, placed, type Sign } from "./thinkingField";
import styles from "./DialogueShell.module.css";

type FocusPatch = Record<string, number>;

/**
 * The faint field behind the seeds: where a thinking direction is laid out on the stage, its poles
 * are named at the edges. It rests nearly invisible, rises while a seed is carried, and an unexplored
 * Johari region breathes softly. Choosing a region or pole only aims the next thought; nothing moves.
 */
export function StageField({ space, nodes, carrying = false, hidden = false, synthesisActive = false, onFocus }: {
  space: ThinkingSpace;
  nodes: readonly DialogueStageNode[];
  carrying?: boolean;
  hidden?: boolean;
  synthesisActive?: boolean;
  onFocus(patch: FocusPatch): void;
}) {
  const xAxis = placed(space, "x"), yAxis = placed(space, "y");
  if (!xAxis && !yAxis) return null;
  const johari = isJohari(space);
  if (johari && synthesisActive) return null;
  const directed = nodes.filter(node => node.spatialCoordinates);
  // The built-in directions only surface while a seed is carried; chosen ones (Johari, your own axes) rest faintly.
  const chosenSpace = isChosenSpace(space);
  const asleep = hidden || (!chosenSpace && !carrying);
  const field = (content: ReactNode) => <div className={styles.stageField} data-testid="dialogue-stage-field"
    data-johari={johari ? "true" : undefined}
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
      return <Fragment key={region.label}><button type="button" className={styles.stageFieldRegion}
        data-self={region.self} data-others={region.others}
        data-unexplored={directed.length && !visited ? "true" : undefined}
        aria-pressed={chosen} aria-label={`下一个想法从「${region.label}」展开`}
        onClick={() => onFocus(chosen ? { "johari-self": 0, "johari-others": 0 } : { "johari-self": region.self, "johari-others": region.others })}>
        <span>{region.label}</span>
      </button><span className={styles.stageFieldRegionGlow} data-self={region.self}
        data-others={region.others} aria-hidden="true" /></Fragment>;
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
