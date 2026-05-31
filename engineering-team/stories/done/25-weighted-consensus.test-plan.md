# Test Plan: Story 25 — Trust-weighted tag/genre consensus + community-vs-trusted labeling

**Story:** `engineering-team/stories/done/25-weighted-consensus.md`
**ADR:** `engineering-team/decisions/0025-weighted-consensus.md`
**Date:** 2026-05-31

## Approach
All trust is deterministic. Weights come from a `FixtureTrustProvider` constructed
directly with a known `FixtureSpec` (the model is `apps/api/test/trust/fixture.test.ts`)
or injected as the tags route's `trust` dependency — no Brainstorm, no relay, no network,
no intra-module `vi.mock`. Each weighted-vs-raw divergence is hand-computed and asserted.
The raw aggregate (`aggregateBookTags`) is the existing labelled-community substrate and
stays unchanged.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 | `it("a tag a trusted curator applies stays surfaced although the RAW net is negative")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-1 | `it("weight MAGNITUDE matters: a higher-weighted curator's dispute outweighs a lower-weighted apply")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-2 | `it("one trusted apply is not flipped by many untrusted disputes")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-2 | `it("converse: untrusted applies cannot manufacture a trusted tag")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-3 | `it("a tag with ≥1 positively-trusted asserter is trusted and the section is weighted")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-3 | `it("accusatory tags stay dropped from the weighted output")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-3 | `it("labels the section 'trusted consensus' when weighted is true")` | `apps/web/test/tag-consensus-labels.test.tsx` | component |
| AC-4 | `it("a book with only untrusted asserters → every tag trusted:false, section weighted:false, raw counts intact")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-4 | `it("zero assertions → empty buckets, weighted:false (existing empty state unchanged)")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-4 | `it("an empty weights map is the degraded/raw path: every tag trusted:false, weighted:false")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-4 | `it("labels the section 'community consensus' when weighted is false but tags exist")` | `apps/web/test/tag-consensus-labels.test.tsx` | component |
| AC-4 | `it("keeps the existing honest empty state when there are no tags")` | `apps/web/test/tag-consensus-labels.test.tsx` | component |
| AC-4 | `it("marks a trusted:false chip distinctly inside an otherwise-trusted section")` | `apps/web/test/tag-consensus-labels.test.tsx` | component |
| AC-5 | `it("echoes the resolved observer (npub) and applies trust-weighting from that vantage")` | `apps/api/test/routes/tags-weighted.test.ts` | route |
| AC-5 | `it("defaults to the house observer when no ?observer= is given")` | `apps/api/test/routes/tags-weighted.test.ts` | route |
| AC-5 | `it("two observers see two different trusted sets for the same book (POV-first)")` | `apps/api/test/routes/tags-weighted.test.ts` | route |
| AC-5 | `it("fetches the book's tags with the active observer npub when the view is 'Yours'")` | `apps/web/test/book-detail-trust-view.test.tsx` | component |
| AC-6 | `it("uses 'trusted consensus' wording when a trust-weighted view exists")` | `apps/web/test/ratings-vocabulary.test.tsx` | component |
| AC-6 | `it("uses 'community consensus' wording when there is no trust-weighted view")` | `apps/web/test/ratings-vocabulary.test.tsx` | component |
| AC-7 | `it("no trust dep configured → raw community view: every trusted:false, weighted:false, 200")` | `apps/api/test/routes/tags-weighted.test.ts` | route |
| AC-7 | `it("trust provider throws → degrades to raw, never 500, no fabricated trusted numbers")` | `apps/api/test/routes/tags-weighted.test.ts` | route |
| AC-7 | `it("observer trusts none of the asserters → community view (weighted:false), raw intact")` | `apps/api/test/routes/tags-weighted.test.ts` | route |
| AC-8 | `it("the same FixtureTrustProvider.weights call drives the divergence with no network")` | `apps/api/test/tags/aggregate-weighted.test.ts` | unit |
| AC-8 | `it("Brainstorm API specifics live only in the adapter")` (existing guard, must stay green) | `apps/api/test/trust/architecture.test.ts` | guard |

## Hand-computed divergences (the deterministic core)

- **AC-1 (weighted ≠ raw):** literary-fiction asserted apply by CURATOR (w=0.9) and disputed
  by two untrusted accounts (w=0). Raw: applies 1, disputes 2 → raw surfacing rule
  (`applies > disputes`) would DROP it. Weighted: `trustedApplies = 0.9 > trustedDisputes = 0`
  → surfaced from the trusted vantage. The two views disagree, deterministically. Raw counts
  (1/2) remain on the tag.
- **AC-1 (magnitude, not boolean):** space-opera — CURATOR applies (w=0.2), CURATOR2 disputes
  (w=0.8). Raw is a 1–1 tie; weighted `0.2 < 0.8` → not trusted-surfaced. This rejects Option B
  (boolean collapse): magnitude must decide.
- **AC-2:** 1 trusted apply (w=0.5) vs 3 untrusted disputes → `trusted:true`, the apply holds
  (untrusted disputes contribute 0). Converse: 3 untrusted applies, 0 trusted → `trusted:false`.

## Edge cases covered
- [x] Zero assertions → empty buckets, `weighted:false`, existing empty state unchanged (AC-4).
- [x] Empty weights map (degraded path) → every `trusted:false`, `weighted:false` (AC-4/AC-7).
- [x] Trust provider throws → 200 + raw, never 500, no fabricated trusted numbers (AC-7).
- [x] No `trust` dep on the route → raw community view (AC-7).
- [x] Observer trusts none of the asserters → community view, raw intact (AC-7).
- [x] Accusatory tags stay dropped from the weighted output (AC-3 + existing invariant).
- [x] Two distinct observers → two distinct reads for the same book (POV-first, AC-5).

## Test infrastructure
- Runner: Vitest (`apps/api/test/...`, `apps/web/test/...`). No new framework.
- No relay / Neo4j / Meilisearch needed — trust is the FixtureTrustProvider, the API route
  tests inject `query`/`trust`/`sessionUser` via DI (supertest), the web tests mock the api client.
- No `docker compose up` prerequisite for this story's tests.

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/tags/aggregate-weighted.test.ts test/routes/tags-weighted.test.ts test/trust/architecture.test.ts
pnpm --filter @unbnd/web exec vitest run test/tag-consensus-labels.test.tsx test/ratings-vocabulary.test.tsx test/book-detail-trust-view.test.tsx
pnpm -r test
```

