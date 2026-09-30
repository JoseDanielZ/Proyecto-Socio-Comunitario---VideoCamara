import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// En desarrollo, /api se reenvía al backend (FastAPI en el puerto 8000): el navegador ve un solo origen.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
  test: {
    pool: "threads", // el pool por defecto (procesos hijos) se cuelga en algunos Windows
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    css: false,
  },
});
