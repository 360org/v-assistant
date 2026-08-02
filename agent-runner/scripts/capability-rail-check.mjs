import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/capability-rail.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});

const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const writeTool = {
  name: "file_write",
  description: "Write content to a file",
  input_schema: { type: "object", properties: {} },
};
const readTool = {
  name: "file_read",
  description: "Read content from a file",
  input_schema: { type: "object", properties: {} },
};
const connectorTool = {
  name: "connector_request",
  description: "Call a credentialed connector",
  input_schema: { type: "object", properties: {} },
};
const capabilities = [
  mod.capabilityFromTool(writeTool, "native"),
  mod.capabilityFromTool(readTool, "native"),
  mod.capabilityFromTool(connectorTool, "native"),
];

assert.equal(capabilities[0].side_effect, true, "file_write là thao tác có side effect");
assert.equal(capabilities[0].requires_approval, false, "file_write trong workspace không cần duyệt thêm");
assert.equal(capabilities[1].side_effect, false, "file_read không có side effect");
assert.equal(capabilities[2].requires_approval, true, "connector_request phải cần người dùng duyệt");
assert(mod.searchCapabilities(capabilities, "write").includes("file_write"), "search_capabilities phải tìm được tool ghi");
assert.equal(mod.sideEffectDenied(capabilities[0], false), null, "tool ghi workspace được chạy theo idea gốc");
assert.equal(mod.sideEffectDenied(capabilities[2], false).is_error, true, "connector phải bị chặn khi chưa duyệt");
assert.equal(mod.sideEffectDenied(capabilities[2], true), null, "connector đã duyệt phải được chạy tiếp");

console.log("Capability rail OK: tìm capability đúng và chỉ bắt duyệt hành động outward-facing");
