#!/usr/bin/env node
/**
 * Bảo vệ luồng UX cốt lõi: tải → cài → đăng nhập bằng tài khoản AI → chat.
 *
 * Sau khi đăng nhập, kết nối được lưu ở trạng thái "Pending test" trong lúc
 * smoke test chạy nền. Trước đây danh sách model chỉ hiện khi trạng thái là
 * "Verified", nên người dùng đăng nhập xong lại thấy 0 model và không chat
 * được (issue #19 trên macOS, #16). Chỉ cần một lần test chập chờn — rate
 * limit, 5xx tạm thời, model dò đã bị nhà cung cấp gỡ — là app thành vô dụng.
 *
 * Test này khoá hành vi đúng: "Pending test" vẫn phục vụ model, chỉ kết nối bị
 * smoke test từ chối ("Failed") mới bị ẩn.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sidecarPath = path.resolve(import.meta.dirname, "..", "ai-router", "src", "sidecar.mjs");
const source = fs.readFileSync(sidecarPath, "utf8");

// 1. Cổng lọc dùng chung phải tồn tại và mang ngữ nghĩa phủ định.
assert.ok(
  source.includes("function isUsableConnection("),
  "Thiếu helper isUsableConnection dùng chung cho mọi cổng lọc kết nối",
);
assert.match(
  source,
  /isUsableConnection\(connection\)\s*\{[\s\S]*?testStatus !== "Failed"/,
  'isUsableConnection phải loại trừ theo "Failed", không đòi "Verified"',
);

// 2. Không còn cổng nào đòi "Verified" — đó là thứ đã chặn model sau khi login.
const verifiedGates = source.match(/testStatus [!=]== "Verified"/g) || [];
assert.equal(
  verifiedGates.length,
  0,
  `Còn ${verifiedGates.length} cổng đòi "Verified"; kết nối vừa đăng nhập sẽ lại không có model`,
);

// 3. Cả danh mục model tĩnh lẫn động đều đi qua cổng lọc dùng chung.
for (const fn of ["function modelsForConnections", "async function allModelsForConnections"]) {
  const start = source.indexOf(fn);
  assert.ok(start > -1, `Không tìm thấy ${fn}`);
  const body = source.slice(start, start + 1400);
  assert.ok(
    body.includes("isUsableConnection"),
    `${fn} không dùng cổng lọc dùng chung`,
  );
}

// 4. Danh mục lấy từ nhà cung cấp hỏng không được xoá sạch model tĩnh.
const allModelsStart = source.indexOf("async function allModelsForConnections");
const allModelsBody = source.slice(allModelsStart, allModelsStart + 900);
assert.match(
  allModelsBody,
  /try\s*\{[\s\S]*dynamicModelsForConnection[\s\S]*\}\s*catch/,
  "Lỗi tải danh mục động phải được nuốt để giữ lại model tĩnh",
);

console.log("✓ đăng nhập xong là có model để chat (Pending test vẫn phục vụ; chỉ Failed bị ẩn)");
