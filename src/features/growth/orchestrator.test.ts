import { runGrowthSession } from "./orchestrator";

describe("runGrowthSession", () => {
  it("returns a complete local growth session with request id echo", () => {
    const session = runGrowthSession({
      text: "也许下一步要把这个方向拆小一点？",
      requestId: "req_growth"
    });

    expect(session.requestId).toBe("req_growth");
    expect(session.userEvent.id).toBe("event_req_growth");
    expect(session.candidates).toHaveLength(3);
    expect(session.responses).toHaveLength(3);
    expect(session.responses[0]).toMatchObject({
      artworkId: session.candidates[0].artworkId,
      operator: expect.any(String),
      text: expect.stringContaining(session.candidates[0].title),
      confidence: expect.any(Number)
    });
    expect(session.synthesis).toMatchObject({
      operator: "merge_promote",
      sourceArtworkIds: session.responses.map((response) => response.artworkId)
    });
  });

  it("does not collapse sessions without explicit request ids into one event id", () => {
    const first = runGrowthSession("完全不同的输入 A");
    const second = runGrowthSession("完全不同的输入 B");
    const objectInput = runGrowthSession({ text: "没有 requestId 的对象输入" });

    expect(first.userEvent.id).not.toBe(second.userEvent.id);
    expect(first.userEvent.id).not.toBe("event_growth_local");
    expect(second.userEvent.id).not.toBe("event_growth_local");
    expect(objectInput.userEvent.id).not.toBe("event_growth_local");
    expect(first.requestId).toBe(first.userEvent.id);
  });

  it("validates injected artwork agents at the orchestration boundary", () => {
    const profile = {
      artworkId: "artwork_custom",
      title: "自定义画作",
      voice: "specific",
      themes: ["custom"],
      sensoryHooks: ["ink"],
      memoryAffinities: ["custom memory"],
      capabilities: ["expand"]
    };

    expect(() =>
      runGrowthSession({
        text: "custom",
        artworkAgents: [{ ...profile, title: "" } as never]
      })
    ).toThrow("invalid_artwork_agent_profile_title");

    expect(() =>
      runGrowthSession({
        text: "custom",
        artworkAgents: [profile as never, { ...profile } as never]
      })
    ).toThrow("duplicate_artwork_agent_profile:artwork_custom");
  });

  it("keeps explicit memory labels out of response memory hooks", () => {
    const session = runGrowthSession({
      text: "把这条显式记忆放进当前回合",
      requestId: "req_memory_hooks",
      memoryRefs: [
        {
          id: "mem_explicit",
          label: "敏感上下文标签",
          source: "explicit",
          scope: "turn",
          confidence: 0.8
        }
      ]
    });

    expect(session.responses[0].memoryHooks).toContain("mem_explicit");
    expect(session.responses[0].memoryHooks).not.toContain("敏感上下文标签");
  });
});
