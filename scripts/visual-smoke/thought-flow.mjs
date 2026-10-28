import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { waitForSeedLayout } from "./seeds.mjs";

const quote = "这些角落可以让成员发现新的共同活动，但也可能增加维护负担。";
const sourceText = `社区花园是否应该保留不预设用途的角落？${quote}前一次讨论侧重用途，这一次我们想从维护关系继续追问。${quote}我们想保留共同发现的机会，也希望维护方式可以持续商量。\n\n${"例如，成员可以先尝试一项临时活动，再讨论哪些地方需要恢复、哪些约定值得保留。未参与活动的人也可以表达受到的影响，新的用途和维护方式因此仍有调整的余地。\n\n".repeat(12)}`;
export const thoughtFlowFixture = {
  schemaVersion: "anicca-workspace-v2", workspaceSessionId: "thought-flow-smoke", focusedNodeId: "root", composerParentId: null,
  graph: { version: "anicca-dialectic-v2", entryIds: ["root"], nodes: {
    root: { id: "root", kind: "user", text: sourceText, parents: [], children: [], createdAt: "2026-10-24T00:00:00Z" }
  }, edges: {} }
};

export function thoughtFlowResponseFor(endpoint, body, sequence) {
  const annotation = (frame, axisId, value) => ({ axes: frame.axes.map(axis => ({ id: axis.id, label: axis.label, negative: axis.negative, positive: axis.positive,
    value: axis.id === axisId ? value : frame.focus[axis.id] || 0,
    selected: axis.id === axisId ? value : frame.focus[axis.id] || 0, source: "viewpoint" })) });
  const pack = (label, text, change, stance) => ({ label, text, summary: change, change, ...(stance ? { stance } : {}) });
  const result = { requestId: body.requestId };
  if (endpoint === "/api/inquiry") return { ...result, inquiry: pack("协商的余地",
    "不预设用途并不等于不承担维护责任。这句话依赖的前提是：成员能重新商量用途，也能说出自己愿意承担哪些维护。\n\n例如，一次临时活动结束后，参与者可以共同决定保留什么、恢复什么；未参加的人也应有机会表达受到的影响。\n\n因此，值得保留的开放性包含重新协商的余地。接下来可以分别看个人的尝试空间与群体的维护关系，再判断两者怎样一起延续。",
    "把用途的开放与维护责任分开，让重新协商成为共同条件。") };
  if (endpoint === "/api/polarities") {
    const axis = body.perspective.axes.find(item => item.id === body.axisId);
    return { ...result, axis,
      negative: { ...pack(`试探${sequence}`, `从「${axis.negative}」看，花园的临时尝试应保留修改的余地，让参与者能表达实际承担的代价。`, "看见尝试者需要能够修改约定的空间。"), perspective: annotation(body.perspective, axis.id, -1) },
      positive: { ...pack(`共担${sequence}`, `从「${axis.positive}」看，花园的开放用途也需要共同讨论维护方式，让未参与活动的人仍有表达影响的机会。`, "看见开放用途还牵动其他人的共同维护。"), perspective: annotation(body.perspective, axis.id, 1) }
    };
  }
  if (endpoint === "/api/branches") return { ...result,
    thesis: pack(`延续${sequence}`, "沿着可以重新协商的条件推进，让每次尝试留下讨论用途与维护方式的机会。", "把可修改的约定带入每次尝试的过程。", "正"),
    antithesis: pack(`检视${sequence}`, "还需要质疑谁有机会重新协商。如果只有活动组织者能决定，未参与的人可能只能承担结果。", "指出重新协商仍依赖参与机会如何分配。", "反") };
  return { ...result, synthesis: pack("共同改写约定",
    "把花园的开放性理解为共同改写约定的能力。活动参与者与受到影响的人都可以说出需要保留或调整的部分，用途的变化与维护责任因此一起被讨论，也保留不同意和暂缓的空间。",
    "把开放性转向共同改写约定，让用途与维护责任一起被讨论。", "合") };
}

