# Unbnd — Agent Orientation

How to get oriented before touching code. Read this before any phase command.

## 1. Read the spec, then the visual, then the existing code

The PRD and handoff together carry every product decision that has been made so far. The existing code in `apps/web/src/` and `apps/api/src/` carries every implementation decision that has been shipped. Read in this order:

1. **[unbnd-prd.md](./unbnd-prd.md)** — what we are building and why. Section structure:
   - §1–2 vision and MVP positioning
   - §3 personas (Reader, Curator, Author)
   - §4 user journeys
   - §5 feature spec (one subsection per screen)
   - §6 data model (DList schemas as the PRD draft sees them)
   - §7 catalog seeding (Open Library)
   - §8 auth architecture (three tiers, key recovery)
   - §9 trust and curation (House PoV, personalized PoV, GrapeRank)
   - §10 technical architecture
   - §11 MVP scope (in-scope, stretch, out-of-scope)
   - §12 phase roadmap
   - §13 success metrics
   - §14 open questions (live decisions)
   - Appendix A genre taxonomy
   - Appendix B competitive landscape
2. **[unbnd-handoff.md](./unbnd-handoff.md)** — how the screens look and which PRD sections they map to. The brand design tokens and the screen-to-PRD mapping table live here.
3. **[unbnd-wireframes.html](./unbnd-wireframes.html)** — the visual reference. The CSS at the top of the file is the production-ready design system; the markup below it is the per-screen reference. Open in a browser if you need to see the visual; read the CSS block to understand the token system.
4. **The shipped UI**: `apps/web/src/components/` (atomic and composite components), `apps/web/src/routes/` (one file per top-level route), `apps/web/src/data/` (fixtures that the screens render against).

For backend work, see `apps/api/src/` (currently a `/health` stub; the data-layer wiring is the next round of stories).

## 2. Surface Tapestry prior art before designing anything DList-shaped

Unbnd is built on Tapestry. We do not invent DList shapes from scratch; we crib patterns from three Tapestry branches in the `~/Documents/Tapestry/tapestry/` checkout (remote `nous-clawds4/tapestry`):

- **`concept-graph`** (default branch) — the protocol baseline. BIBLE.md is the canonical spec; `firmware/concepts/` carries the seed concept definitions; the DList API in `src/api/` shows the read and write contracts. Cite via `git show origin/concept-graph:<path>`.
- **`feat/communities`** — community-scoped DList items. The closest pattern for Unbnd's per-user data (ratings, reviews, shelves). Documents to read first: `COMMUNITY_RECORDS_DLIST.md`, `COMMUNITY_ENDORSEMENTS_DLIST.md`.
- **`feat/pubkey-tagging-target`** — tag, pin, and Trusted List architecture. The closest pattern for Unbnd's genre tags, quality signals, "trending tags," and "top curators in this genre." Worked examples are the ADRs at `engineering-team/decisions/0001-...` through `0014-...` on that branch.

When the Architect surveys prior art, the citation goes: branch + path + commit hash if relevant. Don't paraphrase a pattern — link to the source.

## 3. Know the architecture invariants before you design

Unbnd inherits three invariants from Tapestry. They are stated in full in [CLAUDE.md](./CLAUDE.md) §"Architecture invariants":

1. **POV-first.** Trust-weighted answers are computed per observer, not stored as global truth.
2. **Decentralized-first.** Publication is permissionless; aggregation is opinionated per-POV.
3. **Filter at view time.** Compose POV columns at query time; don't precompute per-POV denormalizations.

Reflex checks before writing the design:
- "Who is this true for?"
- "Where does this trust come from?"
- "Could anyone else publish their own version of this?"
- "What changes when the POV changes?"

If your design fails any of these, re-derive from a POV-aware vantage point.

## 4. Know the design and copy rules before you ship UI

The design system is the `@unbnd/ui` package (`packages/ui/`, ADR 0038, epic 0001). The handoff §"Design Principles" pins the intent; `@unbnd/ui` is where it lives and the CI guards in `packages/ui/test/architecture-*.test.ts` are how it holds:

