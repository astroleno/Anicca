import assert from "node:assert/strict";
import path from "node:path";
import { waitForSeedLayout } from "./seeds.mjs";

const sourceText = "每写完一个片段，可以回看哪些细节真正改变了后文的选择。只认领有张力的线索，其余仍可留在背景。作品的方向因此逐渐显现，写作者也保有重新选择走向的空间。";
const repeatedText = "只把有张力的线索升格为债，不必认领所有伏线。每完成一段，再挑选值得回应的细节，其他线索可以留在背景里，作品便能随着这些选择慢慢找到方向。";
const fixture = {
  schemaVersion: "anicca-workspace-v2", workspaceSessionId: "continuity-smoke", focusedNodeId: "earlier", composerParentId: null,
  graph: { version: "anicca-dialectic-v2", entryIds: ["root"], nodes: {
    root: { id: "root", kind: "user", text: "写作如何同时保留自由和收束？", parents: [], children: ["earlier"], createdAt: "2026-10-23T00:00:00Z" },
    earlier: { id: "earlier", kind: "assistant", text: sourceText, branchType: "正", parents: ["root"], children: ["revisit"], createdAt: "2026-10-23T00:01:00Z", meta: { label: "认领线索", summary: "只认领有张力的线索。" } },
    revisit: { id: "revisit", kind: "assistant", text: repeatedText, branchType: "正", parents: ["earlier"], children: [], createdAt: "2026-10-23T00:02:00Z", meta: {
      label: "辨认引力", summary: "只回应有张力的伏线。", change: "把选择对象缩小到有张力的线索。",
      novelty: { status: "revisit", sourceId: "earlier", reason: "此前已区分值得认领的线索和可留在背景的细节。", sourceEvidence: "只认领有张力的线索", resultEvidence: "只把有张力的线索升格为债" }
    } }
  }, edges: { first: { id: "first", from: "root", to: "earlier", reason: "branch" }, again: { id: "again", from: "earlier", to: "revisit", reason: "branch" } } }
};

