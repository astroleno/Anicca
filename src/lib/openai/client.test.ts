import * as openAiClient from "@/lib/openai/client";

describe("dialectic provider configuration", () => {
  const previousDeepSeekModel = process.env.DEEPSEEK_MODEL;
  const previousDefaultModel = process.env.ANICCA_DEFAULT_MODEL;

  afterEach(() => {
    process.env.DEEPSEEK_MODEL = previousDeepSeekModel;
    process.env.ANICCA_DEFAULT_MODEL = previousDefaultModel;
  });

  it("prefers the DeepSeek model for dialectic generation", () => {
    process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
    process.env.ANICCA_DEFAULT_MODEL = "gpt-5.4-nano";
    const getDialecticModel = (openAiClient as typeof openAiClient & {
      getDialecticModel?: (model?: string) => string;
    }).getDialecticModel;

    expect(getDialecticModel).toBeTypeOf("function");
    expect(getDialecticModel?.()).toBe("deepseek-v4-flash");
    expect(getDialecticModel?.("explicit-model")).toBe("explicit-model");
  });
});
