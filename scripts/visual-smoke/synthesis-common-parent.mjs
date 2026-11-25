import assert from "node:assert/strict";
import path from "node:path";
import { waitForSeedLayout } from "./seeds.mjs";

const date = "2026-10-24T00:00:00Z";
const node = (id, label, parents, children, branchType) => ({
  id, text: label, parents, children, createdAt: date, kind: branchType ? "assistant" : "user",
  branchType, meta: { label }
});

const fixture = {
  schemaVersion: "anicca-workspace-v2", workspaceId: "cross-topic-stage", focusedNodeId: "result",
  composerParentId: null, stageLayouts: {}, graph: { version: "anicca-dialectic-v2", entryIds: ["root"], edges: {}, nodes: {
    root: node("root", "早期共同问题", [], ["branch-a", "branch-b"]),
    "branch-a": node("branch-a", "水边活动", ["root"], ["a"], "正"),
    "branch-b": node("branch-b", "土地维护", ["root"], ["b"], "反"),
    a: node("a", "调整水边", ["branch-a"], ["result"], "正"),
    b: node("b", "照料土地", ["branch-b"], ["result"], "正"),
    result: { ...node("result", "跨母题试合", ["a", "b"], [], "合"), meta: {
      label: "跨母题试合", summary: "协调活动与维护", sourceNodeIds: ["a", "b"], sourceInstanceIds: ["a-copy", "b"]
    } }
  } },
  seedInstances: Object.fromEntries([
    ["a-copy", "a", 1], ["a-other", "a", 2], ["ancestor-copy", "root", 1]
  ].map(([id, conceptId, ordinal]) => [id, { id, conceptId, ordinal, createdAt: date }]))
};

export async function runCrossTopicSynthesis(browser, { baseUrl, outputDir, blindDir, setActivePage = () => {} }) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await context.addInitScript(({ snapshot, date }) => {
    localStorage.setItem("anicca_workspace_active_v1", snapshot.workspaceId);
    localStorage.setItem(`anicca_workspace_snapshot_v1:${snapshot.workspaceId}`, JSON.stringify(snapshot));
    localStorage.setItem("anicca_workspace_registry_v1", JSON.stringify({
      schemaVersion: "anicca-workspace-registry-v1", entries: [{
        id: snapshot.workspaceId, title: "跨母题", createdAt: date, updatedAt: date, lastOpenedAt: date, entryCount: 1, nodeCount: 6
      }]
    }));
  }, { snapshot: fixture, date });
  const page = await context.newPage();
  setActivePage(page);
  const seed = id => page.getByTestId(`dialogue-stage-node-${id}`);
  const results = [];
  try {
    await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
    const guide = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await guide.isVisible()) await guide.tap();
    await page.locator('[data-metaball-renderer="ready"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const state of ["ordinary", "expanded"]) {
      if (state === "expanded") {
        await page.getByRole("button", { name: "展开来源", exact: true }).tap();
        await page.getByTestId("dialogue-source-context").waitFor();
      }
      await waitForSeedLayout(page, { captions: true });
      assert.equal(await page.locator("[data-common-parent-marker]").count(), 0);
      assert.equal(await page.locator("[data-compact-synthesis] [data-seed-caption]:visible").count(), 3);
      const geometry = await page.locator("[data-synthesis-tier]").evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { id: element.dataset.metaballSurface, concept: element.dataset.seedConcept, role: element.dataset.sourceRole,
          tier: element.dataset.synthesisTier, x: x + width / 2, y: y + height / 2, diameter: width };
      }));
      assert(geometry.filter(item => item.tier === "distant").length >= 3);
      const sources = geometry.filter(item => item.tier === "source");
      assert.deepEqual(sources.map(item => item.id), ["a-copy", "b"]);
      assert(sources.every(item => item.y > 0));
      const sourceTop = Math.min(...sources.map(item => item.y));
      assert(!geometry.some(item => item.y < sourceTop && Math.abs(item.x - 160) < item.diameter / 2 + 8));
      await page.evaluate(() => Object.defineProperty(document, "hidden", { configurable: true, get: () => true }));
      try {
        await page.screenshot({ path: path.join(outputDir, `cross-topic-${state}.png`) });
        if (blindDir) await page.screenshot({ path: path.join(blindDir, `cross-topic-gray-${state}.png`), style: `
          html { filter: grayscale(1); }
          [data-stage-label-chrome], [data-stage-navigation-controls], [data-testid="dialogue-workspace-bar"],
          [data-testid="dialogue-composer"], [data-seed-caption], [data-synthesis-marker],
          [data-common-parent-marker], [data-seed-leader] { visibility: hidden !important; }
        ` });
      } finally {
        await page.evaluate(() => {
          delete document.hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        });
      }
      results.push({ state, geometry, renderer: await page.getByTestId("dialogue-metaball-canvas").getAttribute("data-renderer-backend") });
    }
    for (const [id, heading] of [["a-copy", "调整水边"], ["b", "照料土地"]]) {
      await waitForSeedLayout(page, { captions: true });
      const box = await seed(id).boundingBox();
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-metaball-surface]")?.dataset.metaballSurface, point);
      assert.equal(hit, id);
      await page.touchscreen.tap(point.x, point.y);
      await seed(id).and(page.locator('[data-reading-role="main"]')).waitFor();
      assert.equal(await page.getByTestId("dialogue-panel").getByRole("heading", { level: 2 }).innerText(), heading);
      await page.getByRole("button", { name: "返回种子，收起阅读", exact: true }).tap();
      await page.getByTestId("dialogue-source-context").waitFor();
    }
    return { name: "synthesis-common-parent", passed: true, results };
  } finally {
    await context.close();
  }
}
