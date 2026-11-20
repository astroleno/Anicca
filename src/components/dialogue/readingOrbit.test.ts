import type { DialogueStageNode } from "@/features/dialectic/viewModel";
import { defaultThinkingSpace, johariThinkingSpace } from "@/features/perspectives/model";
import { arrangeReadingOrbit, readingInvitations, readingOrbitLayoutForSize } from "./readingOrbit";

const seed = (id: string, relation: DialogueStageNode["relation"], branchType?: DialogueStageNode["branchType"]): DialogueStageNode =>
  ({ id, label: id, kind: "assistant", relation, branchType, seedX: 50, seedY: 50 });

it("has no orbit without a seed to read", () => {
  expect(arrangeReadingOrbit([seed("a", "child")], null, "sides")).toBeNull();
});

it("makes the read seed the main drop and keeps 正 left of 反 beside the text", () => {
  const { places } = arrangeReadingOrbit([seed("反", "child", "反"), seed("root", "focus"), seed("正", "child", "正")], "root", "sides")!;
  expect(places.root.role).toBe("main");
  expect(places["正"]).toMatchObject({ role: "satellite", x: 18 });
  expect(places["反"]).toMatchObject({ role: "satellite", x: 82 });
});

it("puts where a thought came from above where it went", () => {
  const { places } = arrangeReadingOrbit([seed("next", "child"), seed("synthesis", "focus", "合"), seed("from", "source"), seed("also", "source")], "synthesis", "sides")!;
  expect(places.from.y).toBeLessThan(places.next.y!);
  expect(places.also.y).toBeLessThan(places.next.y!);
});

it("gives the reader up to four related seeds on a narrow stage and rests their stage surfaces", () => {
  const nodes = [seed("focus", "focus"), seed("反", "child", "反"), seed("正", "child", "正"),
    seed("a", "child"), seed("b", "child"), seed("from", "source")];
  const { places, row } = arrangeReadingOrbit(nodes, "focus", "row")!;
  expect(row.map(node => node.id)).toEqual(["正", "from", "a", "反"]);
  expect(Object.values(places).filter(place => place.role === "satellite")).toEqual([]);
  expect(places["正"]).toEqual({ role: "rest" });
  expect(places.b).toEqual({ role: "rest" });
});

it("only uses side satellites when the text column leaves enough room on both sides", () => {
  expect([320, 390, 768, 1024].map(width => readingOrbitLayoutForSize(width, 900))).toEqual(["row", "row", "row", "row"]);
  expect(readingOrbitLayoutForSize(1440, 560)).toBe("row");
  expect(readingOrbitLayoutForSize(1280, 720)).toBe("sides");
});

it("never stacks more than three satellites on a side", () => {
  const nodes = [seed("focus", "focus"), ...Array.from({ length: 5 }, (_, index) => seed(`正${index}`, "child", "正"))];
  const { places } = arrangeReadingOrbit(nodes, "focus", "sides")!;
  const left = Object.values(places).filter(place => place.x === 18);
  expect(left).toHaveLength(3);
  expect(Object.values(places).filter(place => place.x === 82)).toHaveLength(2);
});

it("balances the gutters once opposites have taken their sides", () => {
  const { places } = arrangeReadingOrbit([seed("root", "ancestor"), seed("反", "focus", "反"), seed("正", "child", "正")], "反", "sides")!;
  expect(places["正"].x).toBe(18);
  expect(places.root.x).toBe(82);
});

describe("in a chosen thinking space", () => {
  const directed = (id: string, x: number, y: number, relation: DialogueStageNode["relation"] = "child"): DialogueStageNode =>
    ({ ...seed(id, relation), spatialCoordinates: { x, y } });

  it("places satellites where their own direction points instead of by 正 and 反", () => {
    const { places } = arrangeReadingOrbit([directed("focus", 0, 0, "focus"), { ...directed("blind", -.8, .7), branchType: "反" },
      { ...directed("hidden", .9, -.8), branchType: "正" }], "focus", "sides", johariThinkingSpace())!;
    expect(places.blind).toMatchObject({ x: 18, y: 28 });
    expect(places.hidden).toMatchObject({ x: 82, y: 72 });
  });

  it("keeps 正 left and 反 right while only the built-in directions exist", () => {
    const { places } = arrangeReadingOrbit([directed("focus", 0, 0, "focus"), { ...directed("反", -.9, .9), branchType: "反" }],
      "focus", "sides", defaultThinkingSpace())!;
    expect(places["反"].x).toBe(82);
  });

  it("offers the Johari regions no thought has reached, in the corners they point to", () => {
    const invitations = readingInvitations(johariThinkingSpace(), [directed("open", .8, .7), directed("blind", -.6, .6)], "sides");
    expect(invitations.map(item => item.label)).toEqual(["未知区", "隐藏区"]);
    expect(invitations[0]).toMatchObject({ self: -1, others: -1, x: 20, y: 84 });
  });

  it("offers nothing before any thought is placed by direction, or on a narrow stage", () => {
    expect(readingInvitations(johariThinkingSpace(), [seed("plain", "focus")], "sides")).toEqual([]);
    expect(readingInvitations(johariThinkingSpace(), [directed("open", .8, .7)], "row")).toEqual([]);
  });
});
