import { layoutEvolutionLabels } from "./evolutionLabels";

it("separates aggregate captions from neighboring soft bodies in a dense far view", () => {
  const marks = [
    { id: "positive", x: 180, y: 145, radius: 28, width: 76, height: 14 },
    { id: "negative", x: 180, y: 190, radius: 28, width: 76, height: 14 },
    { id: "next", x: 360, y: 145, radius: 28, width: 76, height: 14 }
  ];
  const boxes = layoutEvolutionLabels(marks, 650, 360);
  expect(boxes.size).toBe(3);
  for (const [id, box] of boxes) {
    for (const mark of marks.filter(mark => mark.id !== id)) {
      const nearestX = Math.max(box.x, Math.min(mark.x, box.x + box.width));
      const nearestY = Math.max(box.y, Math.min(mark.y, box.y + box.height));
      expect(Math.hypot(nearestX - mark.x, nearestY - mark.y)).toBeGreaterThan(mark.radius);
    }
    expect(box.y).toBeGreaterThanOrEqual(44);
  }
});
