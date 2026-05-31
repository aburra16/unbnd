# Review: Story 25 — Trust-weighted tag/genre consensus + community-vs-trusted labeling

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-31
**Diff:** `git diff main...feat/weighted-consensus` (merge-base `cd94b53`, HEAD `9e91b4a`)
**Story:** `engineering-team/stories/done/25-weighted-consensus.md`
**ADR:** `engineering-team/decisions/0025-weighted-consensus.md`
**Test plan:** `engineering-team/stories/done/25-weighted-consensus.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects green (schemas, search, api, indexer, seeder, web; `tsc --noEmit` each).
- [x] `pnpm -r test` — **PASS.**
  - `apps/api`: **487 passed | 10 skipped** (63 files). Includes the 16 new Story-25 API tests (`aggregate-weighted` 10, `tags-weighted` 6) and the architecture guard.
  - `apps/web`: **156 passed** (35 files). Includes the 6 new Story-25 web tests (`tag-consensus-labels` 4, `ratings-vocabulary` 2, `book-detail-trust-view` 1 — 7 spec rows across 3 files, counted as 7 `it`s; vitest reports the file totals above).
  - `packages/schemas`: 72 passed. `packages/search`: 11 passed. `apps/indexer`: passed. `apps/seeder`: 12 passed.
  - Targeted re-run of `test/tags/aggregate-weighted.test.ts test/routes/tags-weighted.test.ts test/trust/architecture.test.ts` → **17 passed (3 files).** The 22 new Story-25 tests are green; Story-18..24 suites and the search/trust guards are green.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit && vite build`; 431 modules; built in ~0.6s; no type errors with the now-required `trusted` field.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] **AC-1 — weighted ≠ raw.** `aggregateBookTagsWeighted` (`apps/api/src/tags/aggregate.ts:120`) sums per-tag `trustedApplies`/`trustedDisputes` over weight>0 asserters and sets a per-tag `trusted` flag + section `weighted` flag absent from the raw shape. Divergence pinned by `aggregate-weighted.test.ts:86` (1 trusted apply vs 2 untrusted disputes: raw rule would drop, weighted keeps `trusted:true`) and the magnitude test at `:120`.
- [x] **AC-2 — untrusted volume can't move the trusted view.** By construction: `w = weights.get(author) ?? 0`, and only `w > 0` contributes (`aggregate.ts:157-164`). Untrusted disputes add 0 to `trustedDisputes`. Proven at `aggregate-weighted.test.ts:147` (1 trusted apply holds against 3 untrusted disputes) and the converse at `:167`.
- [x] **AC-3 — "trusted consensus" label.** `TagControl.tsx:75-76` derives the section label from `tags.weighted`; `tag-consensus-labels.test.tsx:42` asserts it.
- [x] **AC-4 — raw fallback labeled "community consensus", empty state unchanged.** `TagControl.tsx:76` ("Community consensus" when `weighted` false), empty-state string `:119` unchanged ("No genres or styles applied yet."), label suppressed on a tagless book (`tag-consensus-labels.test.tsx:76`). Raw counts preserved (`aggregate.ts:175-181`; `aggregate-weighted.test.ts:211`).
- [x] **AC-5 — consensus follows the observer / House⇄Yours.** Route resolves `?observer=` else `config.houseObserverPubkey` (`tags.ts:93-97`), echoes `npubEncode(observerHex)` (`tags.ts:119`); web passes the active observer through `useTrustView` and re-fetches on toggle (`BookDetail.tsx:38,49,63`). POV divergence proven at `tags-weighted.test.ts:118`; web re-fetch at `book-detail-trust-view.test.tsx:67`.
- [x] **AC-6 — ratings vocabulary aligned.** `RatingsPanel.tsx:57,65,72` now reads "Trusted consensus…" / "Community consensus…"; weighting math untouched (`weightedRatings` unchanged). Asserted at `ratings-vocabulary.test.tsx:46,58`.
- [x] **AC-7 — honest degrade, never throw.** All four paths covered: no `deps.trust` (guard `tags.ts:101`), no observer (guard `:101`, `observerHex` may be null), no asserters (guard `:101`, `asserters.length > 0`), trust throws (`try/catch` → empty map `:102-106`). Empty map → every `trusted:false`, `weighted:false` (`aggregate.ts:120` with `new Map()`). Tests: `tags-weighted.test.ts:151,164,186`; aggregator degrade `aggregate-weighted.test.ts:237`.
- [x] **AC-8 — fixture-verified in CI, no Brainstorm leak.** Tests build `FixtureTrustProvider` directly; no relay/network. Architecture guard `test/trust/architecture.test.ts` green (scans repo; Brainstorm specifics confined to `brainstorm.ts`).