/** Regression for the full reading → quoted inquiry → panorama → draft loop. */
export async function runFlowContinuity(browser, { baseUrl, outputDir, setActivePage }) {
  const results = [];
  for (const spec of [{ name: "desktop", width: 1440, height: 980 }, { name: "mobile-390", width: 390, height: 844 }, { name: "mobile-320", width: 320, height: 780 }]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1, hasTouch: spec.width < 500, isMobile: spec.width < 500 });
    await context.addInitScript(data => {
      if (!localStorage.getItem("anicca_workspace_active_v1")) localStorage.setItem("anicca_workspace_v2", JSON.stringify(data));
    }, fixture);
    if (spec.width < 500) await context.addInitScript(({ width, height }) => {
      const events = new EventTarget();
      const viewport = { width, height, offsetTop: 0, offsetLeft: 0, scale: 1,
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.__continuityKeyboard = open => { viewport.height = open ? 520 : height; viewport.offsetTop = open ? 40 : 0; events.dispatchEvent(new Event("resize")); };
    }, { width: spec.width, height: spec.height });
    const page = await context.newPage(); setActivePage(page);
    const errors = [], calls = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/inquiry", async route => {
      const body = route.request().postDataJSON(); calls.push(body);
      await route.fulfill({ json: { requestId: body.requestId, inquiry: {
        text: "这句话依赖一个未说出的前提：线索的取舍仍然可以撤回。如果作品已经公开连载，对读者作出的承诺会增加改写的成本。因此可以先区分私人草稿里的尝试和已经公开的约定，再判断哪些线索仍能自由调整。",
        summary: "区分可撤回的草稿和公开承诺。", label: "撤回的空间", change: "澄清认领线索以仍可撤回为条件。"
      } } });
    });
    const input = page.getByRole("textbox", { name: "输入", exact: true });
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`)));
    const closeReading = async () => { const close = page.getByRole("button", { name: "返回种子，收起阅读" }); if (await close.isVisible()) await close.click(); };
    const openSeed = async id => {
      await closeReading(); await waitForSeedLayout(page);
      await page.getByTestId(`dialogue-stage-node-${id}`).locator("[data-seed-caption]").click();
      await page.waitForFunction(() => { const drawer = document.getElementById("dialogue-reading-drawer"); return drawer && getComputedStyle(drawer).opacity === "1"; });
    };
    try {
      await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
      const guide = page.getByRole("button", { name: "关闭提示", exact: true }); if (await guide.isVisible()) await guide.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-stage-track"]')?.dataset.metaballRenderer === "ready");
      await input.fill("尚未写完的想法也值得保留。");
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await input.inputValue(), "尚未写完的想法也值得保留。", "A fast reload keeps the last input");
      await input.fill("");
      await openSeed("revisit");
      assert(await page.getByLabel("与此前想法的联系").isVisible());
      await page.getByRole("button", { name: "换个角度展开", exact: true }).click();
      assert(await page.getByRole("button", { name: "返回种子阅读" }).isVisible());
      await page.getByRole("button", { name: "返回种子阅读" }).click();
      await page.getByRole("button", { name: "回看「认领线索」", exact: true }).click();
      await page.getByTestId("dialogue-panel").getByText(sourceText, { exact: true }).waitFor();
      const quote = "只认领有张力的线索，其余仍可留在背景。";
      if (spec.width > 500) {
        await page.locator("[data-seed-passage] p").evaluate((paragraph, text) => {
          const node = paragraph.firstChild, offset = node.textContent.indexOf(text), range = document.createRange();
          range.setStart(node, offset); range.setEnd(node, offset + text.length);
          const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }, quote);
      } else {
        await page.getByRole("button", { name: "选一句追问", exact: true }).click();
        await page.getByLabel("选择要追问的原句").getByRole("button", { name: quote, exact: true }).click();
      }
      // A brief look at the whole path must preserve the exact reading place
      // and selection, without remounting the passage or losing keyboard focus.
      const passage = await page.locator("[data-seed-passage]").elementHandle();
      await page.getByLabel("围绕选句继续").scrollIntoViewIfNeeded();
      const readingScroll = await page.getByTestId("dialogue-panel").evaluate(element => element.scrollTop);
      await page.getByRole("button", { name: "演化全景", exact: true }).click();
      await page.getByTestId("evolution-overview").getByRole("button", { name: "返回种子", exact: true }).click();
      assert(await passage.evaluate(element => element.isConnected), "Panorama keeps the original passage mounted");
      assert.equal(await page.getByTestId("dialogue-panel").evaluate(element => element.scrollTop), readingScroll);
      assert(await page.getByRole("button", { name: "演化全景", exact: true }).evaluate(element => document.activeElement === element));
      assert((await page.getByLabel("围绕选句继续").innerText()).includes(quote));
      await page.getByLabel("围绕选句继续").getByRole("button", { name: "追问前提", exact: true }).click();
      assert.equal(await page.getByLabel("本次追问的原句").innerText(), quote);
      await input.fill("什么条件下这些取舍还能撤回？");
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await input.inputValue(), "什么条件下这些取舍还能撤回？");
      assert.equal(await page.getByLabel("本次追问的原句").innerText(), quote);
      // Browsing a different seed must not silently readdress this question.
      await page.getByRole("button", { name: "演化全景", exact: true }).click();
      const panorama = page.getByTestId("evolution-overview");
      await panorama.getByRole("textbox", { name: "搜索想法或极性" }).fill("辨认引力");
      await panorama.getByRole("button").filter({ hasText: "辨认引力" }).click();
      await panorama.getByRole("button", { name: "进入种子", exact: true }).click();
      await closeReading();
      assert((await page.getByLabel("续写对象", { exact: true }).innerText()).includes("认领线索"));
      assert.equal(await input.inputValue(), "什么条件下这些取舍还能撤回？");
      // Each workspace owns its own text and quote, including a quick switch.
      await page.getByRole("button", { name: "更多", exact: true }).click();
      const originalWorkspace = await page.getByRole("group", { name: "最近工作区", exact: true }).locator('button[aria-current="true"]').innerText();
      await page.getByRole("button", { name: "新建工作区", exact: true }).click();
      await page.waitForFunction(() => document.getElementById("dialogue-input")?.value === "");
      assert.equal(await input.inputValue(), "");
      await input.fill("另一条尚未展开的思路。");
      await page.getByRole("button", { name: "更多", exact: true }).click();
      await page.getByRole("group", { name: "最近工作区", exact: true }).getByRole("button", { name: originalWorkspace, exact: true }).click();
      await page.waitForFunction(() => document.getElementById("dialogue-input")?.value === "什么条件下这些取舍还能撤回？");
      assert.equal(await input.inputValue(), "什么条件下这些取舍还能撤回？");
      assert.equal(await page.getByLabel("本次追问的原句").innerText(), quote);
      assert.equal((await snapshot()).composerParentId, "earlier");
      const composer = await page.getByTestId("dialogue-composer").boundingBox();
      assert(composer.y >= 0 && composer.y + composer.height <= spec.height + 1, "The restored quote and input stay on screen");
      const field = await input.boundingBox(), quoteBox = await page.getByLabel("本次追问的原句").boundingBox();
      assert(quoteBox.y + quoteBox.height <= field.y, "The quote has its own space above the question");
      assert(await input.evaluate(element => element.scrollHeight <= element.clientHeight + 1), "The short question is fully readable without clipping");
      await waitForSeedLayout(page);
      await page.screenshot({ path: path.join(outputDir, `continuity-${spec.name}-quote.png`) });
      await page.getByRole("button", { name: "追问", exact: true }).click();
      await page.waitForFunction(() => {
        const data = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`));
        return Object.keys(data.graph.nodes).length === 5;
      });
      const graph = (await snapshot()).graph;
      const answer = Object.values(graph.nodes).find(node => node.kind === "assistant" && node.meta?.inquiry);
      assert(answer); assert.equal(answer.meta.inquiry.quote, quote); assert.equal(calls.length, 1);
      assert.equal(calls[0].origin.question, "什么条件下这些取舍还能撤回？");
      await closeReading();
      await input.fill("看完来路之后，我还想继续问。");
      const draftTarget = (await snapshot()).composerParentId;
      if (spec.width < 500) {
        await input.focus(); await page.evaluate(() => window.__continuityKeyboard(true));
        await page.waitForFunction(() => document.querySelector('[data-keyboard-open="true"]'));
      }
      await page.getByRole("button", { name: "演化全景", exact: true }).click();
      const overview = page.getByTestId("evolution-overview"); await overview.waitFor();
      assert.equal(await input.evaluate(element => document.activeElement === element), false, "Opening panorama blurs the composer");
      const bounds = await overview.boundingBox();
      assert(bounds.y >= 0 && bounds.y + bounds.height <= (spec.width < 500 ? 560 : spec.height) + 2, "Panorama respects the visible keyboard height");
      if (spec.width < 500) assert(Math.abs(bounds.y - 40) < 2, "The keyboard pan offset is applied only once");
      await overview.getByRole("textbox", { name: "搜索想法或极性" }).fill(answer.meta.label);
      await overview.getByRole("button").filter({ hasText: answer.meta.label }).click();
      await overview.getByRole("button", { name: "回放来路", exact: true }).click();
      const next = overview.getByRole("button", { name: "下一幕", exact: true });
      for (let i = 0; i < 8 && await next.isEnabled(); i++) await next.click();
      assert((await overview.innerText()).includes("聚焦回应"));
      await page.screenshot({ path: path.join(outputDir, `continuity-${spec.name}-replay.png`) });
      await overview.getByRole("button", { name: "进入种子", exact: true }).click();
      if (spec.width < 500) await page.evaluate(() => window.__continuityKeyboard(false));
      assert.equal(await input.inputValue(), "看完来路之后，我还想继续问。");
      assert.equal((await snapshot()).composerParentId, draftTarget, "Entering another seed preserves the ordinary draft destination");
      await closeReading();
      await page.getByRole("button", { name: "先记下", exact: true }).click();
      assert.equal(calls.length, 1, "Quiet capture does not call the model");
      await waitForSeedLayout(page);
      const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        composer: document.querySelector('[data-testid="dialogue-composer"]').getBoundingClientRect().toJSON() }));
      assert(layout.scrollWidth <= layout.width + 1); assert(layout.composer.right <= spec.width + 1);
      await page.screenshot({ path: path.join(outputDir, `continuity-${spec.name}-return.png`) });
      assert.deepEqual(errors, []);
      results.push({ name: spec.name, passed: true, quote, requestCount: calls.length, layout });
    } catch (error) {
      await page.screenshot({ path: path.join(outputDir, `continuity-${spec.name}-failure.png`) }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  return { name: "flow-continuity", results };
}
