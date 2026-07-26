import { getArtworkAgentProfiles } from "./artworkAgents";
import { routeArtworkAgents } from "./router";
import { buildUserAgentEvent } from "./userEvent";

describe("growth router", () => {
  it("ranks artwork agents deterministically by event/profile overlap", () => {
    const event = buildUserAgentEvent("下一步风险和方向都不确定，像夜里找灯");
    const routes = routeArtworkAgents(event, getArtworkAgentProfiles(), 3);

    expect(routes).toHaveLength(3);
    expect(routes[0].profile.artworkId).toBe("artwork_night_crossing");
    expect(routes[0].score).toBeGreaterThanOrEqual(routes[1].score);
  });

  it("selects counter_aha for overconfident framing when supported", () => {
    const event = buildUserAgentEvent("这个方案一定是唯一答案，必须马上定下来");
    const routes = routeArtworkAgents(event, getArtworkAgentProfiles(), 3);

    expect(routes.some((route) => route.operator === "counter_aha")).toBe(true);
    expect(routes.every((route) => route.profile.capabilities.includes(route.operator))).toBe(true);
  });
});
