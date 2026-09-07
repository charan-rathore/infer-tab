import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@infertab/trace-schema": path.resolve(
        __dirname,
        "../../packages/trace-schema/src/index.ts",
      ),
    },
  },
});
