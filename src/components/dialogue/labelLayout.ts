export type SeedLabelBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Stable text-only packing. Liquid surfaces, hit targets and saved coordinates stay put. */
export function separateSeedLabels(
  labels: readonly SeedLabelBox[], viewportHeight: number
): Record<string, number> {
  const offsets: Record<string, number> = {};
  const pending = labels.filter(label => label.height <= viewportHeight - 16).map(label => ({ ...label }));
  const adjacent = (a: SeedLabelBox, b: SeedLabelBox) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 16;
  while (pending.length) {
    const group = [pending.pop()!];
    // Independent horizontal groups do not displace each other's text.
    for (let i = 0; i < group.length; i++) {
      for (let j = pending.length - 1; j >= 0; j--) {
        if (adjacent(group[i], pending[j])) group.push(...pending.splice(j, 1));
      }
    }
    group.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
    const gap = Math.max(8, Math.min(20,
      (viewportHeight - 16 - group.reduce((total, label) => total + label.height, 0)) / Math.max(1, group.length - 1)));
    const placed = group.map(label => ({ ...label }));
    for (let i = 0; i < placed.length; i++) {
      for (let j = 0; j < i; j++) {
        if (adjacent(placed[i], placed[j])) placed[i].y = Math.max(placed[i].y,
          placed[j].y + (placed[i].height + placed[j].height) / 2 + gap);
      }
    }
    for (let i = placed.length - 1; i >= 0; i--) {
      placed[i].y = Math.min(placed[i].y, viewportHeight - 8 - placed[i].height / 2);
      for (let j = i + 1; j < placed.length; j++) {
        if (adjacent(placed[i], placed[j])) placed[i].y = Math.min(placed[i].y,
          placed[j].y - (placed[i].height + placed[j].height) / 2 - gap);
      }
    }
    const minShift = Math.max(...placed.map(label => 8 + label.height / 2 - label.y));
    const maxShift = Math.min(...placed.map(label => viewportHeight - 8 - label.height / 2 - label.y));
    const desiredShift = placed.reduce((total, label, i) => total + group[i].y - label.y, 0) / placed.length;
    const shift = minShift <= maxShift ? Math.max(minShift, Math.min(maxShift, desiredShift)) : 0;
    for (let i = 0; i < placed.length; i++) {
      const label = placed[i];
      const y = Math.max(8 + label.height / 2, Math.min(viewportHeight - 8 - label.height / 2, label.y + shift));
      if (Math.abs(y - group[i].y) > .5) offsets[label.id] = y - group[i].y;
    }
  }
  return offsets;
}

export type SeedLabelOffset = { x: number; y: number };
export type SeedLabelSurface = { id?: string; x: number; y: number; radius: number };

/** Connect a displaced or ambiguous caption using the exact frame used for its ink. */
export function seedLabelLeader(label: SeedLabelBox, offset: SeedLabelOffset, surfaces: readonly SeedLabelSurface[]) {
  const source = surfaces.find(surface => surface.id === label.id);
  if (!source) return null;
  const x = label.x + offset.x, y = label.y + offset.y;
  const distance = Math.hypot(x - source.x, y - source.y);
  const ambiguous = surfaces.some(other => other.id !== source.id &&
    Math.hypot(x - other.x, y - other.y) - other.radius + 12 < distance - source.radius);
  if (Math.hypot(offset.x, offset.y) < 24 && !ambiguous) return null;
  if (!distance) return null;
  const ux = (x - source.x) / distance, uy = (y - source.y) / distance;
  const textEdge = Math.min(Math.abs(ux) > .001 ? label.width / 2 / Math.abs(ux) : Infinity,
    Math.abs(uy) > .001 ? label.height / 2 / Math.abs(uy) : Infinity);
  const start = source.radius + 4, length = distance - textEdge - start - 4;
  return length > 6 ? { x: ux * start, y: uy * start, length, angle: Math.atan2(uy, ux) * 180 / Math.PI } : null;
}

/** A crowded column may not fit vertically. Move only the conflicting text
 * into the nearest free space, keeping every liquid surface at its own origin. */
