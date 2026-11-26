// Local measurement wrapper for the built Next app. Ordinary Next handlers
// handle the request. Only the trace prefix receives an evaluation identifier.
import { createServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import next from "next";
const dir = process.cwd();
const port = Number(process.argv[2]);
const app = next({ dev: false, dir, hostname: "127.0.0.1", port });
const ids = new AsyncLocalStorage();
const info = console.info.bind(console);
console.info = (first, ...rest) => {
  const requestId = ids.getStore();
  if (typeof first === "string" && first.startsWith("anicca.generation ") && requestId) {
    const trace = JSON.parse(first.slice("anicca.generation ".length));
    info("anicca.generation " + JSON.stringify({ ...trace, evalRequestId: requestId }), ...rest);
    return;
  }
  info(first, ...rest);
};
app.prepare().then(() => {
  const handler = app.getRequestHandler();
  const server = createServer((req, res) => {
    const value = req.headers["x-anicca-eval-id"];
    ids.run(typeof value === "string" && /^[\w.:-]{1,128}$/.test(value) ? value : undefined, () => handler(req, res));
  });
  server.listen(port, "127.0.0.1", () => info("Eval server listening on " + port));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
