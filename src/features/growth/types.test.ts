import {
  parseArtworkAgentProfile,
  parseArtworkAgentResponse,
  parseGrowthOperator
} from "./types";

describe("growth contracts", () => {
  it("validates stable growth operators", () => {
    expect(parseGrowthOperator("counter_aha")).toBe("counter_aha");
    expect(() => parseGrowthOperator("counterAha")).toThrow("invalid_growth_operator");
  });

  it("rejects malformed artwork responses", () => {
    const valid = {
      artworkId: "artwork_test",
      operator: "expand",
      stance: "extends",
      text: "response text",
      summary: "summary",
      memoryHooks: [],
      tensionDelta: "adds_context",
      confidence: 0.7
    };

    expect(() => parseArtworkAgentResponse({ ...valid, artworkId: "" })).toThrow(
      "invalid_artwork_agent_response_artwork_id"
    );
    expect(() => parseArtworkAgentResponse({ ...valid, text: "" })).toThrow(
      "invalid_artwork_agent_response_text"
    );
    expect(() => parseArtworkAgentResponse({ ...valid, operator: "bad" })).toThrow(
      "invalid_growth_operator"
    );
    expect(() => parseArtworkAgentResponse({ ...valid, confidence: 1.2 })).toThrow(
      "invalid_artwork_agent_response_confidence"
    );
  });

  it("requires artwork profiles to declare supported capabilities", () => {
    expect(() =>
      parseArtworkAgentProfile({
        artworkId: "artwork_test",
        title: "Test Artwork",
        voice: "quiet",
        themes: [],
        sensoryHooks: [],
        memoryAffinities: [],
        capabilities: []
      })
    ).toThrow("invalid_artwork_agent_profile_capabilities");
  });
});
