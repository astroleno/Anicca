import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { generateText, prefersChatCompletions } from "@/lib/openai/generateText";
import { readChatCompletionText } from "@/lib/openai/readChatCompletionText";

describe("readChatCompletionText", () => {
  it("reads plain string message content", () => {
    expect(
      readChatCompletionText({
        choices: [{ message: { content: "hello world" } }]
      })
    ).toBe("hello world");
  });

  it("joins text parts when content is structured", () => {
    expect(
      readChatCompletionText({
        choices: [{ message: { content: [{ text: "first" }, { text: { value: "second" } }] } }]
      })
    ).toBe("first\nsecond");
  });
});

describe("prefersChatCompletions", () => {
  const previous = process.env.ANICCA_CHAT_COMPLETIONS_MODELS;

  afterEach(() => {
    process.env.ANICCA_CHAT_COMPLETIONS_MODELS = previous;
  });

  it("defaults Gemini and DeepSeek models to chat completions", () => {
    delete process.env.ANICCA_CHAT_COMPLETIONS_MODELS;
    expect(prefersChatCompletions("gemini-3.1-flash-lite-preview")).toBe(true);
    expect(prefersChatCompletions("deepseek-v4-flash")).toBe(true);
    expect(prefersChatCompletions("gpt-4o-mini")).toBe(false);
  });

  it("accepts explicit pattern overrides", () => {
    process.env.ANICCA_CHAT_COMPLETIONS_MODELS = "foo-*,bar-model";
    expect(prefersChatCompletions("foo-baz")).toBe(true);
    expect(prefersChatCompletions("bar-model")).toBe(true);
    expect(prefersChatCompletions("deepseek-v4-flash")).toBe(true);
    expect(prefersChatCompletions("gemini-3.1-flash-lite-preview")).toBe(false);
  });
});

describe("generateText", () => {
  const previous = process.env.ANICCA_CHAT_COMPLETIONS_MODELS;

  beforeEach(() => {
    delete process.env.ANICCA_CHAT_COMPLETIONS_MODELS;
  });

  afterEach(() => {
    process.env.ANICCA_CHAT_COMPLETIONS_MODELS = previous;
  });

  it("uses chat completions directly for configured models", async () => {
    const client = {
      responses: {
        create: vi.fn()
      },
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "chat path" } }]
          })
        }
      }
    } as any;

    await expect(
      generateText({
        client,
        model: "gemini-3.1-flash-lite-preview",
        input: "hello",
        maxOutputTokens: 32
      })
    ).resolves.toEqual({ text: "chat path", transport: "chat_completions" });

    expect(client.responses.create).not.toHaveBeenCalled();
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("disables provider thinking for DeepSeek dialectic output", async () => {
    const client = {
      responses: {
        create: vi.fn()
      },
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "deepseek output" } }]
          })
        }
      }
    } as any;

    await generateText({
      client,
      model: "deepseek-v4-flash",
      input: "hello",
      maxOutputTokens: 1200
    });

    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: { type: "disabled" } })
    );
    expect(client.responses.create).not.toHaveBeenCalled();
  });

  it("falls back to chat completions when responses are unsupported", async () => {
    const client = {
      responses: {
        create: vi.fn().mockRejectedValue(new Error("not implemented"))
      },
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "fallback path" } }]
          })
        }
      }
    } as any;

    await expect(
      generateText({
        client,
        model: "gpt-4o-mini",
        input: "hello",
        maxOutputTokens: 32
      })
    ).resolves.toEqual({ text: "fallback path", transport: "chat_completions" });

    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("uses responses when the model supports it", async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: "responses path"
        })
      },
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    } as any;

    await expect(
      generateText({
        client,
        model: "gpt-4o-mini",
        input: "hello",
        maxOutputTokens: 32
      })
    ).resolves.toEqual({ text: "responses path", transport: "responses" });

    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it("reads DeepSeek cache tokens and leaves absent usage fields unknown", async () => {
    const client = { chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: "result" } }],
      usage: { prompt_tokens: 100, prompt_cache_hit_tokens: 64 }
    }) } } } as unknown as OpenAI;
    await expect(generateText({ client, model: "deepseek-test", input: "hello", maxOutputTokens: 32 }))
      .resolves.toMatchObject({ usage: { inputTokens: 100, outputTokens: null, cachedInputTokens: 64 } });
  });

  it("does not call the provider for an already cancelled request", async () => {
    const abort = new AbortController();
    abort.abort();
    const create = vi.fn();
    const client = { responses: { create } } as unknown as OpenAI;
    await expect(generateText({ client, model: "gpt-test", input: "hello", maxOutputTokens: 32, signal: abort.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(create).not.toHaveBeenCalled();
  });
});
