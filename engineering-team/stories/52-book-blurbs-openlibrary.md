# Story 52: Populate book blurbs from Open Library

**Status:** Draft
**Created:** 2026-06-04
**Type:** Feature

## Background

The book detail page (PRD §5.4) has a header that already renders a back-cover blurb when one is present, but seeded books never carry one, so the block almost never appears and the page reads as sparse. We want the blurb to show up across the existing catalog.

The `blurb` field already exists end-to-end. This story is about **population only**, not plumbing. Verified during the survey:

- **Schema (no change needed).** `packages/schemas/src/BookRecord.ts` declares `blurb?: string` on `BookRecord` and `BookRecordPayload.bookSubmission`. `toBookRecordEvent` stores it in the event **`content`** field (`content: record.blurb ?? ""`) and also carries it in the payload; `fromBookRecordEvent` reads it back. There is no blurb tag and we are not adding one — the blurb lives in `content`. This matches PRD §6.2, which lists `blurb` as an optional "Description / back-cover copy" field.
- **Effective-book merge (no change needed).** `apps/api/src/books/effective.ts` already layers a verified author's overlay blurb over the canonical librarian blurb (`OVERLAY_FIELDS` includes `"blurb"`; none-on-conflict per ADR 0033 §5). Populating the canonical blurb is the base layer the overlay sits on; the merge is unchanged.
- **Display (no change needed).** `apps/web/src/components/BookHeader.tsx` renders `{book.blurb && <p className="bh-blurb">{book.blurb}</p>}`, and `.bh-blurb` in `BookHeader.css` is already token-compliant (`--u-font-size-14`, `--u-leading-170`, `--u-ink-tint-74`, `--u-space-8`). The empty state (no blurb) is simply the block not rendering. No web change.
- **Search (no change needed in this story).** Blurb already flows through the public book shape; making the populated blurbs searchable is a re-index, not a code change.

**The only gap is the seeder.** `apps/seeder/` pulls from Open Library's **subjects API** (`apps/seeder/src/fetch.ts` → `https://openlibrary.org/subjects/{subject}.json`), which returns title, author, cover id, first-publish year, and subjects, but **no description**. `apps/seeder/src/openlibrary.ts` `mapWorkToBookRecord` therefore never sets `blurb`, so every seeded `BookRecord` (~2k records live today) has an empty blurb, and the detail page shows nothing.

**User decision (binding — do not re-litigate): cap to back-jacket length.** Store a cleaned, sanitized description capped at a sane maximum (target ~600–800 chars; the Architect pins the exact cap), truncated at a sentence or word boundary with an ellipsis when it overflows. This gives a book-jacket feel and keeps record sizes sane. We are explicitly **not** storing the full Open Library description and **not** adding a read-more expander. No new UI interaction.

## User-facing description

As a Reader (PRD §3.1) browsing a book's detail page, I want to read a short back-cover blurb for the book where one is available, so that the page tells me what the book is about instead of showing only title, author, and metadata.

## Acceptance criteria

Testable from the outside. The real test surface is the seeder's mapping, sanitizer, and cap (unit-testable pure functions); the population result is observable on the detail page after backfill.

- [ ] **OL description fetch.** Given a seeded work, when the seeder maps it, then it fetches that work's Open Library description from the work-detail endpoint (`https://openlibrary.org/works/{id}.json`, `description` field) and uses it as the source for `blurb`. The `description` field's two OL shapes are both handled: a plain `string`, and an object `{ type, value }` (blurb taken from `value`).
- [ ] **Sanitize.** Given a raw OL description with markdown/wiki cruft (e.g. source-link footnotes like `([source][1])`, `----` rules, stray markup, multiple blank lines, leading/trailing whitespace), when sanitized, then that cruft is stripped and whitespace/newlines are normalized to clean prose.
- [ ] **Cap to back-jacket length.** Given a sanitized description longer than the cap, when capped, then it is truncated at a sentence boundary where possible (else a word boundary) and an ellipsis is appended, and the result does not exceed the cap. Given one at or under the cap, it is stored unchanged (no ellipsis).
- [ ] **Optional / absent.** Given a work with no OL description (or an empty/whitespace-only one), when mapped, then `blurb` is left unset (the record is published without a blurb; the detail page renders no blurb block — the empty state is unchanged).
- [ ] **Polite + idempotent.** The per-work description fetches are throttled (do not hammer Open Library) and cached so that re-running the seeder does not re-fetch descriptions it already has and re-publishes are idempotent (same `kind:pubkey:d-tag`, i.e. same slug, replaces in place).
- [ ] **Backfill.** Given a re-seed against the existing ~2k records, when it runs, then each existing book record is replaced in place with the blurb-bearing version (no duplicate records; deterministic slug d-tag), and a re-index makes the populated blurbs searchable. The operator steps are documented (including the droplet seeder-image staleness gotcha and the re-index command — see Open questions).
- [ ] **Detail page shows blurbs after backfill.** After the backfill, books whose OL work has a description show the blurb in the header; books without one render unchanged. (Observed on the live detail page; no web code change.)
- [ ] **Unit-tested.** The OL-shape mapping (string vs `{value}`), the sanitizer rules, and the cap/boundary/ellipsis logic each have unit tests covering the representative cases above, including the absent/empty case.
- [ ] **Gates green.** `pnpm -r typecheck`, `pnpm -r test`, and the relevant build stay green. No schema, web, or design-system change is introduced.

