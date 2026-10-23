import type OpenAI from "openai";
import { createGenerationTrace } from "./generationTrace";

function clientWith(response: ReturnType<typeof vi.fn>, chat = vi.fn()) {
  return { responses: { create: response }, chat: { completions: { create: chat } } } as unknown as OpenAI;
}

afterEach(() => vi.restoreAllMocks());

it("records stage durations, repairs and usage without retaining content", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const create = vi.fn().mockResolvedValue({ output_text: "PRIVATE output", usage: {
    input_tokens: 123, output_tokens: 45, input_tokens_details: { cached_tokens: 0 }
  } });
  const abort = new AbortController();
  const trace = createGenerationTrace("synthesis", "gpt-test", abort.signal);
  const options = { client: clientWith(create), input: "PRIVATE prompt", maxOutputTokens: 50 };
  await trace.generate("critic", options);
  trace.check("critic", false);
  await trace.generate("critic", options, true);
  trace.check("critic", true, true);
  trace.finish("success");
  trace.finish("failed");
  expect(log).toHaveBeenCalledOnce();
  const message = log.mock.calls[0][0] as string;
  const record = JSON.parse(message.slice("anicca.generation ".length));
  expect(record).toMatchObject({ endpoint: "synthesis", outcome: "success", modelCalls: 2, providerCalls: 2, repairCalls: 1, firstPassValid: false });
  expect(record.calls[1]).toMatchObject({ stage: "critic", repair: true, usage: { inputTokens: 123, outputTokens: 45, cachedInputTokens: 0 } });
  expect(record.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(message).not.toContain("PRIVATE");
  expect(create.mock.calls[0][1]).toEqual({ signal: abort.signal });
});

it("counts transport fallback and preserves unknown usage", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const trace = createGenerationTrace("branches", "gpt-test", new AbortController().signal);
  await trace.generate("branches", { input: "secret", maxOutputTokens: 10,
    client: clientWith(vi.fn().mockRejectedValue(new Error("unsupported")), vi.fn().mockResolvedValue({ choices: [{ message: { content: "ok" } }] })) });
  trace.check("branches", true);
  trace.finish("success");
  const record = JSON.parse(String(log.mock.calls[0][0]).slice("anicca.generation ".length));
  expect(record).toMatchObject({ modelCalls: 1, providerCalls: 2, firstPassValid: true });
  expect(record.calls[0]).not.toHaveProperty("usage");
});

it("discards late provider output after cancellation and never starts another stage", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const abort = new AbortController();
  const create = vi.fn().mockImplementation(async () => { abort.abort(); return { output_text: "late" }; });
  const trace = createGenerationTrace("synthesis", "gpt-test", abort.signal);
  const options = { client: clientWith(create), input: "private", maxOutputTokens: 10 };
  await expect(trace.generate("draft", options)).rejects.toMatchObject({ name: "AbortError" });
  await expect(trace.generate("critic", options)).rejects.toMatchObject({ name: "AbortError" });
  trace.finish("failed");
  const record = JSON.parse(String(log.mock.calls[0][0]).slice("anicca.generation ".length));
  expect(record).toMatchObject({ outcome: "cancelled", modelCalls: 1, firstPassValid: null });
  expect(create).toHaveBeenCalledOnce();
});

it("does not leak provider errors or turn a logging failure into a generation failure", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger unavailable"); });
  const trace = createGenerationTrace("branches", "gpt-test", new AbortController().signal);
  await expect(trace.generate("branches", { client: clientWith(vi.fn().mockRejectedValue(new Error("PRIVATE token"))), input: "PRIVATE input", maxOutputTokens: 10 })).rejects.toThrow("PRIVATE token");
  expect(() => trace.finish("failed")).not.toThrow();
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
});
