#!/usr/bin/env node
/**
 * Lỗi nhà cung cấp phải đọc được, không phải JSON thô (issue #13).
 * Chuỗi Deepseek dưới đây là nguyên văn người dùng báo lại.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const entry = `export { friendlyProviderError } from "../src/runtime/providerErrors.ts";`;
writeFileSync("scripts/.provider-error-entry.mjs", entry);
const outfile = "scripts/.provider-error-bundle.mjs";
await build({
  entryPoints: ["scripts/.provider-error-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
const { friendlyProviderError } = await import(pathToFileURL(outfile).href);

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// Nguyên văn lỗi trong issue #13.
const deepseek =
  '{"error":{"message":"[402]: {\\"error\\":{\\"message\\":\\"Insufficient Balance\\",\\"type\\":\\"unknown_error\\",\\"param\\":null,\\"code\\":\\"invalid_request_error\\"}}","type":"billing_error","code":"payment_required"}}';
const out = friendlyProviderError(deepseek, "Deepseek");
check("hết số dư → câu tiếng Việt", out.includes("hết số dư") && out.includes("Deepseek"));
check("không lộ JSON thô ra UI", !out.includes("{") && !out.includes('"error"'));

check(
  "401 → key không hợp lệ",
  friendlyProviderError('{"error":{"message":"Invalid API key"}}', "OpenAI").includes("không hợp lệ"),
);
check(
  "429 → giới hạn tốc độ",
  friendlyProviderError("[429]: rate limit exceeded", "Claude").includes("giới hạn tốc độ"),
);
check(
  "5xx → máy chủ sự cố",
  friendlyProviderError("HTTP 503 Service Unavailable", "Gemini").includes("sự cố"),
);
check(
  "404 → model không còn",
  friendlyProviderError('{"error":{"message":"model not found"}}', "Gemini").includes("không còn"),
);
check(
  "mạng hỏng → nhắc kiểm tra mạng",
  friendlyProviderError("fetch failed", "Deepseek").includes("Kiểm tra mạng"),
);

// Không nhận ra thì vẫn phải trả câu sạch, không rỗng, không JSON.
const unknown = friendlyProviderError('{"error":{"message":"some novel failure"}}', "X");
check("lỗi lạ → vẫn sạch", unknown === "some novel failure");
check("rỗng → vẫn có câu", friendlyProviderError("", "Deepseek").includes("Deepseek"));

rmSync("scripts/.provider-error-entry.mjs", { force: true });
rmSync(outfile, { force: true });
assert.ok(pass, "provider error mapping failed");
console.log("\n✓ lỗi nhà cung cấp hiển thị dễ hiểu");
