import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      "/auth": "http://localhost:8787",
      "/api": "http://localhost:8787",
    },
  },
  // `vite preview` inherits `server.proxy` by default, which would forward
  // /auth/* and /api/* to the dev API server. The visual-regression harness
  // (ADR 0039) serves the production build via `vite preview` and intercepts
  // those requests in Playwright, so the preview server must NOT proxy: a
  // proxied /auth/welcome (a client route) hits a dead API and 500s instead of
  // falling back to the SPA index.html. Empty the proxy for preview only; dev
  // is unaffected.
  preview: {
    proxy: {},
  },
});
