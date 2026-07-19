import fs from "node:fs";

const version = process.env.RELEASE_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  throw new Error("RELEASE_VERSION must be a semantic version such as 0.1.2.");
}

function updateJson(path, mutate) {
  const value = JSON.parse(fs.readFileSync(path, "utf8"));
  mutate(value);
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

updateJson("src-tauri/tauri.conf.json", (config) => {
  config.version = version;
});

updateJson("package.json", (manifest) => {
  manifest.version = version;
});

updateJson("package-lock.json", (lockfile) => {
  lockfile.version = version;
  if (lockfile.packages?.[""]) lockfile.packages[""].version = version;
});

const cargoToml = "src-tauri/Cargo.toml";
const cargo = fs.readFileSync(cargoToml, "utf8");
const updatedCargo = cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`);
if (updatedCargo === cargo) throw new Error("Could not update the application version in src-tauri/Cargo.toml.");
fs.writeFileSync(cargoToml, updatedCargo);
