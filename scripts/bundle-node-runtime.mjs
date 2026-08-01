import { copyFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const VERSION = "24.18.0";
const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
if (process.platform !== "darwin" || !arch) {
  throw new Error("build:local only supports macOS arm64 and x64.");
}

const target = join("runtime", "node", "node");
if (existsSync(target)) {
  console.log(`Bundled Node runtime already exists: ${target}`);
  process.exit(0);
}

const archive = `node-v${VERSION}-darwin-${arch}`;
const temp = await mkdtemp(join(tmpdir(), "v-assistant-node-"));
try {
  const download = join(temp, "node.tar.gz");
  execFileSync("curl", ["--fail", "--location", "--retry", "3", `https://nodejs.org/dist/v${VERSION}/${archive}.tar.gz`, "-o", download], { stdio: "inherit" });
  execFileSync("tar", ["-xzf", download, "-C", temp], { stdio: "inherit" });
  await mkdir(join("runtime", "node"), { recursive: true });
  await copyFile(join(temp, archive, "bin", "node"), target);
  console.log(`Bundled Node ${VERSION} for macOS ${arch}.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
