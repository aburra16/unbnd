# Guide content (Story 84 / ADR 0081)

Entries are markdown files at `content/<section-slug>/<order>-<anchor>.md`.
The eight section slugs live in `sections.ts`. Frontmatter is authored,
never derived:

    ---
    anchor: taste-match        (the stable id; never changes once published)
    name: Taste match          (the on-screen words; the entry heading)
    order: 1                   (position within the section)
    related: [ratings-you-can-trust#house-view]   (optional)
    sourceStories: 65, 66      (authoring note; never rendered)
    ---

The body supports exactly the entry anatomy's constructs: paragraphs
separated by blank lines, numbered step lines, `[text](/path)` links,
`**bold**` for the anatomy labels, and (Story 85) a lone `## heading` line
for the landing narrative's parts. Anything else renders as literal text.

`landing.md` at this directory's root is the landing narrative slot: scanned
like everything else, but not an entry (no anchor or name frontmatter).

Every file under `content/` is scanned against the tic taxonomy's Appendix M
(`pnpm --filter @unbnd/guide-lint lint:guide`). This README sits outside the
glob on purpose; keep working notes here, never in `content/`.
