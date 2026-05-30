# ADR 0016: Submission write-path (community submissions)

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/16a-submission-write.md`

## Context

Make the (story-15-gated) Submit form actually publish — as a **community submission in its own space**, separate from the librarian-seeded canonical catalog. Promotion into the catalog is story 16b.

## Decision

- **New concept `book-submissions`** (`buildBookSubmissionsHeaderAddress`); the seeder publishes the header so the librarian blesses the concept (submissions are queryable by `#z` regardless).
- A submission is a **user-signed kind-39999 `BookRecord`** z-tagged to `book-submissions` (not `books`). `source` = `author` (if the submitter claims authorship) else `community`; `authorPubkey` set when `isAuthor`.
- **Signing reuses the shared write path:** sovereign → template (`POST /api/submissions/template`) → NIP-07 sign → `POST /api/submissions { event }` (validated `pubkey===session`, kind 39999); custodial → `POST /api/submissions { intent }` → server signs via the ephemeral wrap. Publish through the shared `publish` (local + dcosl dual-publish, ADR 0011).
- **Slug** (`submissionSlug`): `sub--isbn-<isbn>` when an ISBN is present, else `sub--<title>--<author>`, always suffixed with the submitter's pubkey8 — deterministic + idempotent per submitter, collision-safe across submitters.
- **`GET /api/submissions/mine`** lists the signed-in user's submissions (query `book-submissions` by author) → shown on `/profile/me`. Canonical catalog reads are unaffected.

## Consequences
- New concept + route (`routes/submissions.ts`) + template; web client + Submit wiring + "your submissions". `book-submissions` header added to the seeder. No new endpoint shape on the read side; no schema change beyond the concept builder.
- Submissions are NOT in the catalog/search yet — that's promotion (16b, trust-gated, also unlocking the accusatory-tag role gate).

## Out of scope → 16b
Trust-gated promotion into the catalog + search; the curator/role gate; a public community-submissions browse; OL metadata autofill; author claim/verification.
