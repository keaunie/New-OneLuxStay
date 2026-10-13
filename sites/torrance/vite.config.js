import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

// Standalone build for torrance.oneluxstay.com. Lives inside the main repo so it can
// reuse its dependencies, but builds to its own folder and deploys as its own Cloudflare site.
export default defineConfig({
  root,
  plugins: [react()],
  server: { port: 5176 },
  preview: { port: 4176 },
  build: { outDir: path.join(root, "dist"), emptyOutDir: true },
});