## DList shapes touched

- `kind:39999` — book record (`bookSubmission`), seeded by the librarian. The `blurb` is written into the event `content` (already supported by `toBookRecordEvent`). No new tag, no new field, no kind change. The d-tag (slug) is unchanged, so the re-seed replaces records in place.

## Out of scope

- **No schema change.** `blurb` already exists in `BookRecord` and round-trips through `content`. No new field, no new tag.
- **No web display change.** `BookHeader` already renders the blurb and the empty state; `.bh-blurb` is already token-compliant. No design-system change.
- **No effective-book / overlay change.** The verified-author overlay (ADR 0033 §5) already layers over the canonical blurb; untouched.
- **No read-more / expander UI and no full-description storage.** Per the binding user decision, the stored blurb is capped to back-jacket length. No new UI interaction.
- **No catalog size expansion.** This is blurb *population* of the existing ~2k catalog, not the separate ~10K catalog-growth story. (The per-work description fetch built here will, however, also serve that future expansion — the Architect should keep it composable.)
- **No new lint/typecheck/CI infrastructure** (ADR-gated only).

## Open questions

For the Architect to resolve during the Architecture phase:

1. **Exact cap + truncation strategy.** Pin the character cap inside the ~600–800 target. Define the truncation rule precisely: sentence-boundary first, word-boundary fallback, ellipsis form (single `…` vs `...`), and whether to count the ellipsis against the cap.
2. **Sanitizer rules.** Enumerate the OL-cruft patterns to strip (e.g. `([source][N])` footnote refs, bare reference-link blocks, `----`/`===` rules, residual markdown emphasis, HTML entities, collapsing blank lines). Decide whether to render-then-strip or pattern-strip, and how aggressive to be (favor clean prose over preserving every character).
3. **Work vs edition description.** Confirm we fetch the **work** description (`/works/{id}.json`) — the subjects API already gives us work keys and the catalog is one record per work. Decide whether to fall back to an edition description if the work has none, or simply leave the blurb unset.
4. **Fetch / cache / throttle design.** How to extend the existing checkpoint/cache pattern (`apps/seeder/src/checkpoint.ts` is slug-completion only) to also cache fetched descriptions so re-runs are idempotent and don't re-hammer OL; the per-work throttle/delay (reuse the subjects-API politeness: `User-Agent` header, inter-request delay); and where the per-work fetch slots into `fetch.ts` / `openlibrary.ts` / `index.ts` (mapping currently happens synchronously in `mapWorkToBookRecord`, which has no I/O — the Architect decides whether the fetch lives in the map step or a separate enrichment pass).
5. **Backfill + re-index sequencing and operator steps.** The seeder is a profile-gated worker holding `LIBRARIAN_NSEC`; its `:latest` image goes stale on the droplet (must `docker pull` before re-seed). Document the exact operator runbook: pull, re-seed (idempotent replace), then re-index — including the precise re-index command/target so blurbs become searchable. Confirm the checkpoint behavior on re-seed: because records already exist in the checkpoint, the Architect must ensure the backfill actually re-publishes updated records (e.g. clear/migrate the checkpoint, or special-case blurb enrichment), rather than skipping every already-checkpointed slug.
6. **E2e visual coverage (no work expected).** The visual-regression fixture `the-fixture-novel` (`apps/web/e2e/visual/fixtures/index.ts`) **already** carries a blurb, and `book-detail.png` already pixel-covers `.bh-blurb`. So the display path is already under harness coverage and no fixture/baseline change is expected. The Architect should confirm this and explicitly note "no baseline update" — only if some incidental change to the fixture is warranted would the deliberate-baseline-update path (ADR 0039's intentional-change path) apply, in a clearly-labeled commit. Default: leave the harness untouched.

## Phase-2 note

This improves catalog *quality* (substance per book) rather than catalog *size*, and complements the ongoing-maintenance posture in PRD §7.4 (periodic re-import to capture new Open Library entries). The per-work description fetch introduced here is the reusable building block for the future ~10K catalog-expansion story: that story can seed larger and inherit blurbs for free. Keeping the enrichment composable now avoids re-doing it later.

## Linked artifacts

- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
