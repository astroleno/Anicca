export type EvolutionLabelBox = { x: number; y: number; width: number; height: number };
type Mark = { id: string; x: number; y: number; radius: number; width: number; height: number };
const overlaps = (a: EvolutionLabelBox, b: EvolutionLabelBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Captions stay outside soft bodies. Priority order is supplied by the caller;
 * an unreadable far-view caption is omitted rather than painted into another. */
export function layoutEvolutionLabels(marks: Mark[], width: number, height: number) {
  const placed = new Map<string, EvolutionLabelBox>();
  const bodies = marks.map(mark => ({ id: mark.id, x: mark.x - mark.radius * 1.15 - 3, y: mark.y - mark.radius - 3,
    width: mark.radius * 2.3 + 6, height: mark.radius * 2 + 6 }));
  const controls = { x: width - 85, y: 48, width: 85, height: 125 };
  for (const mark of marks) {
    const { x, y, radius, width: w, height: h } = mark;
    const candidates = [
      { x: x - w / 2, y: y + radius + 9, width: w, height: h },
      { x: x - w / 2, y: y - radius - 9 - h, width: w, height: h },
      { x: x - radius * 1.15 - 12 - w, y: y - h / 2, width: w, height: h },
      { x: x + radius * 1.15 + 12, y: y - h / 2, width: w, height: h }
    ];
    const box = candidates.find(candidate => candidate.x >= 4 && candidate.x + w <= width - 4 && candidate.y >= 44 && candidate.y + h <= height - 31 &&
      !overlaps(candidate, controls) && !bodies.some(body => body.id !== mark.id && overlaps(candidate, body)) &&
      ![...placed.values()].some(other => overlaps(candidate, other)));
    if (box) placed.set(mark.id, box);
  }
  return placed;
}
