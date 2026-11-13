import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis", "process.env": "{}" },
  server: { port: 5174 },
  build: { chunkSizeWarningLimit: 1500 },
});
