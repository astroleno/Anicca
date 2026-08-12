import { readFile } from "node:fs/promises";
import path from "node:path";

describe("quality workflow visual evidence", () => {
  it("uploads current success and failure outputs as mutually exclusive artifacts", async () => {
    const workflow = await readFile(
      path.resolve(process.cwd(), ".github/workflows/quality.yml"),
      "utf8"
    );

    expect(workflow).toContain("id: visual-smoke");
    expect(workflow).toContain("if: steps.visual-smoke.outcome == 'success'");
    expect(workflow).toContain("path: artifacts/visual-smoke/dialogue\n");
    expect(workflow).toContain("if: failure() && steps.visual-smoke.outcome == 'failure'");
    expect(workflow).toContain("path: artifacts/visual-smoke/dialogue-failure\n");
    expect(workflow).toContain("dialogue-visual-failure-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(workflow).not.toContain("if: always()");
  });
});
