#!/usr/bin/env node
/**
 * Đăng nhập lần đầu phải tạo tài khoản local user.
 *
 * Luồng chuẩn là "tải → cài → đăng nhập bằng tài khoản AI (tạo local user) →
 * chat". Hồ sơ local được tạo trong `connectProvider`: nó hỏi nhà cung cấp xem
 * tài khoản là ai (`fetchVendorAccount`) rồi ghi `user` nếu chưa có. Nếu một
 * lối đăng nhập nào đó quên gọi `connectProvider`, người dùng vào ứng dụng mà
 * không có hồ sơ nào — mất danh tính, mất luôn phần "Powered by VuaAI.net" ở
 * cụm user.
 *
 * Test khoá hai điều:
 *  1. Mọi lối đăng nhập đều đi qua `connectProvider`.
 *  2. Tra cứu danh tính hỏng cũng vẫn tạo được hồ sơ (không để trống tên).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const store = fs.readFileSync(path.join(root, "src", "lib", "store.tsx"), "utf8");
const onboarding = fs.readFileSync(path.join(root, "src", "pages", "Onboarding.tsx"), "utf8");

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// --- 1. Hồ sơ được tạo ở đúng một nơi, và chỉ tạo lần đầu -------------------
check(
  "connectProvider tạo hồ sơ local khi chưa có",
  /user: s\.user \?\? \{/.test(store),
);
check(
  "tên hồ sơ có đường lui khi không tra được danh tính",
  /name: account\?\.label \?\? getProvider\(provider\)\.name/.test(store),
);
check(
  "hồ sơ được lưu bền (nằm trong state lưu xuống đĩa)",
  /user: LocalUser \| null;/.test(store),
);

// --- 2. Mọi lối đăng nhập đều đi qua connectProvider ------------------------
// Lối một chạm và lối dán callback thủ công nằm trong Onboarding.
const onboardingCalls = (onboarding.match(/await connectProvider\(/g) || []).length;
check(
  `Onboarding gọi connectProvider ở mọi lối đăng nhập (thấy ${onboardingCalls})`,
  onboardingCalls >= 3,
);
// Lối quay lại từ trang đăng nhập trên web được store xử lý.
check(
  "lối OAuth quay lại trên web cũng tạo hồ sơ trước khi báo cho UI",
  /completeOAuthReturn\(\)[\s\S]{0,400}?await connectProvider\(/.test(store),
);

// Lối "dùng thử không cần tài khoản" không đi qua connectProvider, nên phải tự
// tạo hồ sơ. Quên bước này thì App (`!onboarded || !user`) đá người dùng ngược
// về Onboarding và nút "Start chatting" trông như nút hỏng: bấm không đi đâu.
const finishBody = onboarding.match(/const finish = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
check(
  "lối dùng thử không tài khoản cũng tạo hồ sơ local trước khi vào ứng dụng",
  /ensureLocalUser\(/.test(finishBody),
);
check(
  "hồ sơ được tạo TRƯỚC khi hoàn tất onboarding, không phải sau",
  finishBody.indexOf("ensureLocalUser(") > -1 &&
    finishBody.indexOf("ensureLocalUser(") < finishBody.indexOf("completeOnboarding("),
);
// App vẫn phải đòi có hồ sơ mới cho vào — đây là điều kiện khiến lỗi trên xuất
// hiện, nên khoá lại để test không xanh giả nếu điều kiện bị gỡ.
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
check(
  "App chỉ vào màn hình chính khi đã có hồ sơ local",
  /if \(!onboarded \|\| !user\)/.test(app),
);

// --- 3. Tra cứu danh tính: hỏng thì trả null, không ném ---------------------
const entry = `export { fetchVendorAccount } from "../src/runtime/oauth.ts";`;
fs.writeFileSync("scripts/.local-user-entry.mjs", entry);
const outfile = "scripts/.local-user-bundle.mjs";
await build({
  entryPoints: ["scripts/.local-user-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
globalThis.window = { location: { origin: "http://localhost:1420" } };
const { fetchVendorAccount } = await import(pathToFileURL(outfile).href);

// Nhà cung cấp trả lỗi: phải trả null để store dùng đường lui, không ném.
globalThis.fetch = async () => new Response("nope", { status: 500 });
let threw = false;
let result;
try {
  result = await fetchVendorAccount("openrouter", "sk-test");
} catch {
  threw = true;
}
check("tra cứu danh tính hỏng thì không ném lỗi", !threw);
check("hỏng thì trả null để hồ sơ dùng tên đường lui", result === null);

// Mạng chết hẳn cũng vậy.
globalThis.fetch = async () => { throw new Error("fetch failed"); };
threw = false;
try {
  result = await fetchVendorAccount("openrouter", "sk-test");
} catch {
  threw = true;
}
check("mất mạng cũng không ném lỗi", !threw);

// Nhà cung cấp trả danh tính: phải lấy đúng nhãn.
globalThis.fetch = async () =>
  new Response(JSON.stringify({ data: { label: "chaulb@icloud.com", limit: 10, usage: 2 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const ok = await fetchVendorAccount("openrouter", "sk-test");
check("lấy đúng danh tính tài khoản khi tra cứu thành công", ok?.label === "chaulb@icloud.com");

fs.rmSync("scripts/.local-user-entry.mjs", { force: true });
fs.rmSync(outfile, { force: true });

assert.ok(pass, "local user creation contract failed");
console.log("\n✓ đăng nhập lần đầu tạo được tài khoản local user");
