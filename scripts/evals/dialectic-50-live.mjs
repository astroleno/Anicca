import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = process.env.ANICCA_EVAL_BASE_URL || process.argv[2] || "http://127.0.0.1:3060";
const outputDir = path.resolve(process.env.ANICCA_EVAL_OUTPUT_DIR || "artifacts/dialectic-50-live/latest");
const evalMode = (process.env.ANICCA_EVAL_MODE || "live").trim().toLowerCase();
const retryDelayMs = 1200;

if (!["live", "mock"].includes(evalMode)) {
  throw new Error(`ANICCA_EVAL_MODE must be "live" or "mock", received "${evalMode}"`);
}

const iterationBatches = [
  { name: "baseline", note: "验证 API 的基本 JSON contract 和模型遵循度。" },
  { name: "decision-criteria", note: "观察输出是否会自然给出判断标准，而不只是泛泛建议。" },
  { name: "constraint-aware", note: "观察正反是否能同时呈现代价、约束和权衡。" },
  { name: "operational", note: "观察合流是否能落到下一步行动。" },
  { name: "final-tightening", note: "观察 label/summary 是否适合紧凑 UI 展示。" }
];

const cases = [
  { domain: "product", userText: "这个对话产品应该先做成个人工具，还是先做成协作空间？" },
  { domain: "product", userText: "要不要把本地 workspace 导出做成第一优先级？" },
  { domain: "product", userText: "用户第一次进入时，该不该直接展示 demo workspace？" },
  { domain: "product", userText: "正反合流程要保持严格结构，还是允许自由聊天打断？" },
  { domain: "product", userText: "是否应该加入账号系统来同步不同设备的思考记录？" },
  { domain: "product", userText: "应该把合流做成自动建议，还是必须由用户主动触发？" },
  { domain: "product", userText: "产品要不要加入公开分享链接？" },
  { domain: "product", userText: "是否要把历史上下文检索默认开启？" },
  { domain: "product", userText: "主入口应该保留视觉舞台，还是先简化成文字树？" },
  { domain: "product", userText: "要不要为每个分支生成一句短标签？" },

  { domain: "design", userText: "界面应该更安静克制，还是更具流动的视觉表现？" },
  { domain: "design", userText: "节点应该像泡泡一样漂浮，还是像严格图谱一样排布？" },
  { domain: "design", userText: "移动端应该优先展示舞台，还是优先展示当前文本？" },
  { domain: "design", userText: "应该隐藏高级设置，还是给重度用户一开始就看到？" },
  { domain: "design", userText: "合流按钮要不要在正反生成后立即出现？" },
  { domain: "design", userText: "是否应该弱化颜色，避免用户把正反理解成好坏？" },
  { domain: "design", userText: "舞台拖拽布局要不要自动保存？" },
  { domain: "design", userText: "是否需要为长文本节点提供折叠视图？" },
  { domain: "design", userText: "新主题入口应该在底部 composer，还是舞台中心？" },
  { domain: "design", userText: "应该把检索上下文 preview 暴露给普通用户吗？" },

  { domain: "engineering", userText: "下一步应该优先补 API 测试，还是补 visual smoke？" },
  { domain: "engineering", userText: "是否应该继续用 localStorage，而不是引入 IndexedDB？" },
  { domain: "engineering", userText: "图结构状态应该集中在 store，还是拆到 domain service？" },
  { domain: "engineering", userText: "是否要把 prompt 构建函数从 API route 中抽出来？" },
  { domain: "engineering", userText: "要不要把 OpenAI Responses 和 Chat Completions 的差异封装得更深？" },
  { domain: "engineering", userText: "是否应该为 workspace import 加更严格的 schema 校验？" },
  { domain: "engineering", userText: "视觉 shader 页面要不要继续留在主仓库？" },
  { domain: "engineering", userText: "是否应该为 retrieval context 建立 golden snapshot？" },
  { domain: "engineering", userText: "路由错误要不要统一成 providerErrors 一套？" },
  { domain: "engineering", userText: "是否应该将 graphify 更新纳入代码变更流程？" },

  { domain: "strategy", userText: "这个项目应该先追求真实用户反馈，还是先完成自洽的艺术表达？" },
  { domain: "strategy", userText: "要不要把 Anicca 定位成思考工具，而不是 AI 聊天应用？" },
  { domain: "strategy", userText: "是否应该先支持中文体验，再考虑英文国际化？" },
  { domain: "strategy", userText: "该不该公开路线图来吸引早期共创者？" },
  { domain: "strategy", userText: "要不要围绕佛教概念做强叙事？" },
  { domain: "strategy", userText: "是否应该把产品做成研究原型，而不是商业 SaaS？" },
  { domain: "strategy", userText: "下一阶段应该聚焦对话质量，还是聚焦视觉记忆点？" },
  { domain: "strategy", userText: "是否该先找十个深度用户长期试用？" },
  { domain: "strategy", userText: "要不要把本地数据永不上传作为核心承诺？" },
  { domain: "strategy", userText: "是否应该做一个极简公开 demo 来解释正反合？" },

  { domain: "personal", userText: "我现在应该继续推进这个项目，还是暂停一周重新判断？" },
  { domain: "personal", userText: "要不要同时做代码实现和写作表达？" },
  { domain: "personal", userText: "是否应该减少功能想象，先把一个路径打磨到顺？" },
  { domain: "personal", userText: "我该更相信直觉审美，还是更依赖用户反馈？" },
  { domain: "personal", userText: "要不要把每天的思考都记录进这个系统？" },
  { domain: "personal", userText: "当一个分支没有明显答案时，应该继续追问还是先停？" },
  { domain: "personal", userText: "我应该把复杂性藏在系统里，还是让用户看见它？" },
  { domain: "personal", userText: "是否应该给这个项目设定明确发布日期？" },
  { domain: "personal", userText: "要不要删除那些已经过时的实验页面？" },
  { domain: "personal", userText: "下一次迭代应该从哪里开始？" }
];