## Verification

The new tests fail against the current code (the weighted aggregation, the `trusted`/`weighted`
fields, the observer-aware route, and the web labels do not exist yet). Confirmed on
2026-05-31 at commit `20df1cf`. The ADR 0014 architecture guard stays green.

**API** (`aggregate-weighted` + `tags-weighted` + guard):
```
 ✓ test/trust/architecture.test.ts (1 test)
 ❯ test/tags/aggregate-weighted.test.ts — TypeError: aggregateBookTagsWeighted is not a function (10 failed)
 ❯ test/routes/tags-weighted.test.ts — expected undefined to be <observer npub> / true / false (6 failed)
 Test Files  2 failed | 1 passed (3)
      Tests  16 failed | 1 passed (17)
```

**Web** (label + vocabulary + toggle):
```
 ❯ tag-consensus-labels.test.tsx — no "trusted/community consensus" text; no .pill-community marker (3 failed, 1 empty-state guard passes)
 ❯ ratings-vocabulary.test.tsx — RatingsPanel still uses old wording (2 failed)
 ❯ book-detail-trust-view.test.tsx — api.tags.book never called with the observer npub (1 failed)
 Test Files  3 failed (3)
      Tests  6 failed | 1 passed (7)
```

Full suites confirm no pre-existing test was broken (api: 471 pass + 16 new red; web: 150 pass + 6 new red).

## Notes / fallout for the Implementer
- **`TagConsensus` gains `trusted: boolean`; `BookTags` gains `observer?: string` + `weighted?: boolean`.**
  These are additive. After the Implementer adds them to `apps/web/src/lib/api.ts`, the new web
  tests will typecheck (they already construct `TagConsensus` with `trusted` and pass `weighted`
  to `BookHeader`; Vitest transpiles past the type gap today, but `tsc`/`pnpm -r build` will not
  until the fields land).
- **Construction sites to migrate when `trusted` becomes required:** `apps/web/src/components/BookHeader.tsx`,
  `apps/web/src/components/TagControl.tsx` (both consume `TagConsensus`), and any web fixture/test
  that builds a `TagConsensus`. The existing API `aggregate.test.ts` and route `tags.test.ts` use
  the RAW `aggregateBookTags` and were left untouched (their assertions stay valid — raw counts are
  unchanged). Do NOT weaken those assertions; the weighted layer is additive.
- **`BookHeader` signature** is extended in the chip-marker test with an optional `weighted?: boolean`
  prop. The Implementer should add it (plus the per-chip `trusted` plumbing) without breaking the
  current `genres`/`styles` props.
- **Chip marker contract:** the AC-4 chip test asserts a `.pill-community` class on the
  `trusted:false` chip inside a trusted section. The class NAME is the test's only structural
  commitment; the Implementer owns the token-only visual treatment (amber-only, depth-without-shadow,
  no per-chip badge per the Q4 gate). If the Implementer chooses a different class name, update this
  one assertion to match — it is the single brittle hook and is intentionally minimal.
- **Route `trust` dep:** `TagsDeps` needs an optional `trust?: TrustProvider` (mirror `RatingsDeps`).
  `userEventDeps` already carries `trust` (index.ts), so wiring is a pass-through.
