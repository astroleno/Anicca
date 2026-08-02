import { buildUserAgentEvent } from "./userEvent";

describe("buildUserAgentEvent", () => {
  it("rejects empty input", () => {
    expect(() => buildUserAgentEvent("   ")).toThrow("growth_event_empty_input");
  });

  it("builds a reflective turn-scoped event from plain input", () => {
    const event = buildUserAgentEvent({
      text: "我想知道这个方向为什么卡住",
      requestId: "req_reflect"
    });

    expect(event).toMatchObject({
      id: "event_req_reflect",
      text: "我想知道这个方向为什么卡住",
      intent: "reflect"
    });
    expect(event.affect.mood).toContain("reflective");
    expect(event.memoryRefs).toEqual([]);
    expect(event.growthNeeds).toContain("resonate");
  });

  it("detects compare intent and reframing needs", () => {
    const event = buildUserAgentEvent("继续做还是暂停复盘？");

    expect(event.intent).toBe("compare");
    expect(event.tensions).toEqual(expect.arrayContaining(["choice_pressure", "ambiguity"]));
    expect(event.growthNeeds).toContain("reframe");
  });

  it("raises uncertainty without writing long-term memory", () => {
    const event = buildUserAgentEvent("也许这一步不确定，可能需要换个角度？");

    expect(event.affect.uncertainty).toBeGreaterThanOrEqual(0.6);
    expect(event.growthNeeds).toContain("expand");
    expect(event.memoryRefs).toEqual([]);
  });
});
