import path from "node:path";
import { loadConfigFromFile } from "vite";

describe("Vitest configuration", () => {
  it("excludes ignored generated artifacts from test discovery", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      path.resolve(process.cwd(), "vitest.config.ts")
    );

    expect(loaded?.config).toMatchObject({
      test: {
        exclude: expect.arrayContaining(["artifacts/**"])
      }
    });
  });
});