/** The same UI journey can use controlled responses in CI or the configured API locally. */
export async function runThoughtFlow(browser, { baseUrl, outputDir, setActivePage,
  live = false, entryPath = "/dialogue", specs = [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile-390", width: 390, height: 844 }, { name: "mobile-320", width: 320, height: 568 }] }) {
  const results = [];
  const basePath = new URL(baseUrl).pathname.replace(/\/+$/, "");
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1,
      hasTouch: spec.width < 500, isMobile: spec.width < 500 });
    await context.addInitScript(data => {
      if (!localStorage.getItem("anicca_workspace_active_v1")) localStorage.setItem("anicca_workspace_v2", JSON.stringify(data));
    }, thoughtFlowFixture);
    if (spec.width < 500) await context.addInitScript(({ width, height }) => {
      const events = new EventTarget(), viewport = { width, height, offsetTop: 0, offsetLeft: 0, scale: 1,
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.__thoughtFlowKeyboard = open => { viewport.height = open ? Math.min(520, height - 230) : height; events.dispatchEvent(new Event("resize")); };
    }, spec);
    const page = await context.newPage(); setActivePage(page);
    page.setDefaultTimeout(30_000);
    const errors = [], calls = [], prefix = `thought-flow-${live ? "live-" : ""}${spec.name}`;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    let sequence = 0;
    const endpoints = new Set(["/api/inquiry", "/api/polarities", "/api/branches", "/api/synthesis"]);
    await page.route("**/api/**", async route => {
      const endpoint = new URL(route.request().url()).pathname.slice(basePath.length);
      if (!endpoints.has(endpoint)) return route.continue();
      const input = route.request().postDataJSON(), started = Date.now();
      const call = { endpoint, input, status: null, elapsedMs: null, response: null }; calls.push(call);
      if (live) {
        const response = await route.fetch({ timeout: 180_000 });
        call.status = response.status(); call.response = await response.json(); call.elapsedMs = Date.now() - started;
        await route.fulfill({ response });
      } else {
        call.status = 200; call.response = thoughtFlowResponseFor(endpoint, input, ++sequence); call.elapsedMs = Date.now() - started;
        await route.fulfill({ json: call.response });
      }
    });
    const activate = locator => spec.width < 500 ? locator.tap() : locator.click();
    const input = page.getByRole("textbox", { name: "输入", exact: true });
    const panel = page.getByTestId("dialogue-panel");
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`)));
    const waitCount = count => page.waitForFunction(expected => {
      const saved = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`) || "null");
      return Object.keys(saved?.graph.nodes || {}).length === expected;
    }, count, { timeout: live ? 180_000 : 30_000 });
    const shot = async name => {
      await page.waitForFunction(() => {
        const drawer = document.getElementById("dialogue-reading-drawer");
        return !drawer || (drawer.dataset.open === "true" && getComputedStyle(drawer).opacity === "1");
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(outputDir, `${prefix}-${name}.png`) });
    };
    const closeReading = async () => {
      const close = page.getByRole("button", { name: "返回种子，收起阅读", exact: true });
      if (await close.isVisible()) await activate(close);
      await page.locator('#dialogue-reading-drawer[data-open="true"]').waitFor({ state: "hidden" });
    };
    const openSeed = async id => {
      await closeReading(); await waitForSeedLayout(page);
      await activate(page.getByTestId(`dialogue-stage-node-${id}`).locator("[data-seed-caption]"));
      await panel.waitFor();
      await page.waitForFunction(() => getComputedStyle(document.getElementById("dialogue-reading-drawer")).opacity === "1");
    };
    try {
      await page.goto(`${baseUrl}${entryPath}`, { waitUntil: "networkidle" });
      const guide = page.getByRole("button", { name: "关闭提示", exact: true }); if (await guide.isVisible()) await activate(guide);
      assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin, "The requested domain stays in the address bar");
      assert.equal(new URL(page.url()).pathname, `${basePath}${entryPath}`); assert(await page.title());
      await page.waitForFunction(() => document.querySelector('[data-testid="dialogue-stage-track"]')?.dataset.metaballRenderer === "ready");
      const renderer = await page.locator('[data-testid="dialogue-metaball-canvas"]').evaluate(canvas => ({
        backend: canvas.dataset.rendererBackend, secureContext: window.isSecureContext
      }));
      await openSeed("root");
      assert.equal(await page.getByRole("button", { name: "推演正反", exact: true }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "极性分裂", exact: true }).count(), 1);
      const readingPosition = await panel.evaluate(element => {
        element.scrollTop = 500; element.dispatchEvent(new Event("scroll")); return element.scrollTop;
      });
      assert(readingPosition > 100, "Long reading fixture must scroll");
      await page.keyboard.press("Escape"); await openSeed("root");
      await page.waitForFunction(() => document.activeElement?.id === "conversation-panel-heading");
      assert.equal(await panel.evaluate(element => element.scrollTop), readingPosition, "Heading focus must preserve restored reading position");
      if (spec.width > 500) await page.locator("[data-seed-passage] p").evaluate((paragraph, selected) => {
        const text = paragraph.firstChild, start = text.textContent.lastIndexOf(selected), range = document.createRange();
        range.setStart(text, start); range.setEnd(text, start + selected.length);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      }, quote);
      else {
        await activate(page.getByRole("button", { name: "选一句追问", exact: true }));
        await activate(page.getByLabel("选择要追问的原句").getByRole("button", { name: quote, exact: true }).nth(1));
      }
      await page.getByLabel("围绕选句继续").waitFor();
      assert.equal(await page.getByRole("button", { name: "推演正反", exact: true }).count(), 0, "Selecting a quote hides unrelated expansion choices");
      await activate(page.getByRole("button", { name: "追问前提", exact: true }));
      await input.fill("这些开放的角落依赖什么共同条件？");
      assert(await input.evaluate(element => Boolean(element.closest('[data-testid="dialogue-panel"]'))), "The question stays with its passage");
      assert.equal(await page.getByTestId("dialogue-composer").count(), 1);
      const plain = await page.getByLabel("围绕选句继续").evaluate(element => {
        const style = getComputedStyle(element); return { background: style.backgroundColor, shadow: style.boxShadow, radius: style.borderRadius };
      });
      assert.deepEqual(plain, { background: "rgba(0, 0, 0, 0)", shadow: "none", radius: "0px" });
      await shot("inline-question");
      if (spec.width < 500) {
        await input.focus(); await page.evaluate(() => window.__thoughtFlowKeyboard(true));
        await page.waitForFunction(() => {
          const field = document.getElementById("dialogue-input"), rect = field.getBoundingClientRect(), viewport = window.visualViewport;
          return document.activeElement === field && rect.top >= viewport.offsetTop && rect.bottom <= viewport.offsetTop + viewport.height;
        });
        await shot("keyboard");
        await page.evaluate(() => window.__thoughtFlowKeyboard(false));
      }
      await closeReading(); await openSeed("root");
      assert.equal(await input.inputValue(), "这些开放的角落依赖什么共同条件？");
      assert.equal(await page.getByLabel("本次追问的原句").innerText(), quote);
      await page.reload({ waitUntil: "networkidle" }); await openSeed("root");
      assert.equal(await input.inputValue(), "这些开放的角落依赖什么共同条件？");
      assert.equal(await page.getByLabel("本次追问的原句").getAttribute("data-passage-start"), String(sourceText.lastIndexOf(quote)));
      await shot("quote-after-refresh");
      await activate(page.getByRole("button", { name: "追问", exact: true }));
      await waitCount(3);
      let graph = (await snapshot()).graph;
      const response = Object.values(graph.nodes).find(node => node.kind === "assistant" && node.meta?.inquiry);
      assert(response); assert.equal(response.meta.inquiry.quote, quote);
      assert.equal(response.meta.inquiry.quoteStart, sourceText.lastIndexOf(quote));
      assert((await panel.innerText()).includes(response.text.slice(0, 60)), "The real inquiry remains readable when its optional change is unverified");
      const verifiedChange = response.meta?.change && !["unchecked", "revisit"].includes(response.meta?.novelty?.status);
      if (verifiedChange) await page.getByLabel("这一步的理解变化").waitFor();
      else assert.equal(await page.getByLabel("这一步的理解变化").count(), 0, "An unverified change must not become a claimed discovery");
      assert.equal(await panel.locator('details[open]').count(), 0, "The original quote remains available without repeating its whole history");
      await shot("response");
      await activate(page.getByRole("button", { name: "极性分裂", exact: true }));
      assert((await panel.innerText()).includes("围绕："));
      await activate(page.getByRole("radio", { name: /关切/ }));
      await shot("axis");
      await activate(page.getByRole("button", { name: "沿「关切」展开", exact: true }));
      await waitCount(5); await waitForSeedLayout(page); await shot("poles");
      graph = (await snapshot()).graph;
      const pole = Object.values(graph.nodes).find(node => node.meta?.polarity?.pole === -1);
      assert(pole); assert.equal(pole.parents[0], response.id); assert.equal(pole.branchType, undefined);
      await activate(page.getByTestId("dialogue-expansion-context").getByRole("button", { name: /^阅读个体「/ }));
      await page.getByRole("button", { name: "推演正反", exact: true }).waitFor();
      await activate(page.getByRole("button", { name: "推演正反", exact: true }));
      await waitCount(7); await waitForSeedLayout(page);
      graph = (await snapshot()).graph;
      const thesis = Object.values(graph.nodes).find(node => node.parents[0] === pole.id && node.branchType === "正");
      const antithesis = Object.values(graph.nodes).find(node => node.parents[0] === pole.id && node.branchType === "反");
      assert(thesis && antithesis);
      const firstSplit = calls.find(call => call.endpoint === "/api/branches");
      assert.equal(firstSplit.input.userText, pole.text); assert.equal(firstSplit.input.perspective.focus.concern, -1);
      assert(firstSplit.input.contextMessages.some(message => message.content.includes(quote)), "The original quote travels into ordinary fission");
      await activate(page.getByTestId("dialogue-expansion-context").getByRole("button", { name: /^阅读正「/ }));
      await page.reload({ waitUntil: "networkidle" }); await waitCount(7); await openSeed(thesis.id);
      await activate(page.getByRole("button", { name: "组合", exact: true }));
      const choices = page.getByRole("group", { name: "选择组合对象", exact: true });
      assert.equal(await choices.getByText("本轮另一端", { exact: true }).count(), 1);
      assert((await choices.getByRole("button").first().innerText()).includes(antithesis.meta.label));
      await shot("pair-after-refresh");
      await activate(choices.getByRole("button").first());
      await page.waitForFunction(() => {
        const data = JSON.parse(localStorage.getItem(`anicca_workspace_snapshot_v1:${localStorage.getItem("anicca_workspace_active_v1")}`));
        return Object.values(data.graph.nodes).some(node => node.branchType === "合") || Object.keys(data.graph.deferredSyntheses || {}).length;
      }, undefined, { timeout: live ? 180_000 : 30_000 });
      graph = (await snapshot()).graph;
      if (!Object.values(graph.nodes).some(node => node.branchType === "合")) {
        await activate(page.getByRole("button", { name: "补充联系", exact: true }));
        await input.fill("这两端围绕同一件事：让参与者保留改变用途的机会，也让受到影响的人能够共同修改维护约定。");
        await activate(page.getByRole("button", { name: "再试一次", exact: true }));
      }
      await waitCount(8); await waitForSeedLayout(page);
      graph = (await snapshot()).graph;
      const synthesis = Object.values(graph.nodes).find(node => node.branchType === "合");
      assert(synthesis); assert.deepEqual(new Set(synthesis.parents), new Set([thesis.id, antithesis.id]));
      assert(graph.nodes[thesis.id] && graph.nodes[antithesis.id], "Fusion keeps both sources");
      const synthesisSummary = synthesis.meta.change || synthesis.meta.summary;
      assert(synthesisSummary, "A synthesis must retain its explanation even without a verified change");
      assert((await page.getByTestId("dialogue-synthesis-context").innerText()).includes(synthesisSummary));
      await shot("synthesis");
      await activate(page.getByRole("button", { name: "继续展开", exact: true }));
      assert.equal(await panel.getByRole("group", { name: "种子基本操作" }).getByRole("button").count(), 3,
        "A synthesis keeps all three basic continuation operations at the same level");
      await activate(page.getByRole("button", { name: "推演正反", exact: true }));
      await waitCount(10); await waitForSeedLayout(page); await shot("after-fission");
      const lastSplit = calls.filter(call => call.endpoint === "/api/branches").at(-1);
      assert.equal(lastSplit.input.userText, synthesis.text);
      assert(lastSplit.input.contextMessages.some(message => message.content.includes(quote)));
      await activate(page.getByTestId("dialogue-expansion-context").getByRole("button", { name: /^阅读正「/ }));
      await page.reload({ waitUntil: "networkidle" }); await waitCount(10);
      graph = (await snapshot()).graph;
      const continued = Object.values(graph.nodes).find(node => node.parents[0] === synthesis.id && node.branchType === "正");
      const continuedCompanion = Object.values(graph.nodes).find(node => node.parents[0] === synthesis.id && node.branchType === "反");
      assert(continued && continuedCompanion);
      await openSeed(continued.id);
      await activate(page.getByRole("button", { name: "组合", exact: true }));
      assert.equal(await choices.getByText("本轮另一端", { exact: true }).count(), 1);
      assert((await choices.getByRole("button").first().innerText()).includes(continuedCompanion.meta.label));
      await shot("continued-pair-after-refresh");
      await openSeed(synthesis.id);
      await activate(page.getByRole("button", { name: "极性分裂", exact: true }));
      await activate(page.getByRole("radio", { name: /时间/ }));
      await activate(page.getByRole("button", { name: "沿「时间」展开", exact: true }));
      await waitCount(12); await waitForSeedLayout(page); await shot("after-polarity");
      graph = (await snapshot()).graph;
      assert.equal(Object.values(graph.nodes).filter(node => node.parents[0] === synthesis.id && node.meta?.polarity).length, 2);
      const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert(layout.scrollWidth <= layout.width + 1); assert.deepEqual(errors, []);
      assert(calls.every(call => call.status === 200));
      results.push({ ...spec, passed: true, live, renderer, requestCount: calls.length, nodeCount: Object.keys(graph.nodes).length,
        inquiryId: response.id, synthesisId: synthesis.id, readingPosition, quoteStart: response.meta.inquiry.quoteStart, layout, errors, calls });
    } catch (error) {
      await shot("failure").catch(() => {});
      await writeFile(path.join(outputDir, `${prefix}-failure.json`), JSON.stringify({ error: String(error), calls, errors }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
  return { name: "thought-flow", results };
}
