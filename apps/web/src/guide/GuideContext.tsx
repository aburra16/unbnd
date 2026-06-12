// The guide content seam (Story 84 / ADR 0081 §1): production wires the
// raw-glob load once; tests inject fixtures. STUB (red): provider only.
import { createContext, useContext, type ReactNode } from "react";
import type { GuideContent } from "./load";

const GuideCtx = createContext<GuideContent>({ published: [] });

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
