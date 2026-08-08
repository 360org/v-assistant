#!/usr/bin/env node
/**
 * Smoke test bản desktop đã build: mở app thật rồi kiểm nó tự dựng đủ hạ tầng.
 *
 * Đây chính là thứ người dùng báo hỏng ở #7 ("không thể khởi động AI Router và
 * Agent Runner") và #8/#9 (cài xong không mở được). Trước đây không kiểm chứng
 * được vì tưởng cần màn hình thật; thực ra `xvfb-run` là đủ — app chạy headless
 * bình thường.
 *
 * Test dựng app dưới màn hình ảo rồi khẳng định bốn điều mà một bản cài hỏng sẽ
 * trượt ngay:
 *   1. Tiến trình app sống, không thoát sớm.
 *   2. AI Router tự lên và trả /health (dùng Node runtime đóng gói kèm).
 *   3. Agent Runner được spawn.
 *   4. Hàng đợi IPC + Vault được tạo trong thư mục dữ liệu.
 *
 * Yêu cầu: đã `npm run build` và `cargo build` (hoặc dùng binary release), có
 * `xvfb-run`. Bỏ qua với mã 0 nếu thiếu — để không làm đỏ máy dev không có GUI.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary =
  process.env.VUA_DESKTOP_BINARY ||
  path.join(repoRoot, "src-tauri/target/debug/v-assistant");

function skip(reason) {
  console.log(`⊘ bỏ qua smoke desktop: ${reason}`);
  process.exit(0);
}

if (!existsSync(binary)) skip(`chưa có binary (${binary}). Chạy \`cargo build\` trong src-tauri.`);
if (spawnSync("which", ["xvfb-run"]).status !== 0) skip("thiếu xvfb-run");

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn(
  "xvfb-run",
  ["-a", "--server-args=-screen 0 1400x900x24", binary],
  { cwd: repoRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
app.stdout.on("data", (c) => { output += String(c); });
app.stderr.on("data", (c) => { output += String(c); });

/** Dừng app và mọi tiến trình con nó spawn. */
function stopAll() {
  try { process.kill(-app.pid, "SIGKILL"); } catch { /* đã chết */ }
  for (const pattern of ["ai-router/src/sidecar.mjs", "agent-runner/dist/index.js"]) {
    spawnSync("pkill", ["-9", "-f", pattern]);
  }
}
process.on("exit", stopAll);

// 1. App phải sống, không thoát sớm.
let routerUp = false;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  if (app.exitCode !== null) break;
  try {
    const response = await fetch("http://127.0.0.1:36360/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) { routerUp = true; break; }
  } catch { /* chưa lên, thử tiếp */ }
}

check("app desktop chạy được, không thoát sớm", app.exitCode === null);
check("AI Router tự khởi động và trả /health", routerUp);

// 2. Agent Runner phải được spawn (app tự làm, không cần thao tác nào).
const runnerPs = spawnSync("pgrep", ["-f", "agent-runner/dist/index.js"]);
check("Agent Runner được spawn", runnerPs.status === 0);

// 3. Cả hai phải chạy bằng Node đóng gói kèm, không phải Node cài trên máy —
//    đây là điều kiện để bản cài chạy trên máy người dùng không có Node.
const routerPs = spawnSync("pgrep", ["-af", "ai-router/src/sidecar.mjs"]);
check(
  "AI Router chạy bằng Node runtime đóng gói kèm",
  routerPs.status === 0 && /runtime[/\\]node[/\\]node/.test(String(routerPs.stdout)),
);

// 4. Thư mục dữ liệu phải có hàng đợi IPC và Vault.
let dataDir = "";
if (runnerPs.status === 0) {
  const pid = String(runnerPs.stdout).trim().split("\n")[0];
  try {
    const environ = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    dataDir = environ.find((e) => e.startsWith("VUA_DATA_DIR="))?.slice("VUA_DATA_DIR=".length) || "";
  } catch { /* không đọc được environ */ }
}
check("xác định được thư mục dữ liệu của runner", Boolean(dataDir));
if (dataDir) {
  for (const relative of ["ipc/inbound.db", "ipc/outbound.db", "vault.db"]) {
    check(`tạo ${relative}`, existsSync(path.join(dataDir, relative)));
  }
}

stopAll();
if (!pass) {
  console.log("\n--- log app ---");
  console.log(output.slice(-2000));
}
console.log(pass ? "\n✓ bản desktop tự dựng đủ AI Router, Agent Runner, IPC và Vault" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
