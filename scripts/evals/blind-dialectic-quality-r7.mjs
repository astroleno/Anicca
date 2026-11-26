import { createHash, randomInt } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { loadExam, readingBody } from "./dialectic-quality-r7.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const routes = ["branches", "synthesis"];

async function privateTarget(file) {
  const temp = await realpath("/tmp");
  const dir = await realpath(dirname(resolve(file)));
  if (!dir.startsWith(`${temp}${sep}`) || ((await lstat(dir)).mode & 0o077) !== 0) {
    throw new Error("Use a private subdirectory of /tmp (mktemp -d)");
  }
  return join(dir, basename(file));
}

async function readVersion(dir, item, route) {
  const record = await readJson(join(dir, "responses", `${item.id}-${route}.json`));
  const response = record.attempts.at(-1);
  if (record.id !== item.id || record.route !== route || response.pending) {
    throw new Error(`Incomplete response: ${item.id} ${route}`);
  }
  const { requestId, ...frozenBody } = response.body;
  if (JSON.stringify(frozenBody) !== JSON.stringify(item.requests[route])) {
    throw new Error(`Request did not match frozen input: ${item.id} ${route}`);
  }
  if (!response.reading) return { outcome: "unavailable" };
  const json = JSON.parse(response.rawBody);
  if (json.requestId !== requestId) throw new Error(`Wrong response request ID: ${item.id} ${route}`);
  return readingBody(route, json);
}

export async function makeBlind(cases, read, coin = () => randomInt(2)) {
  const packets = [];
  const mapping = {};
  for (const item of cases) {
    const order = coin() === 0 ? [0, 1] : [1, 0];
    const answers = await Promise.all(order.map(async (index) =>
      Object.fromEntries(await Promise.all(routes.map(async (route) => [route, await read(index, item, route)])))));
    const { sources, connectionInput } = item.requests.synthesis;
    packets.push({ id: item.id, question: item.question,
      sources: sources.map(({ label, stance, text }) => ({ label, stance, text })),
      ...(connectionInput ? { connectionInput } : {}),
      A: answers[0], B: answers[1] });
    mapping[item.id] = { A: order[0], B: order[1] };
  }
  return { packets, mapping };
}

async function main() {
  const { values } = parseArgs({ options: {
    first: { type: "string" }, second: { type: "string" },
    packet: { type: "string" }, key: { type: "string" }
  } });
  if (!values.first || !values.second || !values.packet || !values.key) {
    throw new Error("Use --first RUN_DIR --second RUN_DIR --packet PRIVATE_TMP/PACKET.json --key OTHER_PRIVATE_TMP/KEY.json");
  }
  const packet = await privateTarget(values.packet);
  const key = await privateTarget(values.key);
  if (dirname(packet) === dirname(key)) throw new Error("Keep packet and key in distinct private directories");
  const dirs = [values.first, values.second];
  const settings = await Promise.all(dirs.map((dir) => readJson(join(dir, "settings.json"))));
  const { cases, examSha256 } = await loadExam();
  const [first, second] = settings;
  if (settings.some((config) => config.examSha256 !== examSha256) ||
      JSON.stringify(first.settings) !== JSON.stringify(second.settings) ||
      JSON.stringify(first.transport) !== JSON.stringify(second.transport)) {
    throw new Error("Runs must share the frozen exam and model/transport settings");
  }
  const { packets, mapping } = await makeBlind(cases, (index, item, route) => readVersion(dirs[index], item, route));
  const packetJson = JSON.stringify(packets, null, 2) + "\n";
  const keyJson = { packetSha256: createHash("sha256").update(packetJson).digest("hex"),
    versions: settings.map(({ run, revision }) => ({ run, revision })), mapping };
  await writeFile(key, JSON.stringify(keyJson, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await writeFile(packet, packetJson, { mode: 0o600, flag: "wx" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
