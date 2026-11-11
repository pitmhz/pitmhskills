import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

// The Hono server serves web/dist and injects the write token; there is no Vite dev server.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwind()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
