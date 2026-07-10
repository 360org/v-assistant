import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Demo build: everything inlined so `npm run build:demo` produces a single
// self-contained HTML file that runs anywhere (no server, no network).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Demo mode: simulate the vendor sign-in round-trip and force the preview
  // engine, since the artifact sandbox blocks external OAuth/network.
  define: {
    "import.meta.env.VITE_DEMO": JSON.stringify("1"),
  },
  build: {
    outDir: "dist-demo",
    // Inline all assets (the logo) as data URIs inside the JS bundle.
    assetsInlineLimit: 1_000_000,
    modulePreload: { polyfill: false },
  },
});
