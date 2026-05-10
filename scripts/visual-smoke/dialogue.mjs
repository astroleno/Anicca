import { mkdir, access, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const buildIdPath = path.join(repoRoot, ".next", "BUILD_ID");
const outputDir = path.join(repoRoot, "artifacts", "visual-smoke", "dialogue");
const baseUrl = process.env.DIALOGUE_SMOKE_BASE_URL || "http://127.0.0.1:3211";

const viewports = [
  { name: "desktop", width: 1440, height: 980, fullPage: false },
  { name: "tablet", width: 1024, height: 900, fullPage: false },
  { name: "tablet-touch", width: 1024, height: 768, fullPage: false, hasTouch: true, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, fullPage: true },
  { name: "mobile-touch-390", width: 390, height: 844, fullPage: true, hasTouch: true, isMobile: true }
];

const seededWorkspace = {
  schemaVersion: "anicca-workspace-v2",
  workspaceSessionId: "ws_visual_smoke",
  focusedNodeId: "user_root_1",
  composerParentId: null,
  graph: {
    version: "anicca-dialectic-v2",
    entryIds: ["user_root_1"],
    nodes: {
      user_root_1: {
        id: "user_root_1",
        kind: "user",
        text: "这个方向还值不值得继续投入？",
        createdAt: "2026-04-24T03:00:00.000Z",
        parents: [],
        children: ["asst_thesis_1", "asst_antithesis_1"]
      },
      asst_thesis_1: {
        id: "asst_thesis_1",
        kind: "assistant",
        branchType: "正",
        text: "继续，但把范围切小。",
        createdAt: "2026-04-24T03:01:00.000Z",
        parents: ["user_root_1"],
        children: ["asst_synthesis_1", "user_followup_1"],
        meta: {
          label: "继续",
          summary: "先缩范围，再推进。"
        }
      },
      asst_antithesis_1: {
        id: "asst_antithesis_1",
        kind: "assistant",
        branchType: "反",
        text: "先停一下，别同时铺太开。",
        createdAt: "2026-04-24T03:02:00.000Z",
        parents: ["user_root_1"],
        children: ["asst_synthesis_1"],
        meta: {
          label: "暂停",
          summary: "把摊子收住，再判断。"
        }
      },
      asst_synthesis_1: {
        id: "asst_synthesis_1",
        kind: "assistant",
        branchType: "合",
        text: "保留主线，但拆开节奏。",
        createdAt: "2026-04-24T03:03:00.000Z",
        parents: ["asst_thesis_1", "asst_antithesis_1"],
        children: ["user_followup_2"],
        meta: {
          label: "收束",
          summary: "保留主线，拆开节奏。",
          sourceNodeIds: ["asst_thesis_1", "asst_antithesis_1"],
          lineageParentId: "user_root_1"
        }
      },
      user_followup_1: {
        id: "user_followup_1",
        kind: "user",
        text: "如果继续，最小可验证范围是什么？",
        createdAt: "2026-04-24T03:04:00.000Z",
        parents: ["asst_thesis_1"],
        children: []
      },
      user_followup_2: {
        id: "user_followup_2",
        kind: "user",
        text: "如果按这个节奏推进，第一周只做什么？",
        createdAt: "2026-04-24T03:05:00.000Z",
        parents: ["asst_synthesis_1"],
        children: []
      }
    },
    edges: {
      e1: { id: "e1", from: "user_root_1", to: "asst_thesis_1", reason: "正" },
      e2: { id: "e2", from: "user_root_1", to: "asst_antithesis_1", reason: "反" },
      e3: { id: "e3", from: "asst_thesis_1", to: "asst_synthesis_1", reason: "synthesis" },
      e4: { id: "e4", from: "asst_antithesis_1", to: "asst_synthesis_1", reason: "synthesis" },
      e5: { id: "e5", from: "asst_thesis_1", to: "user_followup_1", reason: "continue" },
      e6: { id: "e6", from: "asst_synthesis_1", to: "user_followup_2", reason: "continue" }
    }
  }
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWorkspaceWithoutSynthesis({ includeSecondRoot = false } = {}) {
  const workspace = cloneJson(seededWorkspace);
  workspace.workspaceSessionId = includeSecondRoot ? "ws_visual_flow_stale" : "ws_visual_flow";
  workspace.focusedNodeId = "user_root_1";
  workspace.graph.nodes.asst_thesis_1.children = ["user_followup_1"];
  workspace.graph.nodes.asst_antithesis_1.children = [];
  delete workspace.graph.nodes.asst_synthesis_1;
  delete workspace.graph.nodes.user_followup_2;
  delete workspace.graph.edges.e3;
  delete workspace.graph.edges.e4;
  delete workspace.graph.edges.e6;

  if (includeSecondRoot) {
    workspace.graph.entryIds.push("user_root_2");
    workspace.graph.nodes.user_root_2 = {
      id: "user_root_2",
      kind: "user",
      text: "另一个问题要不要先处理？",
      createdAt: "2026-04-24T03:10:00.000Z",
      parents: [],
      children: ["asst_thesis_2", "asst_antithesis_2"]
    };
    workspace.graph.nodes.asst_thesis_2 = {
      id: "asst_thesis_2",
      kind: "assistant",
      branchType: "正",
      text: "先处理，避免阻塞。",
      createdAt: "2026-04-24T03:11:00.000Z",
      parents: ["user_root_2"],
      children: [],
      meta: {
        label: "先处理",
        summary: "先把阻塞拿掉。"
      }
    };
    workspace.graph.nodes.asst_antithesis_2 = {
      id: "asst_antithesis_2",
      kind: "assistant",
      branchType: "反",
      text: "先不处理，保持主线。",
      createdAt: "2026-04-24T03:12:00.000Z",
      parents: ["user_root_2"],
      children: [],
      meta: {
        label: "先不动",
        summary: "别打断当前主线。"
      }
    };
    workspace.graph.edges.e7 = { id: "e7", from: "user_root_2", to: "asst_thesis_2", reason: "正" };
    workspace.graph.edges.e8 = { id: "e8", from: "user_root_2", to: "asst_antithesis_2", reason: "反" };
  }

  return workspace;
}

async function ensureBuildExists() {
  try {
    await access(buildIdPath, fsConstants.F_OK);
  } catch {
    throw new Error("Missing .next build output. Run `npm run build` before `npm run test:visual-dialogue`.");
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await wait(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startNextServer() {
  const child = spawn(
    "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", new URL(baseUrl).port],
    {
      cwd: repoRoot,
      env: {
        ...process.env
      },
      stdio: "pipe"
    }
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return { child, getStderr: () => stderr };
}

async function ensureNoHorizontalOverflow(page, viewportName) {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dialogue-shell"]');
    const doc = document.documentElement;
    const body = document.body;

    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      shellScrollWidth: shell instanceof HTMLElement ? shell.scrollWidth : null,
      shellClientWidth: shell instanceof HTMLElement ? shell.clientWidth : null
    };
  });

  const widthChecks = [
    metrics.docScrollWidth <= metrics.docClientWidth + 1,
    metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1,
    metrics.shellScrollWidth === null || metrics.shellScrollWidth <= metrics.shellClientWidth + 1
  ];

  if (widthChecks.includes(false)) {
    throw new Error(`Horizontal overflow detected on ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function assertRegionWidth(locator, viewportWidth, name) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} did not render`);
  }

  if (box.x < -1 || box.x + box.width > viewportWidth + 1) {
    throw new Error(`${name} overflowed horizontally: ${JSON.stringify(box)}`);
  }
}

async function assertRegionMinWidth(locator, minWidth, name) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${name} did not render`);
  }

  if (box.width < minWidth) {
    throw new Error(`${name} is too narrow: ${JSON.stringify(box)}`);
  }
}

async function ensureMobileComposerDoesNotCoverLineage(page) {
  const metrics = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="dialogue-composer"]');
    const lineageButtons = [...document.querySelectorAll('[data-testid="dialogue-sidebar"] button')];
    if (!(composer instanceof HTMLElement) || lineageButtons.length === 0) {
      return null;
    }

    const composerRect = composer.getBoundingClientRect();
    const overlappingButton = lineageButtons.find((button) => {
      if (!(button instanceof HTMLElement)) {
        return false;
      }
      const lineageRect = button.getBoundingClientRect();
      return (
        lineageRect.left < composerRect.right &&
        lineageRect.right > composerRect.left &&
        lineageRect.top < composerRect.bottom &&
        lineageRect.bottom > composerRect.top
      );
    });
    const lineageRect = overlappingButton instanceof HTMLElement
      ? overlappingButton.getBoundingClientRect()
      : lineageButtons[0] instanceof HTMLElement
        ? lineageButtons[0].getBoundingClientRect()
        : null;

    return {
      overlaps: Boolean(overlappingButton),
      composer: {
        top: composerRect.top,
        bottom: composerRect.bottom,
        height: composerRect.height
      },
      lineage: {
        top: lineageRect?.top,
        bottom: lineageRect?.bottom,
        height: lineageRect?.height
      }
    };
  });

  if (!metrics) {
    throw new Error("Missing mobile composer or lineage metrics");
  }

  if (metrics.overlaps) {
    throw new Error(`Mobile composer overlaps lineage controls: ${JSON.stringify(metrics)}`);
  }
}

async function getPageScrollMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dialogue-shell"]');
    const doc = document.documentElement;
    const body = document.body;
    const shellElement = shell instanceof HTMLElement ? shell : null;

    return {
      windowScrollY: window.scrollY,
      docScrollTop: doc.scrollTop,
      bodyScrollTop: body.scrollTop,
      shellScrollTop: shellElement?.scrollTop ?? null,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      shellScrollHeight: shellElement?.scrollHeight ?? null,
      shellClientHeight: shellElement?.clientHeight ?? null
    };
  });
}

async function resetPageScroll(page) {
  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dialogue-shell"]');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (shell instanceof HTMLElement) {
      shell.scrollTop = 0;
    }
  });
  await page.waitForTimeout(60);
  return getPageScrollMetrics(page);
}

async function ensureMobileCanScrollFromStage(page, viewportName) {
  const before = await resetPageScroll(page);
  const scrollableDistance = Math.max(
    before.docScrollHeight - before.docClientHeight,
    before.bodyScrollHeight - before.bodyClientHeight,
    before.shellScrollHeight && before.shellClientHeight
      ? before.shellScrollHeight - before.shellClientHeight
      : 0
  );

  if (scrollableDistance < 120) {
    throw new Error(`Mobile page does not expose enough vertical scroll on ${viewportName}: ${JSON.stringify(before)}`);
  }

  const stageViewport = page.getByTestId("dialogue-stage-viewport");
  const box = await stageViewport.boundingBox();
  if (!box) {
    throw new Error(`Missing stage viewport for mobile scroll check on ${viewportName}`);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 180));
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(80);

  const after = await getPageScrollMetrics(page);
  const beforePosition = Math.max(
    before.windowScrollY,
    before.docScrollTop,
    before.bodyScrollTop,
    before.shellScrollTop ?? 0
  );
  const afterPosition = Math.max(
    after.windowScrollY,
    after.docScrollTop,
    after.bodyScrollTop,
    after.shellScrollTop ?? 0
  );

  if (afterPosition <= beforePosition + 24) {
    throw new Error(`Mobile page did not scroll from the stage area on ${viewportName}: ${JSON.stringify({ before, after })}`);
  }
}

async function ensureTouchViewportSemantics(page) {
  const metrics = await page.evaluate(() => {
    const stageViewport = document.querySelector('[data-testid="dialogue-stage-viewport"]');
    if (!(stageViewport instanceof HTMLElement)) {
      return null;
    }

    return {
      touchAction: getComputedStyle(stageViewport).touchAction,
      pageText: document.body.textContent || ""
    };
  });

  if (!metrics) {
    throw new Error("Missing touch viewport metrics");
  }

  if (metrics.touchAction !== "pan-y") {
    throw new Error(`Touch viewport should allow pan-y scrolling: ${JSON.stringify(metrics)}`);
  }

  if (metrics.pageText.includes("整理舞台")) {
    throw new Error(`Touch viewport still shows fine-pointer hint: ${JSON.stringify(metrics)}`);
  }
}

async function ensureTouchNodeTapSelects(page) {
  await page.getByTestId("dialogue-stage-node-asst_thesis_1").tap();
  await page.getByRole("heading", { name: "继续" }).waitFor();
  await page
    .locator('[data-testid="dialogue-sidebar"] button[aria-current="true"]')
    .filter({ hasText: "继续" })
    .waitFor();
  await page.getByTestId("dialogue-stage-node-user_root_1").tap();
  await page.getByRole("heading", { name: /这个方向/ }).waitFor();
  await page
    .locator('[data-testid="dialogue-sidebar"] button[aria-current="true"]')
    .filter({ hasText: "这个方向" })
    .waitFor();
}

async function createScenarioPage(browser, workspace) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1
  });

  await context.addInitScript((snapshot) => {
    window.localStorage.setItem("anicca_workspace_v2", JSON.stringify(snapshot));
  }, workspace);

  const page = await context.newPage();
  const pageIssues = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      /hydration|did not match|server rendered|text content does not match/i.test(text)
    ) {
      pageIssues.push({
        type: `console:${message.type()}`,
        text
      });
    }
  });
  page.on("pageerror", (error) => {
    pageIssues.push({
      type: "pageerror",
      text: error.message
    });
  });

  await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });
  await page.getByTestId("dialogue-stage").waitFor();
  await page.getByTestId("dialogue-panel").waitFor();

  return { context, page, pageIssues };
}

function assertNoPageIssues(pageIssues, scenarioName) {
  if (pageIssues.length) {
    throw new Error(`Console or page errors detected during ${scenarioName}: ${JSON.stringify(pageIssues, null, 2)}`);
  }
}

async function mockDeferredSynthesis(page) {
  let releaseResponse;
  const responseReady = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  let requestId = null;

  await page.route("**/api/synthesis", async (route) => {
    const body = route.request().postDataJSON();
    requestId = body.requestId;
    await responseReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId,
        synthesis: {
          text: "保留主线，但拆开节奏。",
          summary: "主线收束",
          label: "收束",
          stance: "合"
        }
      })
    });
  });

  return {
    release: () => releaseResponse(),
    getRequestId: () => requestId
  };
}

async function ensureActiveElement(page, expected) {
  const active = await page.evaluate(() => ({
    id: document.activeElement?.id || "",
    testId: document.activeElement?.getAttribute("data-testid") || "",
    text: document.activeElement?.textContent || ""
  }));

  if (
    active.id !== expected.id &&
    active.testId !== expected.testId &&
    (expected.text ? !active.text.includes(expected.text) : true)
  ) {
    throw new Error(`Unexpected active element: ${JSON.stringify({ active, expected })}`);
  }
}

async function ensureSynthesisPendingFocusFlow(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, createWorkspaceWithoutSynthesis());
  const synthesis = await mockDeferredSynthesis(page);

  await page.getByRole("button", { name: "记录合流" }).click();
  await page.getByRole("button", { name: "收束中..." }).waitFor();
  if (!synthesis.getRequestId()) {
    throw new Error("Synthesis request did not start during pending flow scenario");
  }
  synthesis.release();
  await page.getByRole("heading", { name: "一次正反合流" }).waitFor();
  await ensureActiveElement(page, { id: "conversation-panel-heading" });
  assertNoPageIssues(pageIssues, "synthesis pending focus flow");
  await context.close();

  return { name: "synthesis-pending-focus", passed: true };
}

async function ensureSynthesisStaleCompletionDoesNotStealFocus(browser) {
  const { context, page, pageIssues } = await createScenarioPage(
    browser,
    createWorkspaceWithoutSynthesis({ includeSecondRoot: true })
  );
  const synthesis = await mockDeferredSynthesis(page);

  await page.getByRole("button", { name: "记录合流" }).click();
  await page.getByRole("button", { name: "收束中..." }).waitFor();
  await page.getByTestId("dialogue-sidebar").getByRole("button", { name: /另一个问题/ }).click();
  await page.getByRole("heading", { name: /另一个问题/ }).waitFor();
  synthesis.release();
  await page.getByTestId("dialogue-flow-status").waitFor();
  await page.getByTestId("dialogue-flow-status").filter({ hasText: "合流已生成，当前焦点保持不变。" }).waitFor();
  await page.getByRole("heading", { name: /另一个问题/ }).waitFor();
  assertNoPageIssues(pageIssues, "synthesis stale completion focus flow");
  await context.close();

  return { name: "synthesis-stale-completion", passed: true };
}

async function ensureRoundtableDrawerReturnsFocus(browser) {
  const { context, page, pageIssues } = await createScenarioPage(browser, seededWorkspace);
  await page.route("**/api/roundtable", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: body.requestId,
        state: {
          topic: "roundtable topic",
          participants: [],
          rounds: [],
          currentQuestion: "q1",
          nextQuestion: "作为追问继续的问题",
          lastCoreTension: "核心张力",
          status: "active"
        }
      })
    });
  });

  await page.getByRole("button", { name: "召集圆桌讨论此节点" }).click();
  await page.getByTestId("dialogue-roundtable-drawer").waitFor();
  await ensureActiveElement(page, { testId: "dialogue-roundtable-drawer" });
  await page.keyboard.press("Escape");
  await page.getByTestId("dialogue-roundtable-drawer").waitFor({ state: "detached" });
  await ensureActiveElement(page, { text: "召集圆桌讨论此节点" });
  assertNoPageIssues(pageIssues, "roundtable drawer focus return");
  await context.close();

  return { name: "roundtable-drawer-focus-return", passed: true };
}

async function runInteractionScenarios(browser) {
  return [
    await ensureSynthesisPendingFocusFlow(browser),
    await ensureSynthesisStaleCompletionDoesNotStealFocus(browser),
    await ensureRoundtableDrawerReturnsFocus(browser)
  ];
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height
    },
    deviceScaleFactor: 1,
    hasTouch: Boolean(viewport.hasTouch),
    isMobile: Boolean(viewport.isMobile)
  });

  await context.addInitScript((snapshot) => {
    window.localStorage.setItem("anicca_workspace_v2", JSON.stringify(snapshot));
  }, seededWorkspace);

  if (viewport.hasTouch) {
    await context.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query.includes("pointer: coarse")) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() {
              return true;
            }
          };
        }

        return originalMatchMedia(query);
      };
    });
  }

  const page = await context.newPage();
  const pageIssues = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" ||
      /hydration|did not match|server rendered|text content does not match/i.test(text)
    ) {
      pageIssues.push({
        type: `console:${message.type()}`,
        text
      });
    }
  });
  page.on("pageerror", (error) => {
    pageIssues.push({
      type: "pageerror",
      text: error.message
    });
  });

  await page.goto(`${baseUrl}/dialogue`, { waitUntil: "networkidle" });

  const stage = page.getByTestId("dialogue-stage");
  const panel = page.getByTestId("dialogue-panel");
  const composer = page.getByTestId("dialogue-composer");
  const sidebar = page.getByTestId("dialogue-sidebar");
  const workspaceBar = page.getByTestId("dialogue-workspace-bar");

  await stage.waitFor();
  await panel.waitFor();
  await composer.waitFor();
  await sidebar.waitFor();
  await workspaceBar.waitFor();

  await ensureNoHorizontalOverflow(page, viewport.name);
  await assertRegionWidth(stage, viewport.width, `${viewport.name} stage`);
  await assertRegionWidth(panel, viewport.width, `${viewport.name} panel`);
  await assertRegionWidth(composer, viewport.width, `${viewport.name} composer`);
  await assertRegionWidth(workspaceBar, viewport.width, `${viewport.name} workspace bar`);

  const captures = {};

  if (viewport.name.startsWith("mobile")) {
    const initialScrollMetrics = await resetPageScroll(page);
    const initialScreenshotPath = path.join(outputDir, `${viewport.name}-initial.png`);
    await page.screenshot({ path: initialScreenshotPath, fullPage: false });
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: false });
    captures.initial = {
      screenshotPath: initialScreenshotPath,
      scrollMetrics: initialScrollMetrics
    };

    await assertRegionMinWidth(
      workspaceBar,
      viewport.width - 28,
      `${viewport.name} workspace bar`
    );

    const mobileMetrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="dialogue-shell"]');
      if (!(shell instanceof HTMLElement)) {
        return null;
      }

      return {
        overflowY: getComputedStyle(shell).overflowY,
        scrollHeight: shell.scrollHeight,
        clientHeight: shell.clientHeight
      };
    });

    if (!mobileMetrics) {
      throw new Error("Missing shell metrics for mobile viewport");
    }

    if (mobileMetrics.overflowY === "hidden") {
      throw new Error(`Mobile shell is not scrollable: ${JSON.stringify(mobileMetrics)}`);
    }

    await ensureMobileComposerDoesNotCoverLineage(page);
    await ensureMobileCanScrollFromStage(page, viewport.name);
  }

  if (viewport.hasTouch) {
    await ensureTouchViewportSemantics(page);
  }

  if (viewport.hasTouch) {
    await ensureTouchNodeTapSelects(page);
  }

  await composer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);

  if (pageIssues.length) {
    throw new Error(`Console or page errors detected on ${viewport.name}: ${JSON.stringify(pageIssues, null, 2)}`);
  }

  const screenshotPath = viewport.name.startsWith("mobile")
    ? path.join(outputDir, `${viewport.name}-initial.png`)
    : path.join(outputDir, `${viewport.name}.png`);
  if (viewport.name.startsWith("mobile")) {
    const composerScreenshotPath = path.join(outputDir, `${viewport.name}-composer.png`);
    const composerScrollMetrics = await getPageScrollMetrics(page);
    await page.screenshot({ path: composerScreenshotPath, fullPage: false });
    captures.composer = {
      screenshotPath: composerScreenshotPath,
      scrollMetrics: composerScrollMetrics
    };
  } else {
    await page.screenshot({ path: screenshotPath, fullPage: viewport.fullPage });
  }
  await context.close();

  return {
    name: viewport.name,
    viewport: {
      width: viewport.width,
      height: viewport.height
    },
    screenshotPath,
    ...(Object.keys(captures).length ? { captures } : {})
  };
}

async function main() {
  await ensureBuildExists();
  await mkdir(outputDir, { recursive: true });

  const { child, getStderr } = startNextServer();

  const shutdown = () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };

  process.on("exit", shutdown);
  process.on("SIGINT", () => {
    shutdown();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(143);
  });

  try {
    await waitForServer(`${baseUrl}/dialogue`);
    const browser = await chromium.launch({ headless: true });
    const results = [];

    for (const viewport of viewports) {
      results.push(await runViewport(browser, viewport));
    }

    const interactionScenarios = await runInteractionScenarios(browser);

    await browser.close();
    await writeFile(
      path.join(outputDir, "summary.json"),
      JSON.stringify(
        {
          baseUrl,
          generatedAt: new Date().toISOString(),
          viewports: results,
          interactionScenarios
        },
        null,
        2
      )
    );
  } catch (error) {
    shutdown();
    const stderr = getStderr().trim();
    if (stderr) {
      console.error(stderr);
    }
    throw error;
  }

  shutdown();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
