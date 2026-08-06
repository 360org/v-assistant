#!/usr/bin/env node
import assert from "node:assert/strict";

const manifest = JSON.parse(process.env.UPDATER_MANIFEST_JSON || "{}");
const platforms = manifest.platforms || {};

for (const target of ["darwin-aarch64", "darwin-x86_64", "linux-x86_64", "windows-x86_64"]) {
  assert.ok(platforms[target], `missing ${target}`);
  assert.match(platforms[target].url, /^https:\/\/github\.com\//, `${target} must use browser download URL`);
  assert.ok(platforms[target].signature?.trim(), `missing signature for ${target}`);
}

assert.match(platforms["linux-x86_64"].url, /AppImage/i, "Linux updater should use AppImage");
assert.match(platforms["windows-x86_64"].url, /setup\.exe/i, "Windows updater should use NSIS setup exe");
console.log("✓ updater manifest covers macOS, Linux, and Windows");
