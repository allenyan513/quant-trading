import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// `@/*` resolves to the package root (same as the package's tsconfig alias), so the ported
// components/pages keep their `@/components/...` / `@/lib/...` imports unchanged.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  server: { port: 3001 },
  preview: { port: 3001 },
});
