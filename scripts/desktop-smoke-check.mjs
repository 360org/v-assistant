#!/usr/bin/env node
/**
 * Smoke test bản desktop đã build, chạy được trên cả macOS, Windows và Linux.
 *
 * Đây chính là thứ người dùng báo hỏng ở #7 ("không thể khởi động AI Router và
 * Agent Runner"), #8 (Windows 11 cài xong không mở được) và #9 (Linux). Trước
 * đây không có cách tái hiện vì tưởng phải có màn hình thật; thực ra trên Linux
 * chỉ cần `xvfb-run`, còn macOS/Windows runner đã có phiên đồ hoạ sẵn.
 *
 * Test mở app thật rồi khẳng định những điều một bản cài hỏng sẽ trượt ngay:
 *   1. Tiến trình app sống, không thoát sớm.
 *   2. AI Router tự lên và trả /health.
 *   3. Agent Runner sống — đo bằng nhịp tim `.heartbeat` còn mới, không phải
 *      chỉ "có tiến trình" (một runner treo vẫn còn tiến trình nhưng đã chết).
 *   4. Hàng đợi IPC và Vault được tạo trong thư mục dữ liệu của nền tảng.
 *
 * Thiếu binary (hoặc thiếu xvfb trên Linux) thì bỏ qua với mã 0, để máy dev
 * chưa build không bị đỏ.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDENTIFIER = "com.vuaai.assistant";
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

/** Nơi Tauri đặt dữ liệu ứng dụng trên từng nền tảng. */
function appDataDir() {
  const home = os.homedir();
  if (isWindows) {
    return path.join(process.env.APPDATA || path.join(home, "AppData/Roaming"), IDENTIFIER);
  }
  if (isMac) return path.join(home, "Library/Application Support", IDENTIFIER);
  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local/share"), IDENTIFIER);
}

/** Binary đã build, theo quy ước của từng nền tảng. */
function defaultBinary() {
  if (process.env.VUA_DESKTOP_BINARY) return process.env.VUA_DESKTOP_BINARY;
  const base = path.join(repoRoot, "src-tauri/target/debug");
  if (isWindows) return path.join(base, "v-assistant.exe");
  return path.join(base, "v-assistant");
}

function skip(reason) {
  console.log(`⊘ bỏ qua smoke desktop: ${reason}`);
  process.exit(0);
}

const binary = defaultBinary();
if (!existsSync(binary)) skip(`chưa có binary (${binary}); chạy \`cargo build\` trong src-tauri`);

// Linux CI không có phiên đồ hoạ nên cần màn hình ảo; macOS/Windows đã có sẵn.
const needsXvfb = !isWindows && !isMac && !process.env.DISPLAY;
if (needsXvfb && spawnSync("which", ["xvfb-run"]).status !== 0) skip("Linux không có DISPLAY và thiếu xvfb-run");

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [command, args] = needsXvfb
  ? ["xvfb-run", ["-a", "--server-args=-screen 0 1400x900x24", binary]]
  : [binary, []];

const app = spawn(command, args, {
  cwd: repoRoot,
  detached: !isWindows,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
app.stdout.on("data", (c) => { output += String(c); });
app.stderr.on("data", (c) => { output += String(c); });

function stopAll() {
  try {
    if (isWindows) spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"]);
    else process.kill(-app.pid, "SIGKILL");
  } catch { /* đã thoát */ }
  if (isWindows) {
    for (const image of ["v-assistant.exe", "node.exe"]) {
      spawnSync("taskkill", ["/IM", image, "/F"], { stdio: "ignore" });
    }
  } else {
    for (const pattern of ["ai-router/src/sidecar.mjs", "agent-runner/dist/index.js"]) {
      spawnSync("pkill", ["-9", "-f", pattern], { stdio: "ignore" });
    }
  }
}
process.on("exit", stopAll);

// --- 1 & 2. App sống và AI Router tự lên -----------------------------------
let routerUp = false;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  if (app.exitCode !== null) break;
  try {
    const response = await fetch("http://127.0.0.1:36360/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) { routerUp = true; break; }
  } catch { /* chưa lên */ }
}
check("app desktop chạy được, không thoát sớm", app.exitCode === null);
check("AI Router tự khởi động và trả /health", routerUp);

// --- 3 & 4. Agent Runner sống, hạ tầng được tạo ----------------------------
const dataDir = path.join(appDataDir(), "runtime");
const heartbeat = path.join(dataDir, "ipc/.heartbeat");

// Chờ runner đập nhịp lần đầu.
let beat = false;
for (let i = 0; i < 40; i++) {
  if (existsSync(heartbeat)) { beat = true; break; }
  await sleep(1000);
}
check(`thư mục dữ liệu được tạo (${dataDir})`, existsSync(dataDir));
check("Agent Runner ghi nhịp tim", beat);

if (beat) {
  // Nhịp phải còn mới: một runner treo vẫn còn tiến trình nhưng ngừng đập.
  const age = Date.now() - statSync(heartbeat).mtimeMs;
  check(`nhịp tim còn mới (${Math.round(age / 1000)}s)`, age < 120_000);
}

for (const relative of ["ipc/inbound.db", "ipc/outbound.db", "vault.db"]) {
  check(`tạo ${relative}`, existsSync(path.join(dataDir, relative)));
}

stopAll();
if (!pass) {
  console.log("\n--- log app ---");
  console.log(output.slice(-2000));
}
console.log(
  pass
    ? `\n✓ bản desktop (${process.platform}) tự dựng đủ AI Router, Agent Runner, IPC và Vault`
    : `\n✗ FAILED trên ${process.platform}`,
);
process.exit(pass ? 0 : 1);
