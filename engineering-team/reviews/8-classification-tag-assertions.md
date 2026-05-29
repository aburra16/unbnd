# Review: Story 8 — Classification via tag assertions

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** staged across PRs #12 (schemas), #13 (seeder), #14 (api) — each CI-green on merge.

## Quality gates

- [x] `pnpm -r typecheck` — pass (all packages).
- [x] `pnpm -r test` — pass: schemas 64, seeder 12, api 196 (+10 skipped), web 20.
- [x] Stage 2 verified live on dcosl (taxonomy + genre assertions published + read back).
- [x] Each stage CI-green on merge to main.

## AC status

- [x] **AC-1/2/3** assertion shape (target `#a`, polarity, relay-filterable tags, one mechanism for genre/style/signal) — `BookTagAssertion` + tests (PR #12).
- [x] **AC-7/8** taxonomy element (`BookTag`, type + sensitivity); cycle-1 `BookGenreTag`/`BookQualitySignal` retired — PR #12.
- [x] **AC-5** librarian baseline genre seeding (per OL-subject bucket, multi-genre) — seeder + live dcosl verification (PR #13).
- [x] **AC-6/9** honest raw consensus read; **accusatory tags excluded** — `tags/aggregate.ts` + API + tests (PR #14).
- [x] **AC-4** apply/dispute via the 5a/5b write path (sovereign client-signs / custodial server-signs) — `routes/tags.ts` + tests (PR #14).
- [~] **Web surfacing** (book-detail chips, apply/dispute picker, genre browse) — **migrated to story 9**. The web classification UI is only meaningful on live book pages, which need the catalog read-path swap (no book-read API yet). Building it against the fixture would be hollow, so it is folded into the "web goes live" cycle (story 9), which renders the real catalog and layers the tag UI on top.

## Crypto / safety

- Audited-stack signing only (`finalizeEvent`); generic `validateSignedEvent` enforces `pubkey==session`.
- Sensitivity model enforced by hiding accusatory tags at read time (the Layer-2 trust+role gate remains deferred, as designed).
- Open write mechanism + curated surfacing kept separate, per the model.

## Verdict
**PASS** — the classification foundation (unified schemas), the librarian seed (taxonomy + baseline genre assertions, live), and the API (sensitivity-filtered reads + apply/dispute writes) are delivered and verified. The user-facing web surfacing is intentionally carried into story 9 (web goes live), where it composes with live catalog reads. Story marked Done on that basis.
