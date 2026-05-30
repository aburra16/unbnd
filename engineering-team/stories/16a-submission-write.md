# Story 16a: Submission write-path (community submissions)

**Status:** Approved (logged; build not yet started)
**Created:** 2026-05-29
**Type:** Feature

## Background

Story 15 gates the Submit form behind a dedup search, but the form's `onSubmit`
is still a stub. This story makes a submission actually publish — as a
**community submission in its own space**, kept separate from the
librarian-seeded canonical catalog (operator decision). Promotion of trusted
submissions into the main catalog is **story 16b**.

## Decisions (locked with operator)

- A submission is a **user-signed kind-39999 book record** z-tagged to a new
  **`book-submissions`** concept (NOT the librarian's `books` concept). Reads of
  the canonical catalog stay unaffected.
- **Signing reuses the existing write path:** sovereign → NIP-07 client-sign;
  custodial → server-side ephemeral wrap. Publish to the local relay + dcosl
  dual-publish (ADR 0011), like ratings/tags.
- **Slug/identity:** ISBN-13 when present, else a normalized `title--author`
  slug; collision-safe (append a short author-pubkey suffix, mirroring the
  assertion d-tag pattern).
- Submissions surface as **"your submissions"** (on the profile) — visible to
  the submitter; not merged into the public catalog yet (that's 16b).

## Acceptance criteria

- [ ] AC-1: Submitting the (story-15-revealed) form builds a kind-39999 record from the form fields via `@unbnd/schemas`, z-tagged to the `book-submissions` concept, signed by the user (sovereign NIP-07 / custodial server-wrap), and published (local + dcosl).
- [ ] AC-2: A deterministic, collision-safe slug is derived (ISBN-13 → normalized title+author+suffix); resubmitting the same book by the same user is idempotent (replaceable d-tag).
- [ ] AC-3: After submit, the user sees their submission (a "your submissions" section on `/profile/me`) and a confirmation; the canonical catalog/read paths are unchanged.
- [ ] AC-4: Validation + honest states (required fields, signing failure → reauth for custodial, publish failure messaging); no fabricated success.
- [ ] AC-5: Verified live on staging: a sovereign user submits → the record lands on dcosl/local and shows under their submissions; it does NOT appear in the main catalog (pending 16b).

## Out of scope → 16b
Trust-gated **promotion** into the canonical catalog; the curator/role gate
(shared with the accusatory-tag gate); a public "community submissions" browse;
OL metadata autofill; author-claim/verification.

## Linked artifacts
- ADR: `engineering-team/decisions/0016-submission-write.md` (to write at build time)
- Builds on: story 15 (dedup), ADR 0011 (write path), `@unbnd/schemas` BookRecord.
