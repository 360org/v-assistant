import { readFile } from "node:fs/promises";

const [tauriConfig, runtime, workflow] = await Promise.all([
  readFile("src-tauri/tauri.conf.json", "utf8"),
  readFile("src-tauri/src/runtime.rs", "utf8"),
  readFile(".github/workflows/release.yml", "utf8"),
]);

const assertions = [
  [
    tauriConfig.includes('"../runtime/node/**/*"'),
    "Tauri must include the bundled Node runtime resource",
  ],
  [
    runtime.includes("pub fn resolve_project_dir") && runtime.includes('join("_up_")'),
    "desktop runtime must resolve Tauri's _up_ resource layout",
  ],
  [
    runtime.includes('join("runtime/node/node")'),
    "AI Router must prefer its bundled Node runtime",
  ],
  [
    workflow.includes("Bundle Node runtime for AI Router"),
    "macOS release workflow must bundle Node",
  ],
  [
    workflow.includes("Install AI Router runtime dependencies")
      && workflow.includes("npm ci --prefix ai-router"),
    "macOS release workflow must install AI Router dependencies from its lockfile",
  ],
  [
    workflow.includes("Verify packaged AI Router runtime")
      && workflow.includes("ai-router/node_modules/undici/package.json"),
    "macOS release workflow must inspect AI Router dependencies in the packaged app",
  ],
];

for (const [condition, message] of assertions) {
  if (!condition) throw new Error(message);
}

console.log("desktop bundle contract passed: resource layout, Node runtime, CI artifact check");
