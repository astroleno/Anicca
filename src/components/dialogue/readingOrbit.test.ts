import type { DialogueStageNode } from "@/features/dialectic/viewModel";
import { arrangeReadingOrbit } from "./readingOrbit";

const seed = (id: string, relation: DialogueStageNode["relation"], branchType?: DialogueStageNode["branchType"]): DialogueStageNode =>
  ({ id, label: id, kind: "assistant", relation, branchType, seedX: 50, seedY: 50 });

it("has no orbit without a seed to read", () => {
  expect(arrangeReadingOrbit([seed("a", "child")], null, "sides")).toBeNull();
});

it("makes the read seed the main drop and keeps 正 left of 反 beside the text", () => {
  const places = arrangeReadingOrbit([seed("反", "child", "反"), seed("root", "focus"), seed("正", "child", "正")], "root", "sides")!;
  expect(places.root.role).toBe("main");
  expect(places["正"]).toMatchObject({ role: "satellite", x: 18 });
  expect(places["反"]).toMatchObject({ role: "satellite", x: 82 });
});

it("puts where a thought came from above where it went", () => {
  const places = arrangeReadingOrbit([seed("next", "child"), seed("synthesis", "focus", "合"), seed("from", "source"), seed("also", "source")], "synthesis", "sides")!;
  expect(places.from.y).toBeLessThan(places.next.y!);
  expect(places.also.y).toBeLessThan(places.next.y!);
});

it("gathers at most four satellites above the text on a narrow stage and lets the rest recede", () => {
  const nodes = [seed("focus", "focus"), ...["a", "b", "c", "d", "e"].map(id => seed(id, "child")), seed("反", "child", "反")];
  const places = arrangeReadingOrbit(nodes, "focus", "row")!;
  const satellites = Object.entries(places).filter(([, place]) => place.role === "satellite");
  expect(satellites).toHaveLength(4);
  expect(new Set(satellites.map(([, place]) => place.y))).toEqual(new Set([14]));
  expect(places.e.role).toBe("rest");
  expect(places.e.x).toBeUndefined();
});

it("never stacks more than three satellites on a side", () => {
  const nodes = [seed("focus", "focus"), ...Array.from({ length: 5 }, (_, index) => seed(`正${index}`, "child", "正"))];
  const places = arrangeReadingOrbit(nodes, "focus", "sides")!;
  const left = Object.values(places).filter(place => place.x === 18);
  expect(left).toHaveLength(3);
  expect(Object.values(places).filter(place => place.x === 82)).toHaveLength(2);
});

it("balances the gutters once opposites have taken their sides", () => {
  const places = arrangeReadingOrbit([seed("root", "ancestor"), seed("反", "focus", "反"), seed("正", "child", "正")], "反", "sides")!;
  expect(places["正"].x).toBe(18);
  expect(places.root.x).toBe(82);
});
