import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROUTER_SRC = "/Volumes/DATA/DEV/9router";
const ROUTER_DEST = path.resolve(import.meta.dirname, "../ai-router/core");

// 1. Pull the latest code from 9router
console.log("🔄 Pulling latest code from 9router...");
try {
  execSync("git pull", { cwd: ROUTER_SRC, stdio: "inherit" });
} catch (error) {
  console.warn("⚠️ Failed to git pull 9router. Using local 9router files.", error.message);
}

// 2. Synchronize open-sse folder
const srcOpenSse = path.join(ROUTER_SRC, "open-sse");
const destOpenSse = path.join(ROUTER_DEST, "open-sse");

console.log(`📦 Syncing ${srcOpenSse} -> ${destOpenSse}...`);

function copyRecursive(src, dest, exclude = []) {
  if (exclude.includes(path.basename(src))) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file), exclude);
    }
  } else {
    // Check if the file is different or doesn't exist
    let shouldCopy = true;
    let newContent = null;
    const isCode = src.endsWith(".js") || src.endsWith(".mjs");

    if (isCode) {
      let content = fs.readFileSync(src, "utf8");
      const relativeToNative = path.relative(path.dirname(dest), path.join(destOpenSse, "native"));

      // Replace all instances of "@/lib/" with the relative path to native folder
      content = content.replace(/@\/lib\//g, `${relativeToNative}/`);

      // Fix named imports from "node-machine-id" which fails in Node ESM
      content = content.replace(
        /import\s+\{\s*machineIdSync\s*\}\s+from\s+["']node-machine-id["'];/g,
        'import pkgNodeMachineId from "node-machine-id";\nconst machineIdSync = pkgNodeMachineId.machineIdSync || pkgNodeMachineId;'
      );

      newContent = content;
    }

    if (fs.existsSync(dest)) {
      if (isCode) {
        const destContent = fs.readFileSync(dest, "utf8");
        if (destContent === newContent) {
          shouldCopy = false;
        }
      } else {
        const srcBuf = fs.readFileSync(src);
        const destBuf = fs.readFileSync(dest);
        if (srcBuf.equals(destBuf)) {
          shouldCopy = false;
        }
      }
    }

    if (shouldCopy) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (isCode) {
        fs.writeFileSync(dest, newContent, "utf8");
        console.log(`  📄 Copied & Custom Mapped: ${path.relative(ROUTER_SRC, src)}`);
      } else {
        fs.copyFileSync(src, dest);
        console.log(`  📄 Copied: ${path.relative(ROUTER_SRC, src)}`);
      }
    }
  }
}

// Files/folders in v-assistant/ai-router/core/open-sse that should NOT be touched/deleted
const LOCAL_ONLY = ["native", "kimi-coding.js"];

copyRecursive(srcOpenSse, destOpenSse, LOCAL_ONLY);

// Remove files in destination that no longer exist in source (excluding LOCAL_ONLY)
function pruneOrphans(destDir, srcDir) {
  if (!fs.existsSync(destDir)) return;
  const files = fs.readdirSync(destDir);
  for (const file of files) {
    if (LOCAL_ONLY.includes(file)) continue;

    const destPath = path.join(destDir, file);
    const srcPath = path.join(srcDir, file);

    if (!fs.existsSync(srcPath)) {
      const stats = fs.statSync(destPath);
      if (stats.isDirectory()) {
        fs.rmSync(destPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(destPath);
      }
      console.log(`  🗑️ Pruned orphan: ${path.relative(ROUTER_DEST, destPath)}`);
    } else {
      const destStats = fs.statSync(destPath);
      if (destStats.isDirectory()) {
        pruneOrphans(destPath, srcPath);
      }
    }
  }
}

pruneOrphans(destOpenSse, srcOpenSse);

console.log("✅ 9router synchronization completed successfully!");