function batchForIndex(index) {
  return Math.floor(index / 10);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(route, body) {
  const url = `${baseUrl}${route}`;
  const totalStartedAt = performance.now();
  let lastResult = null;
  const attempts = [];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const text = await response.text();
      const elapsedMs = Math.round(performance.now() - startedAt);
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (error) {
        json = { parseError: error.message, rawText: text };
      }

      lastResult = {
        route,
        status: response.status,
        ok: response.ok,
        attempt,
        elapsedMs,
        json
      };
      attempts.push(lastResult);

      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) {
        return {
          ...lastResult,
          attempts,
          totalElapsedMs: Math.round(performance.now() - totalStartedAt)
        };
      }
    } catch (error) {
      lastResult = {
        route,
        status: 0,
        ok: false,
        attempt,
        elapsedMs: Math.round(performance.now() - startedAt),
        json: {
          error: "network_error",
          details: error.message
        }
      };
      attempts.push(lastResult);
    }

    if (attempt < 3) {
      await wait(retryDelayMs * attempt);
    }
  }

  return lastResult
    ? {
        ...lastResult,
        attempts,
        totalElapsedMs: Math.round(performance.now() - totalStartedAt)
      }
    : null;
}

function validateBranch(branch, stance) {
  const problems = [];
  if (!branch || typeof branch !== "object") {
    return [`${stance}: branch missing`];
  }
  if (branch.stance !== stance) problems.push(`${stance}: stance mismatch`);
  if (typeof branch.text !== "string" || !branch.text.trim()) problems.push(`${stance}: text missing`);
  if (typeof branch.summary !== "string" || !branch.summary.trim()) problems.push(`${stance}: summary missing`);
  if (typeof branch.label !== "string" || !branch.label.trim()) problems.push(`${stance}: label missing`);
  return problems;
}

function hasRedundantStanceSuffix(label, stance) {
  if (typeof label !== "string" || label === stance || !label.endsWith(stance)) {
    return false;
  }

  if (stance === "合" && ["结合", "整合", "融合", "综合", "配合", "适合", "合流"].some((suffix) => label.endsWith(suffix))) {
    return false;
  }

  return true;
}

