import http from "node:http";

const hostname = process.env.ANICCA_MOCK_PROVIDER_HOST || "127.0.0.1";
const port = Number(process.env.ANICCA_MOCK_PROVIDER_PORT || process.argv[2] || 4061);
const rateLimitStart = Number(process.env.ANICCA_MOCK_RATE_LIMIT_START || 11);
const rateLimitCount = Number(process.env.ANICCA_MOCK_RATE_LIMIT_COUNT || 3);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid mock provider port: ${port}`);
}

let providerRequestCount = 0;

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function completionPayload(prompt) {
  if (prompt.includes('schema={"thesis"')) {
    return {
      thesis: {
        text: "先用可逆的小步实验推进，在有限范围内验证价值、成本与真实反馈，再决定是否扩大投入。",
        summary: "以低成本试验验证价值后再扩大投入。",
        label: "小步验证",
        stance: "正"
      },
      antithesis: {
        text: "先暂停扩张并明确资源、风险和退出条件，避免在关键约束尚不清楚时积累返工。",
        summary: "先澄清关键约束与退出条件再投入。",
        label: "约束优先",
        stance: "反"
      }
    };
  }

  if (prompt.includes('schema={"synthesis"')) {
    return {
      synthesis: {
        text: "设定一个有期限、可撤销且指标明确的试验，同时写清资源上限与停止条件；到期后用证据决定继续、调整或暂停。",
        summary: "用有边界的短周期试验连接行动与约束。",
        label: "双轨试验",
        stance: "合"
      }
    };
  }

  return null;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${hostname}:${port}`}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, providerRequestCount });
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
    sendJson(response, 404, { error: { message: "mock route not found", type: "invalid_request_error" } });
    return;
  }

  if (request.headers.authorization !== "Bearer mock-key") {
    sendJson(response, 401, { error: { message: "invalid mock API key", type: "authentication_error" } });
    return;
  }

  providerRequestCount += 1;
  const shouldRateLimit =
    rateLimitCount > 0 &&
    providerRequestCount >= rateLimitStart &&
    providerRequestCount < rateLimitStart + rateLimitCount;

  if (shouldRateLimit) {
    sendJson(response, 429, { error: { message: "mock rate limit", type: "rate_limit_error" } });
    return;
  }

  try {
    const body = await readJson(request);
    const prompt = Array.isArray(body.messages)
      ? body.messages.map((message) => (typeof message?.content === "string" ? message.content : "")).join("\n")
      : "";
    const content = completionPayload(prompt);

    if (!content) {
      sendJson(response, 400, {
        error: { message: "mock could not identify the requested schema", type: "invalid_request_error" }
      });
      return;
    }

    sendJson(response, 200, {
      id: `chatcmpl-mock-${providerRequestCount}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: typeof body.model === "string" ? body.model : "gemini-mock",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(content) },
          finish_reason: "stop"
        }
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
  } catch (error) {
    sendJson(response, 400, {
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "invalid_request_error"
      }
    });
  }
});

server.listen(port, hostname, () => {
  console.log(`Mock OpenAI-compatible provider listening on http://${hostname}:${port}`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
