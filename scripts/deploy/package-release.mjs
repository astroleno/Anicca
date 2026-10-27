import assert from "node:assert/strict";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.resolve(process.argv[2] || ".cache/deploy-release");
const distDir = process.env.ANICCA_NEXT_DIST_DIR || ".next";
const build = path.resolve(root, distDir);
const { config } = JSON.parse(await readFile(path.join(build, "required-server-files.json"), "utf8"));
assert.equal(config.basePath, "/Anicca", "Build with NEXT_PUBLIC_BASE_PATH=/Anicca first");
assert.equal(process.platform, "linux", "Package the production runtime on Linux");
assert.equal(process.arch, "x64", "The Tencent instance uses Linux x64");
assert(output !== root && !root.startsWith(`${output}${path.sep}`), "Choose a separate release directory");
assert(!output.startsWith(`${build}${path.sep}`), "Keep the release outside the build directory");
await mkdir(output, { recursive: false });

// Next's tracing may include local dotenv files. Secrets live in the service's
// EnvironmentFile and must never be bundled with a release or public assets.
const filter = source => !/^\.env(?:\.|$)/.test(path.basename(source));
await cp(path.join(build, "standalone"), output, { recursive: true, filter });
await cp(path.join(build, "static"), path.join(output, distDir, "static"), { recursive: true, filter });
await mkdir(path.join(output, distDir, "cache"), { recursive: true });
if (await stat(path.join(root, "public")).then(() => true, () => false)) {
  await cp(path.join(root, "public"), path.join(output, "public"), { recursive: true, filter });
}
const manifest = {
  application: "Anicca", basePath: config.basePath, platform: process.platform, arch: process.arch,
  nextVersion: JSON.parse(await readFile(path.join(root, "node_modules/next/package.json"), "utf8")).version,
  buildId: (await readFile(path.join(build, "BUILD_ID"), "utf8")).trim(), builtAt: new Date().toISOString()
};
await writeFile(path.join(output, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, ...manifest }));
