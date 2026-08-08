#!/usr/bin/env node
/**
 * Callback của mọi nhà cung cấp OAuth phải có nơi hứng trong bản đóng gói.
 *
 * Google chỉ đăng ký một loopback duy nhất cho client kế thừa:
 * http://localhost:1420/callback. Cổng 1420 là Vite dev server — khi chạy dev
 * thì chính ứng dụng phục vụ /callback nên đăng nhập chạy được. Nhưng bản
 * đóng gói chạy từ origin WebView của Tauri: không có gì lắng nghe ở 1420, nên
 * Google đẩy trình duyệt tới một cổng chết và mã uỷ quyền không bao giờ quay
 * lại (issue #11 — "Lỗi 400: invalid_request", và cùng cụm #12/#14).
 *
 * Codex và xAI đã có relay riêng; Gemini là nhà cung cấp duy nhất còn thiếu.
 * Test này khởi động sidecar thật, gọi authorize rồi kiểm tra relay đã hứng và
 * chuyển hướng đúng — chứ không chỉ so chuỗi redirect_uri như trước.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Cổng riêng để không tranh chấp với sidecar khác đang chạy.
const PORT = Number(process.env.RELAY_CHECK_PORT || 36377);
const baseUrl = `http://127.0.0.1:${PORT}/v1`;
const RELAY_PORT = 1420;

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

async function reachable() {
  try {
    await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

const sidecar = path.join(repoRoot, "ai-router/src/sidecar.mjs");
if (!existsSync(sidecar)) throw new Error(`Không tìm thấy sidecar tại ${sidecar}`);

const child = spawn(process.execPath, [sidecar], {
  cwd: path.join(repoRoot, "ai-router"),
  env: { ...process.env, AI_ROUTER_PORT: String(PORT) },
  stdio: ["ignore", "ignore", "pipe"],
});
let stderr = "";
child.stderr.on("data", (c) => { stderr += String(c); });
process.on("exit", () => child.kill());

let ready = false;
for (let i = 0; i < 40; i++) {
  if (child.exitCode !== null) {
    throw new Error(`Sidecar thoát sớm (mã ${child.exitCode}):\n${stderr.trim()}`);
  }
  if (await reachable()) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 250));
}
if (!ready) {
  child.kill();
  throw new Error(`Sidecar không sẵn sàng trên cổng ${PORT}:\n${stderr.trim()}`);
}

// Địa chỉ ứng dụng muốn được trả về sau khi hứng callback (phải là /callback
// theo hợp đồng validateLocalCallbackUri).
const RETURN_URI = "http://127.0.0.1:1421/callback";

const authorize = await fetch(`${baseUrl}/oauth/authorize`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ provider: "antigravity", redirectUri: RETURN_URI }),
});
const payload = await authorize.json();

check("authorize trả về thành công", authorize.ok);
check(
  "Gemini vẫn dùng đúng loopback Google đã đăng ký",
  payload.redirectUri === `http://localhost:${RELAY_PORT}/callback`,
);

// Điểm mấu chốt: phải có thứ gì đó thật sự lắng nghe ở 1420 để hứng mã.
let relayResponse = null;
try {
  relayResponse = await fetch(
    `http://127.0.0.1:${RELAY_PORT}/callback?code=TEST_CODE&state=xyz`,
    { redirect: "manual", signal: AbortSignal.timeout(3000) },
  );
} catch (error) {
  check(`relay lắng nghe ở cổng ${RELAY_PORT} (${error?.message ?? error})`, false);
}

if (relayResponse) {
  check(`relay lắng nghe ở cổng ${RELAY_PORT}`, true);
  check("relay chuyển hướng thay vì nuốt mã", relayResponse.status === 302);
  const location = relayResponse.headers.get("location") || "";
  check("chuyển đúng về ứng dụng", location.startsWith(RETURN_URI));
  check("giữ nguyên mã uỷ quyền", location.includes("code=TEST_CODE"));
}

child.kill();
console.log(pass ? "\n✓ callback OAuth có nơi hứng ở bản đóng gói" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
