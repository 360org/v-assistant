import fs from "node:fs";

const version = process.env.RELEASE_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  throw new Error("RELEASE_VERSION must be a semantic version such as 0.1.2.");
}

const tauriConfig = "src-tauri/tauri.conf.json";
const config = JSON.parse(fs.readFileSync(tauriConfig, "utf8"));
config.version = version;
fs.writeFileSync(tauriConfig, `${JSON.stringify(config, null, 2)}\n`);
