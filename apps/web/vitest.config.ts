/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { IOptionalBrowserSettings } from "happy-dom";

// happy-dom fetches a <link rel="stylesheet"> it is given, and the Built on
// Brainstorm line links one (ADR 0101). Tests never reach a real network: the
// sheet is skipped, quietly, as if it had loaded. Checked against happy-dom's
// own settings type, since vitest 2's copy of it predates the second setting.
const happyDOMSettings = {
  disableCSSFileLoading: true,
  handleDisabledFileLoadingAsSuccess: true,
} satisfies IOptionalBrowserSettings;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    environmentOptions: { happyDOM: { settings: happyDOMSettings } },
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
