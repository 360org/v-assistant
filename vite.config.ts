import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite config tuned for Tauri development.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Prevent Vite from obscuring Rust errors.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it is taken.
    port: 1420,
    strictPort: true,
    watch: {
      // Don't watch the Rust side of the app.
      ignored: ["**/src-tauri/**"],
      // Poll when running in Docker (bind mounts don't emit fs events on
      // macOS/Windows). Enabled via the dev compose's CHOKIDAR_USEPOLLING.
      usePolling: Boolean(process.env.CHOKIDAR_USEPOLLING),
    },
  },
  // Env variables starting with TAURI_ENV_* are exposed for platform-specific builds.
  envPrefix: ["VITE_", "TAURI_ENV_"],
});
