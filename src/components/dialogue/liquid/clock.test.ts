import { LiquidSceneClock } from "./clock";

it("resumes the exact painted phase after an overview or hidden interval", () => {
  const clock = new LiquidSceneClock();
  expect(clock.step(1000)).toBe(1000);
  expect(clock.step(1016)).toBe(1016);
  clock.pause();
  clock.pause();
  expect(clock.step(61016)).toBe(1016);
  expect(clock.step(61032)).toBe(1032);
});

it("keeps the normal idle cadence and ignores a backwards timestamp", () => {
  const clock = new LiquidSceneClock();
  expect(clock.step(0)).toBe(0);
  expect(clock.step(83)).toBe(83);
  expect(clock.step(82)).toBe(83);
  expect(clock.step(84)).toBe(84);
  clock.pause();
  expect(clock.step(9000)).toBe(84);
});
