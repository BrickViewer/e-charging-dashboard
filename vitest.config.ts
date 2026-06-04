import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./apps/admin/src/test/setup.ts"],
    include: [
      "apps/**/*.{test,spec}.{ts,tsx}",
      "packages/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/admin/src"),
      "@echarging/pricing-engine": path.resolve(__dirname, "./packages/pricing-engine/src"),
      "@echarging/api-client": path.resolve(__dirname, "./packages/api-client/src"),
      "@echarging/ui-kit": path.resolve(__dirname, "./packages/ui-kit/src"),
    },
  },
});
