// The guide content seam (Story 84 / ADR 0081 §1): production wires the
// raw-glob load once at module scope; tests inject fixtures via the provider.
import { createContext, useContext, type ReactNode } from "react";
import { loadGuide, type GuideContent } from "./load";

// Vite inlines every authored entry at build time; the guide ships with the
// bundle and changes only through the gated story process.
const rawModules = import.meta.glob("./content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const PRODUCTION_GUIDE: GuideContent = loadGuide(rawModules);

const GuideCtx = createContext<GuideContent>(PRODUCTION_GUIDE);

export function GuideProvider({
  value,
  children,
}: {
  value: GuideContent;
  children: ReactNode;
}) {
  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

export function useGuide(): GuideContent {
  return useContext(GuideCtx);
}
