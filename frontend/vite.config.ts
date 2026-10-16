import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: process.env.APP_BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.FRONTEND_API_TARGET || 'http://127.0.0.1:3410' } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
