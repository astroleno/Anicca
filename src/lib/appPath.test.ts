import { afterEach, describe, expect, it, vi } from "vitest";
import { appPath } from "./appPath";

afterEach(() => vi.unstubAllEnvs());

describe("appPath", () => {
  it("keeps root deployments working", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    expect(appPath("/api/branches")).toBe("/api/branches");
    expect(appPath("/dialogue")).toBe("/dialogue");
  });

  it("keeps requests, queries and links inside the deployment prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/Anicca/");
    expect(appPath("/api/branches")).toBe("/Anicca/api/branches");
    expect(appPath("/api/prompts?type=thesis")).toBe("/Anicca/api/prompts?type=thesis");
    expect(appPath("/dialogue#dialogue-input")).toBe("/Anicca/dialogue#dialogue-input");
    expect(appPath("/")).toBe("/Anicca/");
  });

  it("does not duplicate the prefix or confuse similarly named paths", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/Anicca");
    for (const path of ["/Anicca", "/Anicca/dialogue", "/Anicca?lab=1", "/Anicca#input"]) {
      expect(appPath(path)).toBe(path);
    }
    expect(appPath("/AniccaLab")).toBe("/Anicca/AniccaLab");
  });

  it("leaves external URLs, local fragments and relative links alone", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/Anicca");
    for (const path of ["https://example.com/api", "//example.com/api", "#dialogue-input", "?lab=1", "dialogue"]) {
      expect(appPath(path)).toBe(path);
    }
  });
});
