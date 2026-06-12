// The one chrome composition site (Story 96 / ADR 0086 §4): every standard
// page is a full-bleed nav bar, the reading column, a full-bleed footer bar.
// Auth surfaces keep AuthShell. Composing chrome per-route is what let two
// guide routes ship without it (#93); this removes the bug class.
import type { ReactNode } from "react";
import { Container } from "@unbnd/ui";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <Container>{children}</Container>
      <Footer />
    </>
  );
}
