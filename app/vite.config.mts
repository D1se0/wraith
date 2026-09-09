import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Wraith renderer: base "./" so the built index.html loads correctly via
// Electron's file:// protocol in the packaged app (loadFile), not just
// through the dev server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
