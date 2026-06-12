# ADR 0081: The guide surface — raw-glob markdown, a subset formatter, authored anchors

**Status:** Accepted
**Date:** 2026-06-11
**Story:** `engineering-team/stories/84-guide-surface.md`

## Context
The PRD/design guide bind the structure (landing + eight section routes, four-part entry anatomy, stable anchors, the document register) and #83's Appendix M binds the content location to `apps/web/src/guide/content/**/*.md`. The web app has no markdown infrastructure and the house rule is no new dependency without cause. Content must be testable without the real (still empty) content directory.

## Decision

### 1. Content pipeline: Vite raw-glob + frontmatter + a subset formatter (resolves OQ-1)
- **Files:** `apps/web/src/guide/content/<section-slug>/<order>-<anchor>.md`. The eight section slugs and titles live in one manifest (`src/guide/sections.ts`), ordered; an entry's section is its directory.
- **Frontmatter (authored, explicit):** `anchor` (the stable id, never derived from anything), `name` (the on-screen words, the entry heading), `order` within the section, `related` (a list of `section#anchor` refs), `sourceStories` (authoring note, never rendered). A file whose frontmatter is missing `anchor` or `name` fails loudly at load.
- **Loading:** `import.meta.glob("./content/**/*.md", { query: "?raw", eager: true })` wires production; the parser/renderer take `Record<path, raw>` so tests inject fixtures (resolves OQ-3).
- **Rendering:** a deliberately small subset formatter for exactly the anatomy's constructs: paragraphs, `1.`-numbered step lists, `[text](url)` links (internal guide links and same-site paths only), `**bold**` for the anatomy labels. This is a constrained formatter over in-repo authored text, not a general markdown engine; unknown constructs render as literal paragraph text (no silent swallowing, visibly wrong in review). A markdown dependency buys nothing at this subset size and adds supply surface.

### 2. Routes + behavior (resolves OQ-2)
- `/guide` (landing) and `/guide/:section` join the router; no nav/footer/About link lands in this story.
- The landing, until #85, renders the guide title and the contents of **published sections only** (a section is published when it has ≥1 entry). An empty content set renders the title alone.
- An unknown section slug, or a section with zero entries, **redirects to `/guide`** (the landing is the recovery point; never a 404 from inside the guide).
- A `#anchor` hash scrolls to the entry after render; an unknown anchor stays at the section top. Next/previous links walk the published-section order.

### 3. The document register
One `GuidePage` frame (Container + a `guide-measure` block, ~65ch), `GuideToc`, `GuideRail` (CSS-collapsed on narrow viewports), `GuideEntry`. Tokens only; the rail highlight uses the existing link/active conventions.

## Consequences
- **Enables:** #85+ author by dropping md files; anchors are authored and therefore stable by construction; tests run on fixtures.
- **Constrains:** the subset formatter's constructs are the authoring contract (documented in `content/README.md`); anything fancier is a deliberate future change.
- **Affects existing fixtures?** Two new routes in App.tsx; nothing else touched.
- **New dependency?** None.
- **PRD change?** No — implements §5.1/§6/§7.

## Implementation notes
`apps/web/src/guide/{sections.ts, load.ts (frontmatter+manifest), format.ts (subset renderer), content/README.md}`; `src/routes/{GuideLanding,GuideSection}.tsx` + CSS; App.tsx routes. Tests inject fixture content through the load seam.

## Out of scope
The narrative + doors (#85); entries (#86+); contextual links (#92).
