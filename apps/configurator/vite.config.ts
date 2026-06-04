import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  server: {
    host: "::",
    port: 8081,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@echarging/pricing-engine": path.resolve(__dirname, "../../packages/pricing-engine/src"),
      "@echarging/api-client": path.resolve(__dirname, "../../packages/api-client/src"),
      "@echarging/ui-kit": path.resolve(__dirname, "../../packages/ui-kit/src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
});