## ADR adherence
- [x] Files changed match the ADR implementation notes: `aggregate.ts`, `routes/tags.ts`, `web/src/lib/api.ts`, `BookDetail.tsx`, `BookHeader.tsx`, `TagControl.tsx`, `Pill.tsx`/`Pill.css`, `RatingsPanel.tsx`. No file outside the ADR's list.
- [x] `aggregateBookTags` is preserved and now delegates to `aggregateBookTagsWeighted` with an empty `Map` and strips `trusted` (`aggregate.ts:80-104`) — raw output stays byte-identical in shape (`RawTagConsensus`/`RawBookTags`), and the untouched `apps/api/test/tags/aggregate.test.ts` + `routes/tags.test.ts` still pass, confirming raw counts intact.
- [x] Layering respected: weighting consumes only `deps.trust.weights(observerHex, asserterHexes)` — the neutral `TrustProvider` seam. `userEventDeps` already carries `trust` (`index.ts:299`); no wiring change (index.ts not in the diff).
- [x] No new dependency, no new tooling. `npubEncode`/`decode` from the already-present `nostr-tools/nip19`.

## DList integrity
- [x] No new event shapes. Reads kind-39999 assertions under `book-tag-assertions` and kind-39998 `book-tags` taxonomy, addressed via `39998:${librarianPubkey}:book-tags` (`tags.ts:60-61`). Librarian pubkey resolved at runtime from config (`lib()` `:59`), no hardcoded npub/hex. Concept addresses are stable `kind:pubkey:slug`.

## UI integrity
- [x] **Brand tokens only.** `.pill-community` (`Pill.css:28-31`) uses the existing amber rgba + an inset ring (depth without drop shadow). No new hex literal, no token file change. `.tagc-consensus` (`TagControl.css`) uses `var(--u-muted)`.
- [x] **No icon library, no emoji, no per-chip badge.** The community marker is a token-only chip treatment applied only on `weighted && !trusted` chips (`BookHeader.tsx:49`, `TagControl.tsx:129`, `Pill.tsx:23`) — the Q4 gate ("section label + subtle marker on exceptions, no badge on every chip") is honored.
- [x] **No-slop copy.** New strings: "Trusted consensus" / "Community consensus" (PRD §2.5 verbatim, plain nouns); RatingsPanel captions rewritten. The old em-dash caption ("Showing all ratings — no trust-weighted ratings…") was **removed**; its replacement ("Community consensus from all ratings. No trusted ratings for this book yet.") has no em dash, no rhetorical contrast, no banned filler. Clean.
- [x] **npub-display / hex-internal.** The route echoes only `npubEncode(observerHex)` (`tags.ts:119`); hex appears only as the internal `weights()` lookup key (`tags.ts:103`). No hex on the wire. The web passes the user's npub as the observer param (`BookDetail.tsx:38`).

## Disclosed test-file edits
The brief flagged 3 disclosed edits to test files (dead scaffolding removed in `aggregate-weighted.test.ts`; a missing `signals: []` added in `tag-consensus-labels.test.tsx`). Against the merge-base **all five Story-25 test files are net-new (`A`)** — there are no pre-existing-test modifications in this diff. Any such edits were intra-branch authoring history, not a relaxation of shipped coverage. Pre-existing suites `aggregate.test.ts` and `tags.test.ts` are **untouched** (confirmed: empty diff). No assertion was relaxed.

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code, no leftover debug.
- [x] Error paths handled: the trust call is wrapped (`tags.ts:102-106`); a throw degrades to raw, never 500.
- [x] No race: the web re-fetch keys on `[slug, observer]` (`BookDetail.tsx:63`) and a stale fetch is guarded by the `cancelled` flag.
- [x] Input validation: `toObserverHex` (`tags.ts:26`) accepts hex64 or a decodable npub, returns null otherwise; a bad `?observer=` yields a null observer → raw community view (no throw).

## House rules
- [x] Scope held. Weighted tag/genre/signal **display** + labeling only. No search re-ranking, no homepage shelves, no custodial personalization, no promotion gate, no accusatory write picker, no quality-signal write picker. The house-observer swap is correctly **not** implemented (config/ops step). Accusatory tags still dropped at read time (`aggregate.ts:172`; `aggregate-weighted.test.ts:197`).
- [x] POV-first respected: two observers can see two different reads (AC-5).
- [x] No new lint/typecheck/build tooling.

