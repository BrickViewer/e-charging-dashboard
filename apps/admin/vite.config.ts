import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  // Tweede entry: redirect.html is de MSAL-popup-redirect-URI.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        redirect: path.resolve(__dirname, "redirect.html"),
      },
    },
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@echarging/pricing-engine": path.resolve(__dirname, "../../packages/pricing-engine/src"),
      "@echarging/api-client": path.resolve(__dirname, "../../packages/api-client/src"),
      "@echarging/ui-kit": path.resolve(__dirname, "../../packages/ui-kit/src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
