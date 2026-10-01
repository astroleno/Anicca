import {
  DialecticApiError,
  generateBranches,
  isAbortError
} from "./api";

describe("dialectic api", () => {
  it("sends typed branch requests with cancellation", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      requestId: "req_1",
      thesis: { text: "正", summary: "正摘要", label: "推进", stance: "正" },
      antithesis: { text: "反", summary: "反摘要", label: "暂停", stance: "反" }
    })));

    const response = await generateBranches({
      requestId: "req_1",
      userText: "是否继续",
      contextMessages: []
    }, { signal: controller.signal, fetchImpl });

    expect(response.requestId).toBe("req_1");
    expect(fetchImpl).toHaveBeenCalledWith("/api/branches", expect.objectContaining({
      method: "POST",
      signal: controller.signal
    }));
  });

  it("normalizes route failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: "branches_failed", details: "provider_unreachable" }),
      { status: 502 }
    ));

    const expectedError = {
      name: "DialecticApiError",
      status: 502,
      code: "branches_failed",
      details: "provider_unreachable"
    } satisfies Partial<DialecticApiError>;

    await expect(generateBranches({
      requestId: "req_1",
      userText: "是否继续",
      contextMessages: []
    }, { fetchImpl })).rejects.toEqual(expect.objectContaining(expectedError));
  });

  it("recognizes cancellation without conflating it with API failure", () => {
    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("branches_failed"))).toBe(false);
  });
});
