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
});