export function layoutSeedLabels(
  labels: readonly SeedLabelBox[], viewportWidth: number, viewportHeight: number,
  surfaces: readonly SeedLabelSurface[] = [], insets?: { top: number; bottom: number }
): Record<string, SeedLabelOffset> {
  const top = Math.max(0, Math.min(insets?.top || 0, viewportHeight - 32));
  const bottom = Math.max(0, Math.min(insets?.bottom || 0, viewportHeight - top - 32));
  if (top || bottom) return layoutSeedLabels(
    labels.map(label => ({ ...label, y: label.y - top })), viewportWidth, viewportHeight - top - bottom,
    surfaces.map(surface => ({ ...surface, y: surface.y - top }))
  );
  const vertical = separateSeedLabels(labels, viewportHeight);
  const margin = 8, gap = 12;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const placed = [...labels].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)).map(label => ({
    ...label,
    x: clamp(label.x, margin + label.width / 2, viewportWidth - margin - label.width / 2),
    y: clamp(label.y + (vertical[label.id] || 0), margin + label.height / 2, viewportHeight - margin - label.height / 2)
  }));
  const overlaps = (a: SeedLabelBox, b: SeedLabelBox) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap - .1 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap - .1;
  const originals = new Map(labels.map(label => [label.id, label]));
  for (let pass = 0; pass < placed.length * 2; pass++) {
    let pair: readonly [SeedLabelBox, SeedLabelBox] | undefined;
    findPair: for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (overlaps(placed[i], placed[j])) { pair = [placed[i], placed[j]]; break findPair; }
      }
    }
    if (!pair) break;
    let best: { label: SeedLabelBox; x: number; y: number; score: number } | null = null;
    for (const label of pair) {
      const origin = originals.get(label.id)!;
      const xs = [label.x, origin.x, margin + label.width / 2, viewportWidth - margin - label.width / 2];
      const ys = [label.y, origin.y, margin + label.height / 2, viewportHeight - margin - label.height / 2];
      for (const other of placed) {
        if (other.id === label.id) continue;
        xs.push(other.x - (other.width + label.width) / 2 - gap, other.x + (other.width + label.width) / 2 + gap);
        ys.push(other.y - (other.height + label.height) / 2 - gap, other.y + (other.height + label.height) / 2 + gap);
      }
      for (const x of xs) for (const y of ys) {
        if (x < margin + label.width / 2 || x > viewportWidth - margin - label.width / 2 ||
            y < margin + label.height / 2 || y > viewportHeight - margin - label.height / 2) continue;
        const candidate = { ...label, x, y };
        if (placed.some(other => other.id !== label.id && overlaps(candidate, other))) continue;
        const score = (x - origin.x) ** 2 + (y - origin.y) ** 2;
        if (!best || score < best.score) best = { label, x, y, score };
      }
    }
    if (!best) break;
    best.label.x = best.x;
    best.label.y = best.y;
  }
  // A single ink color cannot remain readable across both a dark body and the
  // light ground. Prefer nearby empty space before relying on adaptive ink.
  const crossesSurface = (label: SeedLabelBox, surface: SeedLabelSurface) => {
    const dx = Math.max(0, Math.abs(label.x - surface.x) - label.width / 2);
    const dy = Math.max(0, Math.abs(label.y - surface.y) - label.height / 2);
    return dx * dx + dy * dy < (surface.radius + 4) ** 2 - .01;
  };
  const occupied: SeedLabelBox[] = [];
  type Option = { x: number; y: number; score: number };
  const freeOptions = new Map<string, () => Option[]>();
  const surfaceWeight = viewportWidth * viewportHeight * 4;
  for (const label of surfaces.length ? [...placed].sort((a, b) => b.width - a.width || a.y - b.y || a.id.localeCompare(b.id)) : []) {
    const origin = originals.get(label.id)!;
    const source = surfaces.find(surface => surface.id === label.id);
    const others = surfaces.filter(surface => surface.id !== source?.id);
    const distanceScore = (x: number, y: number) => {
      const distance = (x - origin.x) ** 2 + (y - origin.y) ** 2;
      if (!source) return distance;
      const own = Math.hypot(x - source.x, y - source.y) - source.radius;
      let other = Infinity;
      for (const surface of others) other = Math.min(other, Math.hypot(x - surface.x, y - surface.y) - surface.radius);
      return distance + Math.max(0, own - other) ** 2 * 4;
    };
    const xs = [label.x, origin.x, margin + label.width / 2, viewportWidth - margin - label.width / 2];
    const ys = [label.y, origin.y, margin + label.height / 2, viewportHeight - margin - label.height / 2];
    for (const other of placed) {
      if (other.id === label.id) continue;
      xs.push(other.x - (other.width + label.width) / 2 - gap, other.x + (other.width + label.width) / 2 + gap);
      ys.push(other.y - (other.height + label.height) / 2 - gap, other.y + (other.height + label.height) / 2 + gap);
    }
    for (const surface of surfaces) {
      xs.push(surface.x - surface.radius - 4 - label.width / 2, surface.x + surface.radius + 4 + label.width / 2);
      ys.push(surface.y - surface.radius - 4 - label.height / 2, surface.y + surface.radius + 4 + label.height / 2);
    }
    const candidatesX = [...new Set(xs)].filter(x => x >= margin + label.width / 2 && x <= viewportWidth - margin - label.width / 2);
    const candidatesY = [...new Set(ys)].filter(y => y >= margin + label.height / 2 && y <= viewportHeight - margin - label.height / 2);
    const candidate = { ...label };
    // Alternative positions are needed only if the final edge-repair pass
    // must move this caption again. Keep this iteration's grid, without
    // allocating and sorting hundreds of unused positions every frame.
    let options: Option[] | null = null;
    freeOptions.set(label.id, () => {
      if (options) return options;
      const free: Option[] = [];
      for (const x of candidatesX) for (const y of candidatesY) {
        candidate.x = x; candidate.y = y;
        if (!surfaces.some(surface => crossesSurface(candidate, surface))) {
          free.push({ x, y, score: distanceScore(x, y) });
        }
      }
      options = free.sort((a, b) => a.score - b.score).slice(0, 128);
      return options;
    });
    // A clear original anchor has the lowest possible score. Preserve it
    // directly instead of searching the whole stage during a gesture.
    const atOrigin = { ...label, x: origin.x, y: origin.y };
    if (candidatesX.includes(origin.x) && candidatesY.includes(origin.y) &&
        !occupied.some(other => overlaps(atOrigin, other)) &&
        !surfaces.some(surface => crossesSurface(atOrigin, surface)) && distanceScore(origin.x, origin.y) === 0) {
      label.x = origin.x; label.y = origin.y; occupied.push(label); continue;
    }
    let best: Option | null = null;
    for (const x of candidatesX) for (const y of candidatesY) {
      const distance = distanceScore(x, y);
      if (best && distance >= best.score) continue;
      candidate.x = x; candidate.y = y;
      if (occupied.some(other => overlaps(candidate, other))) continue;
      let surfacePenalty = 0;
      for (const surface of surfaces) if (crossesSurface(candidate, surface)) surfacePenalty++;
      const score = surfacePenalty * surfaceWeight + distance;
      if (!best || score < best.score) best = { x, y, score };
    }
    if (best) { label.x = best.x; label.y = best.y; }
    occupied.push(label);
  }
  // A nearby caption can occupy the only clear patch for a later label. Allow
  // that one caption to move as well instead of leaving text across an edge.
  for (const label of placed) {
    if (!surfaces.some(surface => crossesSurface(label, surface))) continue;
    let best: { x: number; y: number; score: number; blocker?: SeedLabelBox; alternate?: SeedLabelOffset } | null = null;
    for (const option of freeOptions.get(label.id)?.() || []) {
      const candidate = { ...label, ...option };
      const blockers = placed.filter(other => other.id !== label.id && overlaps(candidate, other));
      if (!blockers.length) { if (!best || option.score < best.score) best = option; break; }
      if (blockers.length !== 1) continue;
      const blocker = blockers[0];
      const alternate = (freeOptions.get(blocker.id)?.() || []).find(position => {
        const moved = { ...blocker, ...position };
        return !overlaps(moved, candidate) && !placed.some(other =>
          other.id !== label.id && other.id !== blocker.id && overlaps(moved, other));
      });
      if (!alternate) continue;
      const score = option.score + alternate.score;
      if (!best || score < best.score) best = { ...option, score, blocker, alternate };
    }
    if (best) {
      label.x = best.x; label.y = best.y;
      if (best.blocker && best.alternate) { best.blocker.x = best.alternate.x; best.blocker.y = best.alternate.y; }
    }
  }
  return Object.fromEntries(placed.flatMap(label => {
    const origin = originals.get(label.id)!;
    const x = label.x - origin.x, y = label.y - origin.y;
    return Math.abs(x) > .5 || Math.abs(y) > .5 ? [[label.id, { x, y }]] : [];
  }));
}
