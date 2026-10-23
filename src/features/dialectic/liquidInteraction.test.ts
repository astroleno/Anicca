import { LIQUID_HOLD_MS, liquidHoldRemaining, liquidProximity } from "./liquidInteraction";

it("counts input delivery time towards pickup without adding a second full hold", () => {
  expect(liquidHoldRemaining(1000, 1000)).toBe(LIQUID_HOLD_MS);
  expect(liquidHoldRemaining(880, 1000)).toBe(230);
  expect(liquidHoldRemaining(600, 1000)).toBe(0);
});

it("keeps the original hold for unavailable or incompatible event clocks", () => {
  for (const stamp of [0, -1, NaN, Infinity, 1001, 1720000000000]) expect(liquidHoldRemaining(stamp, 1000)).toBe(LIQUID_HOLD_MS);
  expect(liquidHoldRemaining(10, NaN)).toBe(LIQUID_HOLD_MS);
});

it("keeps the same physical contact across viewport scales", () => {
  expect(liquidProximity(112,50,50).contact).toBe(true);
  expect(liquidProximity(56,25,25)).toEqual(liquidProximity(112,50,50));
  expect(liquidProximity(130,50,50).contact).toBe(false);
});

it("retains a contacted pair across small edge movements and releases outside its band", () => {
  expect(liquidProximity(120,50,50).contact).toBe(false);
  expect(liquidProximity(120,50,50,true).contact).toBe(true);
  expect(liquidProximity(126,50,50,true).contact).toBe(false);
});

it("provides continuous approach feedback without contacting distant or invalid surfaces", () => {
  expect(liquidProximity(140,50,50).strength).toBeGreaterThan(0);
  expect(liquidProximity(140,50,50).strength).toBeLessThan(1);
  expect(liquidProximity(160,50,50).strength).toBe(0);
  expect(liquidProximity(0,0,50).contact).toBe(false);
});
