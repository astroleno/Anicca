import { layoutSeedLabels, separateSeedLabels, seedLabelLeader, type SeedLabelBox } from "./labelLayout";

const label = (id: string, x: number, y: number): SeedLabelBox => ({ id, x, y, width: 116, height: 64 });

it.each([false, true])("keeps compact captions attached to actual source instance IDs (single: %s)", single => {
  const surfaces = [
    { id: "copy-left", x: 80, y: 134, radius: 30 },
    { id: "right", x: 235, y: 131, radius: 31 },
    { id: "result", x: 160, y: 214, radius: 45 },
    { id: "shared-ancestor", x: 160, y: 72, radius: 21, hitRadius: 22 },
    { id: "left-original", x: 41, y: 75, radius: 20, hitRadius: 22 },
    { id: "near-left", x: 66, y: 190, radius: 22 },
    { id: "near-right", x: 254, y: 196, radius: 22 },
    { id: "distant", x: 284, y: 76, radius: 20, hitRadius: 22 },
  ];
  const labels = [
    { id: "result", x: 160, y: 271, width: 105, height: 24 },
    { id: "copy-left", x: 80, y: 190, width: 84, height: 44, followSource: true },
    ...(!single ? [{ id: "right", x: 235, y: 182, width: 80, height: 24, followSource: true }] : []),
  ];
  const offsets = layoutSeedLabels(labels, 320, 350, surfaces, { top: 30, bottom: 33 });
  const distance = (box: SeedLabelBox, surface: typeof surfaces[number]) => Math.hypot(
    Math.max(0, Math.abs(box.x - surface.x) - box.width / 2),
    Math.max(0, Math.abs(box.y - surface.y) - box.height / 2)
  ) - surface.radius;
  for (const caption of labels.filter(item => item.followSource)) {
    const placed = { ...caption, width: offsets[caption.id].width || caption.width,
      x: caption.x + offsets[caption.id].x, y: caption.y + offsets[caption.id].y };
    const own = surfaces.find(surface => surface.id === caption.id)!;
    const other = surfaces.find(surface => surface.id === (caption.id === "copy-left" ? "right" : "copy-left"))!;
    expect(distance(placed, own)).toBeLessThanOrEqual(23);
    if (!single) expect(distance(placed, own) + 3).toBeLessThan(distance(placed, other));
    expect(surfaces.every(surface => distance(placed, surface) >= 3.99)).toBe(true);
    expect(placed.y - placed.height / 2).toBeGreaterThanOrEqual(38);
    expect(placed.y + placed.height / 2).toBeLessThanOrEqual(309);
  }
  expect(layoutSeedLabels([...labels].reverse(), 320, 350, surfaces, { top: 30, bottom: 33 })).toEqual(offsets);
});
it("connects displaced captions to their own surface and leaves clear nearby captions undecorated", () => {
  const surfaces = [{ id: "a", x: 80, y: 80, radius: 30 }, { id: "b", x: 230, y: 80, radius: 30 }];
  const caption = { id: "a", x: 80, y: 130, width: 60, height: 20 };
  expect(seedLabelLeader(caption, { x: 0, y: 0 }, surfaces)).toBeNull();
  const leader = seedLabelLeader(caption, { x: 150, y: 20 }, surfaces)!;
  expect(leader.length).toBeGreaterThan(50);
  expect(leader.x).toBeGreaterThan(0); expect(leader.y).toBeGreaterThan(0);
  expect(seedLabelLeader({ ...caption, id: "missing" }, { x: 100, y: 0 }, surfaces)).toBeNull();
});

it("keeps narrow-screen captions out of the polarity context and fusion status", () => {
  const boxes = [label("root", 145, 42), label("pole", 250, 96), label("pair", 160, 280)]
    .map(box => ({ ...box, width: 100, height: 32 }));
  const original = structuredClone(boxes);
  const offsets = layoutSeedLabels(boxes, 320, 320, [], { top: 88, bottom: 48 });
  const placed = boxes.map(box => ({ ...box, x: box.x + (offsets[box.id]?.x || 0), y: box.y + (offsets[box.id]?.y || 0) }));
  for (const [index, a] of placed.entries()) {
    expect(a.y - a.height / 2).toBeGreaterThanOrEqual(96);
    expect(a.y + a.height / 2).toBeLessThanOrEqual(264);
    for (const b of placed.slice(index + 1)) expect(
      Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 11 ||
      Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 11
    ).toBe(true);
  }
  expect(boxes).toEqual(original);
});

it("keeps separated source labels at their original positions", () => {
  expect(separateSeedLabels([label("a", 80, 200), label("b", 260, 200)], 500)).toEqual({});
});

it.each([70, 250, 470])("keeps coincident sources readable and inside the stage at y=%s", y => {
  const a = label("a", 190, y), b = label("b", 205, y);
  const offsets = separateSeedLabels([a, b], 500);
  const [upper, lower] = [a, b].map(item => item.y + (offsets[item.id] || 0) - item.height / 2).sort((x, y) => x - y);
  expect(upper).toBeGreaterThanOrEqual(8);
  expect(upper + a.height + 8).toBeLessThanOrEqual(lower);
  expect(lower + b.height).toBeLessThanOrEqual(492);
});

