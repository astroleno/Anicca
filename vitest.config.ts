import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: true,
    maxWorkers: 2,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    exclude: ["node_modules/**", "ref/**", "artifacts/**", ".worktrees/**", "**/.worktrees/**"]
  }
});
