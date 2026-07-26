import { describeProviderFailure } from "@/lib/openai/providerErrors";

const originalApiKey = process.env.OPENAI_API_KEY;

function configureApiKey() {
  process.env.OPENAI_API_KEY = "test-key";
}

function restoreApiKey() {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
    return;
  }

  process.env.OPENAI_API_KEY = originalApiKey;
}

describe("describeProviderFailure", () => {
  afterEach(() => {
    restoreApiKey();
  });

  it("reports a missing API key before inspecting a provider error", () => {
    delete process.env.OPENAI_API_KEY;

    expect(describeProviderFailure(new Error("rate limit exceeded"))).toEqual({
      details: "openai_api_key_missing",
      status: 500
    });
  });

  it("classifies authentication failures", () => {
    configureApiKey();

    expect(describeProviderFailure({ status: 401, message: "unauthorized" })).toEqual({
      details: "provider_auth_failed",
      status: 500
    });
  });

  it("classifies rate limits", () => {
    configureApiKey();

    expect(describeProviderFailure({ response: { status: "429" }, message: "rate limit exceeded" })).toEqual({
      details: "provider_rate_limited",
      status: 429
    });
  });

  it("classifies overloaded providers ahead of ambiguous status codes", () => {
    configureApiKey();

    expect(describeProviderFailure(new Error("upstream service overloaded, please retry"))).toEqual({
      details: "provider_overloaded",
      status: 503
    });
  });

  it("classifies network and timeout failures as unreachable", () => {
    configureApiKey();

    expect(describeProviderFailure(new Error("fetch failed: ECONNREFUSED"))).toEqual({
      details: "provider_unreachable",
      status: 503
    });
    expect(describeProviderFailure(new Error("request timeout"))).toEqual({
      details: "provider_unreachable",
      status: 503
    });
  });

  it("uses a stable runtime fallback for unknown failures", () => {
    configureApiKey();

    expect(describeProviderFailure(new Error("unexpected provider response shape"))).toEqual({
      details: "provider_runtime_error",
      status: 500
    });
  });
});