it("separates a whole crowded cluster deterministically without moving the input boxes", () => {
  const boxes = [label("root", 170, 210), label("a", 175, 215), label("b", 180, 220), label("合", 178, 225)];
  const original = structuredClone(boxes);
  const offsets = separateSeedLabels(boxes, 500);
  expect(separateSeedLabels([...boxes].reverse(), 500)).toEqual(offsets);
  const centers = boxes.map(item => item.y + (offsets[item.id] || 0)).sort((a, b) => a - b);
  expect(centers[0] - 32).toBeGreaterThanOrEqual(8);
  expect(centers.at(-1)! + 32).toBeLessThanOrEqual(492);
  for (let i = 1; i < centers.length; i++) expect(centers[i] - centers[i - 1]).toBeGreaterThanOrEqual(74);
  expect(boxes).toEqual(original);
});

it("makes room for every label near the lower edge when the full stack fits", () => {
  const boxes = Array.from({ length: 4 }, (_, i) => ({ ...label(`seed-${i}`, 160, 240 + i), height: 60 }));
  const offsets = separateSeedLabels(boxes, 300);
  const centers = boxes.map(item => item.y + (offsets[item.id] || 0));
  expect(centers[0] - 30).toBeGreaterThanOrEqual(8);
  expect(centers[3] + 30).toBeLessThanOrEqual(292);
  for (let i = 1; i < centers.length; i++) expect(centers[i] - centers[i - 1]).toBeGreaterThanOrEqual(70);
});

it("separates eight labels in two dimensions when a dragged pair fills the upper column", () => {
  const boxes = [
    { ...label("root", 154, 120), width: 116 }, label("a", 215, 215), label("b", 230, 291),
    { ...label("合", 130, 357), width: 100 }, { ...label("other-root", 106, 286), width: 116 },
    label("other-a", 235, 48), label("other-b", 250, 58), { ...label("other-合", 58, 58), width: 100 }
  ].map(box => ({ ...box, width: box.width === 116 && !box.id.includes("root") ? 72 : box.width, height: 68 }));
  const original = structuredClone(boxes);
  const offsets = layoutSeedLabels(boxes, 320, 400);
  const placed = boxes.map(box => ({ ...box, x: box.x + (offsets[box.id]?.x || 0), y: box.y + (offsets[box.id]?.y || 0) }));
  for (const [index, a] of placed.entries()) {
    expect(a.x - a.width / 2).toBeGreaterThanOrEqual(8);
    expect(a.x + a.width / 2).toBeLessThanOrEqual(312);
    expect(a.y - a.height / 2).toBeGreaterThanOrEqual(8);
    expect(a.y + a.height / 2).toBeLessThanOrEqual(392);
    for (const b of placed.slice(index + 1)) expect(
      Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 11 ||
      Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 11
    ).toBe(true);
  }
  expect(placed.some(box => box.x !== original.find(item => item.id === box.id)!.x)).toBe(true);
  expect(boxes).toEqual(original);
});

it("moves text off a dark neighboring surface without moving the liquid origins", () => {
  const boxes = [
    { id: "root", x: 140, y: 180, width: 132, height: 28 },
    { id: "branch", x: 230, y: 235, width: 80, height: 28 }
  ];
  const surfaces = [{ x: 140, y: 180, radius: 50 }, { x: 230, y: 170, radius: 50 }];
  const original = structuredClone(surfaces);
  const offsets = layoutSeedLabels(boxes, 320, 360, surfaces);
  const placed = boxes.map(box => ({ ...box, x: box.x + (offsets[box.id]?.x || 0), y: box.y + (offsets[box.id]?.y || 0) }));
  for (const a of placed) {
    for (const surface of surfaces) {
      const dx = Math.max(0, Math.abs(a.x - surface.x) - a.width / 2);
      const dy = Math.max(0, Math.abs(a.y - surface.y) - a.height / 2);
      expect(dx * dx + dy * dy).toBeGreaterThanOrEqual((surface.radius + 4) ** 2 - .01);
    }
  }
  expect(Math.abs(placed[0].x - placed[1].x) >= (placed[0].width + placed[1].width) / 2 + 11 ||
    Math.abs(placed[0].y - placed[1].y) >= 39).toBe(true);
  expect(surfaces).toEqual(original);
});

it("reserves clear ground for long captions before packing short labels in a narrow eight-seed scene", () => {
  const seeds = [
    { id: "root", x: 154, y: 118, width: 132 }, { id: "a", x: 220, y: 282, width: 94 },
    { id: "b", x: 235, y: 282, width: 94 }, { id: "s", x: 130, y: 334, width: 114 },
    { id: "root2", x: 106, y: 251, width: 132 }, { id: "a2", x: 235, y: 66, width: 94 },
    { id: "b2", x: 250, y: 66, width: 94 }, { id: "s2", x: 58, y: 66, width: 114 }
  ];
  const boxes = seeds.map(seed => ({ ...seed, y: seed.y + 66, height: 28 }));
  const surfaces = seeds.map(seed => ({ x: seed.x, y: seed.y, radius: 42 }));
  const offsets = layoutSeedLabels(boxes, 320, 420, surfaces);
  const placed = boxes.map(box => ({ ...box, x: box.x + (offsets[box.id]?.x || 0), y: box.y + (offsets[box.id]?.y || 0) }));
  for (const [index, a] of placed.entries()) {
    for (const surface of surfaces) {
      const dx = Math.max(0, Math.abs(a.x - surface.x) - a.width / 2);
      const dy = Math.max(0, Math.abs(a.y - surface.y) - a.height / 2);
      expect(dx * dx + dy * dy, a.id).toBeGreaterThanOrEqual((surface.radius + 4) ** 2 - .02);
    }
    for (const b of placed.slice(index + 1)) expect(
      Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 11 ||
      Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 11
    ).toBe(true);
  }
});