function qualityWarnings(branch, name) {
  if (!branch || typeof branch !== "object") return [];
  const warnings = [];
  if (typeof branch.summary === "string" && branch.summary.includes("\n")) {
    warnings.push(`${name}: summary contains newline`);
  }
  if (typeof branch.label === "string" && Array.from(branch.label).length > 8) {
    warnings.push(`${name}: label longer than 8 chars`);
  }
  if (typeof branch.label === "string" && !/[\u3400-\u9fff]/u.test(branch.label)) {
    warnings.push(`${name}: label has no CJK characters`);
  }
  const stance = name === "thesis" ? "正" : name === "antithesis" ? "反" : "合";
  if (hasRedundantStanceSuffix(branch.label, stance)) {
    warnings.push(`${name}: label repeats stance suffix`);
  }
  if (typeof branch.text === "string" && branch.text.length > 900) {
    warnings.push(`${name}: text longer than 900 chars`);
  }
  return warnings;
}

function validateRecord(record) {
  const problems = [];
  const warnings = [];

  if (!record.branchesResponse?.ok) {
    problems.push(`branches HTTP ${record.branchesResponse?.status ?? "missing"}`);
  }

  const thesis = record.branchesResponse?.json?.thesis;
  const antithesis = record.branchesResponse?.json?.antithesis;
  problems.push(...validateBranch(thesis, "正"));
  problems.push(...validateBranch(antithesis, "反"));
  warnings.push(...qualityWarnings(thesis, "thesis"));
  warnings.push(...qualityWarnings(antithesis, "antithesis"));

  if (!record.synthesisResponse?.ok) {
    problems.push(`synthesis HTTP ${record.synthesisResponse?.status ?? "missing"}`);
  }

  const synthesis = record.synthesisResponse?.json?.synthesis;
  problems.push(...validateBranch(synthesis, "合"));
  warnings.push(...qualityWarnings(synthesis, "synthesis"));

  return {
    ok: problems.length === 0,
    problems,
    warnings
  };
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function summarizeLatencies(values) {
  if (!values.length) {
    return { average: 0, p50: 0, p95: 0, max: 0 };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio) => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
  return {
    average: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1]
  };
}