## Adjudication — surfacing vs. flagging (the Implementer's flagged divergence)

**Decision: the flag-and-keep behavior satisfies all 8 ACs and is the more honest design. PASS. The ADR's "surfaced when trustedApplies > trustedDisputes" prose should be reconciled to describe the shipped flag-and-keep model — a documentation nit, not a blocker.**

The ADR Option 1A prose (and the implementation-note line `trusted ? trustedApplies > trustedDisputes : applies > disputes`) reads as if the trusted vantage should **exclude** a tag whose trusted net is negative. The implementation does **not** exclude or reorder: `aggregateBookTagsWeighted` returns every known, non-accusatory tag, each carrying `trusted = (trustedApplies + trustedDisputes) > 0` plus its raw `applies`/`disputes`, and the section `weighted` flag. The render marks community-only chips (`weighted && !trusted`) with a subtle token treatment; it never drops a chip.

Why this is correct and not a weakening:

1. **The ACs do not require exclusion.** AC-2 states explicitly: "The exact ordering/threshold for 'which tag wins' or 'is shown' is the Architect's to specify; the AC is that untrusted volume cannot override trusted signal in the trusted view." That property holds by construction (untrusted weight = 0). AC-1 requires weighted ≠ raw and a trust-weighted consensus carried per tag — satisfied by the `trusted` flag + section `weighted`. Both core ACs are genuinely met.

2. **The honesty invariant favors keep-and-flag.** AC-4 / the PRD §2.5 "raw-fallback, labeled" decision of record requires the catalog never looks empty and raw counts remain the labeled-community substrate. Dropping trusted-net-disputed tags from the surfaced set would discard visible substrate and could empty a section that has real assertions. Keeping every tag with honest counts + a `trusted` flag is the stronger reading of "never fabricate, never hide the raw truth."

3. **The test plan and the shipped tests deliberately pin keep-and-flag.** `aggregate-weighted.test.ts:120` (the magnitude case: `trustedApplies 0.2 < trustedDisputes 0.8`) asserts the tag is **still present** (`expect(so).toBeDefined()`) with `trusted:true` and its raw 1/1 counts, commenting "the surfacing decision is encoded by the `trusted` weighting, not by absence." The Tester encoded the keep-and-flag contract on purpose.

**The one residual gap, and why it is non-blocking:** a tag that trusted curators *themselves* net-dispute (`trustedApplies < trustedDisputes`, both > 0) currently renders as a plain `trusted:true` chip with **no** distinguishing treatment — the `trusted` flag tracks "had ≥1 trusted asserter," not "trusted net is positive." So from the trusted vantage a trusted-contested tag looks the same as a trusted-applied one. This is a subtle loss of fidelity (a trusted-contested tag isn't de-emphasized), but: the raw counts are visible on the chip, nothing fabricates a trusted number, and no AC requires a trusted-net-negative tag to be visually demoted. It is a genuinely-contested-from-this-vantage case the ADR itself acknowledges ("a tag with trusted signal on both sides near parity… is genuinely contested from that vantage; the raw counts remain visible"). A future story could add a "contested" treatment using `trustedApplies`/`trustedDisputes`, but that is enhancement, not a Story-25 acceptance.

**Action:** reconcile ADR 0025's Option 1A wording ("a tag is **surfaced from the trusted vantage** when `trustedApplies > trustedDisputes`") to state the shipped model: every known tag is returned with a `trusted` flag (`(trustedApplies + trustedDisputes) > 0`) and raw counts; surfacing is by flag + label, not exclusion. I am noting this as a doc tweak; it does not gate merge.

## Findings

### Blocking
None.

### Non-blocking
1. **ADR 0025 §"Options considered" (1A) and §"Implementation notes"** — the "surfaced when `trustedApplies > trustedDisputes`" / `trusted ? trustedApplies > trustedDisputes : applies > disputes` prose describes an exclusion rule the implementation does not use (it flags and keeps every tag). Reconcile the wording to the shipped flag-and-keep model. Doc-only.
2. **`apps/api/src/tags/aggregate.ts:173`** — `trusted` means "had ≥1 positively-trusted asserter," so a tag trusted curators net-*dispute* still reports `trusted:true` with no community marker. Honest (raw counts shown) and within scope, but a future "contested" treatment driven by `trustedApplies` vs `trustedDisputes` would close the fidelity gap. Optional, separate story.

## Verdict
**PASS**
