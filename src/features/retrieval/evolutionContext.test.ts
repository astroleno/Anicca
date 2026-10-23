import { evolutionFixture } from "../../../tests/evolutionFixture";
import { queryWorkspaceGraph } from "./workspaceGraphQuery";
import { renderRetrievalContext } from "./contextRender";

it("renders a captured pole separately from a dialectical stance in retrieval context", () => {
  const f = evolutionFixture();
  const result = queryWorkspaceGraph(f.graph, "是否继续投入这个项目", { seedLimit: 1, depth: 4, maxDepth: 4 });
  const rendered = renderRetrievalContext(result, { charBudget: 2400 });
  const pole = rendered.split("\n").find(line => line.includes(`NODE [${f.negative}]`))!;
  expect(pole).toContain("polarity=关切:个体"); expect(pole).not.toContain("branch=antithesis");
  expect(rendered).toContain("branch=thesis lens=长远");
  expect(rendered).toContain("--polarity-->");
  expect(rendered.length).toBeLessThanOrEqual(2400);
});
