# Test Plan: Story 8 — Classification via tag assertions

**Story:** `engineering-team/stories/done/8-classification-tag-assertions.md`
**ADR:** `engineering-team/decisions/0009-classification-tag-assertions.md`
**Date:** 2026-05-29

Implementation is **staged** into reviewable PRs; tests land with each stage.

## Coverage map

| AC | Test | Stage | Level |
|---|---|---|---|
| AC-1 assertion shape (target #a, polarity, identity) | `schemas/test/BookTagAssertion.test.ts` | schemas | unit |
| AC-2 relay-filterable event-tags + JSON mirror | `BookTagAssertion.test.ts` (tag assertions) | schemas | unit |
| AC-3 one mechanism, genre+signal vocabularies | `BookTag.test.ts` (type discriminator) | schemas | unit |
| AC-4 apply/dispute via 5a/5b write path | `api/test/routes/tags.test.ts` | api | component |
| AC-5 librarian baseline genre seeding | `seeder` mapping + staging run | seeder | unit + integration |
| AC-6 honest raw consensus read | `api/test/tags/aggregate.test.ts` | api | unit |
| AC-7 cycle-1 schemas replaced | grep + removed tests + index | schemas | unit/review |
| AC-8 taxonomy elements (type + sensitivity) | `schemas/test/BookTag.test.ts` | schemas | unit |
| AC-9 sensitive tags not surfaced | `api/test/tags/aggregate.test.ts` (accusatory dropped) | api | unit |

## Stage 1 — schemas (this PR)

- **`BookTag.test.ts`** — `buildBookTagDTag` (`tag--<type>--<slug>`); `toBookTagEvent` (kind 39999; `d`/`z`/`t`(slug)/`t`(type)/`sensitivity` tags; `bookTag` word-wrapper); round-trip; accusatory sensitivity carried.
- **`BookTagAssertion.test.ts`** — `buildBookTagAssertionDTag` (`tagassert--<book>--<tag>--<author8>`, identity author+book+tag); `toBookTagAssertionEvent` (target via `#a`, `t`(slug)/`t`(type)/`polarity`/`p` tags, z to assertion concept); dispute = polarity `-1`; round-trip apply + dispute.
- **Replace:** remove `BookGenreTag`/`BookQualitySignal` + their tests + index exports (AC-7).

## Stage 2 — seeder

Taxonomy publish (genre/style/signal elements w/ sensitivity) + baseline genre assertions per book per OL-subject bucket (track all buckets). Unit-test the bucket→assertion mapping; live publish verified on staging.

## Stage 3 — api

- generic `publishUserEvent` core (refactor from ratings; sovereign validate-relay + custodial server-sign) reused for assertions.
- `routes/tags.test.ts`: `POST /api/tags` apply/dispute (200/401/403/400), `GET /api/books/:slug/tags`, `GET /api/genres/:slug/books`, `GET /api/tags`.
- `tags/aggregate.test.ts`: raw apply-minus-dispute consensus; **accusatory tags excluded**; npub not hex; no trust number.

## Stage 4 — web

Book-detail genre/style chips + apply/dispute picker (from taxonomy, no free-form); genre browse off the API. Component tests with mocked api + session (tier-gated like RatingControl).

## Verification — failing-for-the-right-reason (stage 1)

Confirmed 2026-05-29. Typecheck clean.
`@unbnd/schemas`: **8 new failures**, all `…not implemented` (BookTag ×4 builders/parsers, BookTagAssertion ×4); 69 existing pass.

## Notes for the Implementer (stage 1)

Mirror `BookRating`: `buildBookTagDTag` = `tag--${type}--${slug}`; `toBookTagEvent` tags `[d, z(parentHeader), t(slug), t(type), sensitivity]`, content "", payload word-wrapper. `buildBookTagAssertionDTag` = `tagassert--${bookSlug}--${tagSlug}--${pubkeyPrefix(asserter)}`; `toBookTagAssertionEvent` tags `[d, z(parentHeader), a(formatAddress(bookAddress)), t(tagSlug), t(tagType), [polarity,String(p)], p(asserter)]`, payload mirrors. Parsers read tags/payload back. Then delete `BookGenreTag.ts`/`BookQualitySignal.ts` (+ tests) and their index exports; add `buildBookTagsHeaderAddress`/`buildBookTagAssertionsHeaderAddress` to `concept-headers.ts`.
