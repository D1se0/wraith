import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" (relative) so the exact same build works unmodified whether
// it's served from a domain root (self-hosted via server/index.js) or
// from a GitHub Pages project subpath (https://<user>.github.io/wraith/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
