import { assertArtworkSupportsOperator, getArtworkAgentProfiles } from "./artworkAgents";

describe("artwork agent profiles", () => {
  it("returns validated local profiles with declared capabilities", () => {
    const profiles = getArtworkAgentProfiles();

    expect(profiles.length).toBeGreaterThanOrEqual(3);
    expect(profiles.every((profile) => profile.artworkId && profile.capabilities.length)).toBe(true);
  });

  it("rejects routing operators that an artwork does not support", () => {
    const profile = getArtworkAgentProfiles().find((item) => !item.capabilities.includes("counter_aha"))!;

    expect(() => assertArtworkSupportsOperator(profile, "counter_aha")).toThrow(
      `artwork_operator_not_supported:${profile.artworkId}:counter_aha`
    );
  });
});