- No icon libraries. Icons go through the `@unbnd/ui` `Icon` registry (`<Icon name="…" />`), a typed map of our own hand-authored SVGs. No raw `<svg>` in app code: enforced by `packages/ui/test/architecture-svg-literals.test.ts`.
- Buttons and interactive controls go through the `@unbnd/ui` primitives (`Button`, `IconButton`, and `Link` / `Pill` for the link- and pill-styled affordances). No raw `<button>` in app code: enforced by `packages/ui/test/architecture-button-literals.test.ts`.
- Amber `#C4763C` is the only accent. Green for positive quality signals, red for negative, purple for sovereign / Nostr identity. These are token-backed in `@unbnd/ui` and still binding.
- Tokens (color, radius, spacing, type, motion) are the source of truth and live in `@unbnd/ui` (`packages/ui/styles/tokens.css`, two-tier raw → semantic, consumed by `apps/web` via the `@unbnd/ui/styles/tokens.css` export). No raw literals outside the token layer: enforced by the color / type / spacing / shape / motion literal guards under `packages/ui/test/architecture-*.test.ts`.
- A redesign is a token-tier swap (theming is `[data-theme]`-scoped in `packages/ui/styles/tokens.css`); a dark skeleton exists for structural validation but is inert and not activated.
- Trust shown as percentile tier strings ("Top 2% curator"), never raw GrapeRank numbers.
- Parchment-on-parchment elevation (page = `#FAF6F0`, cards = `#FFFFFF`, outer frame = `#EFEBE4`). Depth without shadows.

The copy rule lives in `memory/feedback_unbnd_copy_and_visual.md`. Re-read it before writing any UI string. Banned: em dashes, rhetorical contrasts, hedged openers, banned filler verbs, three-item rhythmic lists, "designed to" framing, exclamation-point CTAs, emoji in body copy. Voice should read like an indie bookstore shelf-talker, not a SaaS landing page.

## 5. Know what is out of scope

PRD §11.3 lists Phase 2+ items. These do not belong in MVP work:

- Lightning payments
- Blossom file hosting
- Ebook sales or distribution
- Editing bounty marketplace
- Print on demand
- Social feed / activity stream
- Reading progress tracking
- Discussion groups / forums
- Library system integration
- Mobile native apps
- Email notifications
- Federation / multi-instance

If a request tries to expand into any of these, the Product Owner pauses and asks the user to re-scope the PRD before drafting the story.

## 6. Stack reference

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript | `apps/web` |
| Backend | Node.js + Express + TypeScript | `apps/api` |
| Test runner | Vitest | introduced with the first formal cycle's ADR |
| Type gate | `tsc --noEmit` via `pnpm -r typecheck` | the workspace typecheck gate |
| Data layer | strfry + Neo4j + Meilisearch + GrapeRank | Docker Compose; not yet wired |
| App DB | Postgres | user accounts, sessions, encrypted nostr keys; not yet wired |
| Package manager | pnpm 9 workspace | `apps/web`, `apps/api`, and `packages/*` (incl. `@unbnd/ui` design system) |
| Dev server | `pnpm dev:web` on :5181, `pnpm dev:api` on :8787 |

## 7. Quick command reference

| To do this | Run |
|---|---|
| Web dev server | `pnpm dev:web` |
| API dev server | `pnpm dev:api` |
| Typecheck | `pnpm -r typecheck` |
| Test (workspace) | `pnpm -r test` |
| Build web | `pnpm --filter @unbnd/web build` |
| Engineering team — Plan a story | `/plan-feature` |
| Engineering team — Design an ADR | `/design-architecture` |
| Engineering team — Write failing tests | `/design-tests` |
| Engineering team — Implement | `/implement-feature` |
| Engineering team — Review a diff | `/review-changes` |
| Engineering team — Advisory mode | `/discuss` |
