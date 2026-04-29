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
  { name: "mobile-390", width: 390, height: 844, fullPage: true }
];

const seededWorkspace = {
  schemaVersion: "anicca-workspace-v2",
  workspaceSessionId: "ws_visual_smoke",
  focusedNodeId: "asst_synthesis_1",
  composerParentId: "asst_synthesis_1",
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

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height
    },
    deviceScaleFactor: 1
  });

  await context.addInitScript((snapshot) => {
    window.localStorage.setItem("anicca_workspace_v2", JSON.stringify(snapshot));
  }, seededWorkspace);

  const page = await context.newPage();
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

  if (viewport.name.startsWith("mobile")) {
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
  }

  await composer.scrollIntoViewIfNeeded();
  const screenshotPath = path.join(outputDir, `${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: viewport.fullPage });
  await context.close();

  return {
    name: viewport.name,
    viewport: {
      width: viewport.width,
      height: viewport.height
    },
    screenshotPath
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

    await browser.close();
    await writeFile(
      path.join(outputDir, "summary.json"),
      JSON.stringify(
        {
          baseUrl,
          generatedAt: new Date().toISOString(),
          viewports: results
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
