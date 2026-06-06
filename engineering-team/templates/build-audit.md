# Build Audit: <book title>

**Book:** `engineering-team/audits/<book-slug>/book.md`
**Date:** <DATE>
**Branch / commit range:** <base>..<head>
**Provenance:** PRD-backed | Acceptance-frame | Reconstructed
**Confidence:** high | medium | low

> The Build Audit is the **as-built record** — what the product *is* now, factual and source-linked. It is audience-neutral: the product team reads it to scope the next phase; a future engineer reads it to understand what shipped. It does **not** propose changes — that's the addendum/seed's job.

## 1. What shipped
The capabilities this book delivered, in plain language. One bullet per observable capability, each linked to the story that delivered it.

- <capability> — `stories/done/<n>-<slug>.md`

## 2. Stories rolled up

| Story | Delivered | Status | Review |
|---|---|---|---|
| #<n> <slug> | <one line> | Done | `reviews/<n>-<slug>.md` |

## 3. As-built inventory
The concrete surface that now exists — **derived from the diff, not just the docs:**
- **User-facing:** screens / routes / endpoints / commands added or changed (`apps/web`, `apps/api`).
- **Domain:** DList kinds and concept handles touched (`kind:pubkey:d-tag`), schema changes, fixtures updated.
- **Data & contracts:** event kinds, API routes, stored shapes, Meili index changes.

## 4. Deviations from intent
The heart of the audit. Every place the built product differs from the anchor (PRD §refs, or acceptance-frame bullets). **Harvested** from ADR `Consequences`, story `Out of scope` / `Open questions`, review notes, and any Implementer `## Deviations` logs — then reconciled against the diff. Rationale is *sourced*, never re-invented.

| # | Specified (anchor) | Built | Type | Rationale (source) | Product impact | Carry-forward |
|---|---|---|---|---|---|---|
| 1 | §X.Y "<quote>" / frame bullet | <what shipped> | intentional-change · deferred · added-beyond-scope · constraint-discovered · interpretation | <why> (ADR <NNNN> / impl note) | <does it change what a user can do?> | <follow-up, or —> |

**Undocumented work** — anything the diff shows that no story/ADR covers (the gap between docs-say-shipped and diff-shows-shipped is itself a finding):
- <item> — `<file>` — no story/ADR provenance.

## 5. Quality state at close
- Gates at close: `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` results.
- Known open issues / accepted bugs (linked).
- Debt logged by ADRs (`Consequences → new debt`), rolled up.

## 6. Carry-forward register
The consolidated list of everything the next phase should consider — deferred scope, new debt, opened questions. This is the bridge into the addendum/seed.

- [ ] <item> (from §4 #<n> / story #<n> Open questions)