function toMarkdown(summary, records) {
  const isMock = summary.mode === "mock";
  const lines = [
    `# Dialectic 50 ${isMock ? "Mock" : "Live"} Test Record`,
    "",
    `- Started at: ${summary.startedAt}`,
    `- Finished at: ${summary.finishedAt}`,
    `- Base URL: ${summary.baseUrl}`,
    "- Target: local Next API (`/api/branches` + `/api/synthesis`)",
    isMock
      ? "- Method: HTTP integration test with a deterministic local OpenAI-compatible mock provider"
      : "- Method: HTTP integration test with real provider responses",
    `- Total cases: ${summary.totalCases}`,
    `- Passed: ${summary.passed}/${summary.totalCases}`,
    `- Failed: ${summary.failed}/${summary.totalCases}`,
    `- Quality warnings: ${summary.warningCount}`,
    `- Retried records: ${summary.retryCount}`,
    `- Branch end-to-end latency: avg ${summary.latencyMs.branches.average}ms / p50 ${summary.latencyMs.branches.p50}ms / p95 ${summary.latencyMs.branches.p95}ms / max ${summary.latencyMs.branches.max}ms`,
    `- Synthesis end-to-end latency: avg ${summary.latencyMs.synthesis.average}ms / p50 ${summary.latencyMs.synthesis.p50}ms / p95 ${summary.latencyMs.synthesis.p95}ms / max ${summary.latencyMs.synthesis.max}ms`,
    `- Slow requests > ${Math.round(summary.slowRequestThresholdMs / 1000)}s: ${summary.slowRequests.length}`,
    "",
    "## Iteration Batches",
    "",
    "| Batch | Strategy | Cases | Note |",
    "| --- | --- | ---: | --- |",
    ...summary.batches.map((batch) => `| ${batch.batch} | ${batch.name} | ${batch.cases.length} | ${escapeCell(batch.note)} |`),
    "",
    "## Records",
    "",
    "| # | Domain | Input | Branches | Synthesis | Contract | Warnings |",
    "| ---: | --- | --- | --- | --- | --- | --- |",
    ...records.map((record) => {
      const thesis = record.branchesResponse?.json?.thesis;
      const antithesis = record.branchesResponse?.json?.antithesis;
      const synthesis = record.synthesisResponse?.json?.synthesis;
      return [
        record.index,
        record.domain,
        record.userText,
        record.branchesResponse?.ok
          ? `正=${thesis?.label || "(no label)"} / 反=${antithesis?.label || "(no label)"}`
          : `HTTP ${record.branchesResponse?.status ?? "missing"}`,
        record.synthesisResponse?.ok ? `合=${synthesis?.label || "(no label)"}` : `HTTP ${record.synthesisResponse?.status ?? "missing"}`,
        record.validation.ok ? "pass" : record.validation.problems.join("; "),
        record.validation.warnings.join("; ")
      ]
        .map(escapeCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |");
    }),
    "",
    "## Findings",
    "",
    ...summary.findings.map((finding, index) => `${index + 1}. ${finding}`)
  ];

  return `${lines.join("\n")}\n`;
}

function buildSummary(startedAt, finishedAt, records) {
  const passed = records.filter((record) => record.validation.ok).length;
  const warningCount = records.reduce((sum, record) => sum + record.validation.warnings.length, 0);
  const branchLatencies = records
    .map((record) => record.branchesResponse?.totalElapsedMs || record.branchesResponse?.elapsedMs || 0)
    .filter(Boolean);
  const synthesisLatencies = records
    .map((record) => record.synthesisResponse?.totalElapsedMs || record.synthesisResponse?.elapsedMs || 0)
    .filter(Boolean);
  const latencyMs = {
    branches: summarizeLatencies(branchLatencies),
    synthesis: summarizeLatencies(synthesisLatencies)
  };
  const slowRequestThresholdMs = 60_000;
  const slowRequests = records
    .flatMap((record) => [
      {
        index: record.index,
        route: "branches",
        totalElapsedMs: record.branchesResponse?.totalElapsedMs || record.branchesResponse?.elapsedMs || 0
      },
      {
        index: record.index,
        route: "synthesis",
        totalElapsedMs: record.synthesisResponse?.totalElapsedMs || record.synthesisResponse?.elapsedMs || 0
      }
    ])
    .filter((request) => request.totalElapsedMs > slowRequestThresholdMs)
    .sort((left, right) => right.totalElapsedMs - left.totalElapsedMs);

  const failedRecords = records.filter((record) => !record.validation.ok);
  const warningRecords = records.filter((record) => record.validation.warnings.length);
  const retriedRecords = records
    .filter((record) => (record.branchesResponse?.attempt || 1) > 1 || (record.synthesisResponse?.attempt || 1) > 1)
    .map((record) => ({
      index: record.index,
      requestId: record.requestId,
      branchesAttempt: record.branchesResponse?.attempt || 1,
      synthesisAttempt: record.synthesisResponse?.attempt || 1
    }));
  const findings = [];
  if (failedRecords.length) {
    findings.push(`有 ${failedRecords.length} 组未通过 contract，需要优先查看 records.json 中的 validation.problems。`);
  } else {
    findings.push(`50 组 ${evalMode} API contract 全部通过，输出均包含正、反、合三类结构化分支。`);
  }
  if (warningRecords.length) {
    findings.push(`有 ${warningRecords.length} 组出现 UI 质量警告，主要关注 label 长度、label 可读性、label 立场冗余、summary 换行或文本过长。`);
  } else {
    findings.push("未发现 label 长度、label 可读性、label 立场冗余、summary 换行或文本过长的 UI 质量警告。");
  }
  if (retriedRecords.length) {
    findings.push(
      evalMode === "mock"
        ? `有 ${retriedRecords.length} 组从 mock 限流注入中通过 HTTP 重试恢复成功。`
        : `有 ${retriedRecords.length} 组通过重试恢复成功，应继续追踪 provider 结构漂移。`
    );
  } else {
    findings.push("没有请求触发重试。");
  }
  if (slowRequests.length) {
    findings.push(`有 ${slowRequests.length} 个请求超过 ${Math.round(slowRequestThresholdMs / 1000)} 秒，应继续追踪 provider 长尾延迟。`);
  } else {
    findings.push(`没有请求超过 ${Math.round(slowRequestThresholdMs / 1000)} 秒。`);
  }
  findings.push(
    `端到端延迟：branches avg ${latencyMs.branches.average}ms / p95 ${latencyMs.branches.p95}ms / max ${latencyMs.branches.max}ms；` +
      `synthesis avg ${latencyMs.synthesis.average}ms / p95 ${latencyMs.synthesis.p95}ms / max ${latencyMs.synthesis.max}ms。`
  );
  findings.push(
    evalMode === "mock"
      ? "Mock 结果只验证应用 HTTP、重试、结构校验与统计链路，不代表真实 Provider 的内容质量、失败率或延迟。"
      : "后续迭代建议优先把 live eval 纳入回归流程，并单独追踪 provider 失败率与结构漂移率。"
  );

  return {
    startedAt,
    finishedAt,
    mode: evalMode,
    baseUrl,
    outputDir,
    totalCases: records.length,
    passed,
    failed: records.length - passed,
    warningCount,
    retryCount: retriedRecords.length,
    retriedRecords,
    slowRequestThresholdMs,
    slowRequests,
    latencyMs,
    averageLatencyMs: {
      branches: latencyMs.branches.average,
      synthesis: latencyMs.synthesis.average
    },
    batches: iterationBatches.map((batch, index) => ({
      batch: index + 1,
      name: batch.name,
      note: batch.note,
      cases: records.filter((record) => record.batch === index + 1).map((record) => record.index)
    })),
    findings
  };
}

async function runCase(item, index) {
  const batchIndex = batchForIndex(index);
  const batch = iterationBatches[batchIndex];
  const requestId = `${evalMode}-dialectic-50-${String(index + 1).padStart(3, "0")}`;
  const branchesBody = {
    requestId,
    userText: item.userText,
    contextMessages: [
      {
        role: "system",
        content: `${evalMode} eval batch ${batchIndex + 1}: ${batch.name}; ${batch.note}`
      }
    ]
  };

  const branchesResponse = await postJson("/api/branches", branchesBody);
  let synthesisResponse = null;

  if (branchesResponse?.ok) {
    const thesis = branchesResponse.json?.thesis;
    const antithesis = branchesResponse.json?.antithesis;
    synthesisResponse = await postJson("/api/synthesis", {
      requestId: `${requestId}-synthesis`,
      thesis,
      antithesis,
      contextMessages: [
        { role: "user", content: `母题：${item.userText}` },
        {
          role: "assistant",
          content: `正：${thesis?.summary || thesis?.text || ""}\n反：${antithesis?.summary || antithesis?.text || ""}`
        }
      ]
    });
  }

  const record = {
    index: index + 1,
    requestId,
    batch: batchIndex + 1,
    strategy: batch.name,
    domain: item.domain,
    userText: item.userText,
    branchesRequest: branchesBody,
    branchesResponse,
    synthesisResponse,
    validation: null
  };
  record.validation = validateRecord(record);
  return record;
}

async function main() {
  const startedAt = new Date().toISOString();
  const records = [];

  fs.mkdirSync(outputDir, { recursive: true });

  for (let index = 0; index < cases.length; index += 1) {
    const record = await runCase(cases[index], index);
    records.push(record);
    fs.writeFileSync(path.join(outputDir, "records.partial.json"), `${JSON.stringify(records, null, 2)}\n`);
    console.log(
      `[${record.index}/${cases.length}] ${record.validation.ok ? "pass" : "fail"} ${record.requestId} ` +
        `branches=${record.branchesResponse?.status ?? "n/a"} synthesis=${record.synthesisResponse?.status ?? "n/a"}`
    );
  }

  const finishedAt = new Date().toISOString();
  const summary = buildSummary(startedAt, finishedAt, records);

  fs.writeFileSync(path.join(outputDir, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "records.jsonl"), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "summary.md"), toMarkdown(summary, records));
  fs.rmSync(path.join(outputDir, "records.partial.json"), { force: true });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
