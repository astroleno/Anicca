import { parseFirstJsonObject } from "@/lib/openai/parseFirstJsonObject";
import { readOutputText } from "@/lib/openai/readOutputText";

describe("readOutputText", () => {
  it("prefers output_text when available", () => {
    expect(
      readOutputText({
        output_text: "hello world",
        output: [
          {
            content: [{ text: "ignored" }]
          }
        ]
      })
    ).toBe("hello world");
  });

  it("falls back to output content text parts", () => {
    expect(
      readOutputText({
        output: [
          {
            content: [{ text: "first" }, { text: { value: "second" } }]
          }
        ]
      })
    ).toBe("first\nsecond");
  });

  it("returns empty string when no text is present", () => {
    expect(readOutputText({ output: [{ content: [{}] }] })).toBe("");
    expect(readOutputText({})).toBe("");
  });
});

describe("parseFirstJsonObject", () => {
  it("parses the first object from fenced output", () => {
    expect(
      parseFirstJsonObject("before\n```json\n{\"stance\":\"正\"}\n```\nafter")
    ).toEqual({ stance: "正" });
  });

  it("returns null when no object exists", () => {
    expect(parseFirstJsonObject("not json")).toBeNull();
  });
});
