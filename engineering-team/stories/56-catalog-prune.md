# Story 56: Prune existing catalog junk that fails the legitimacy gate

**Status:** Backlog
**Created:** 2026-06-04
**Type:** Feature / Data / Ops

## Background

Story 55 ships the catalog expansion, the legitimacy gate, and in-place enrichment of still-passing books. It deliberately does **not** remove the legacy records that fail the new gate: junk seeded before the gate (vanity one-offs, study guides, pamphlets, box sets, records with no cover or a bad year) persists on the relay and in search.

This story removes that junk. The goal is that catalog records which fail the Story-55 legitimacy gate do not survive — the catalog reads like a real bookstore rather than carrying old noise forward. The gate function built in Story 55 is the **shared oracle**: this story re-applies it to the existing librarian-published records and deletes the ones that positively fail, via an in-protocol NIP-09 kind-5 deletion (not a destructive wipe).

The prune was split out of Story 55 because of a **verified integration gap** (confirmed against source and `ops/sync-runbook.md`, 2026-06-04): the seeder publishes to **dcosl**, and catalog data reaches the **local** strfry (the indexer's source, via `STRFRY_URL`) only through the down-sync cron `/etc/cron.d/unbnd-sync` (`--dir down`), whose filter pulls **only kinds 39998/39999**. A kind-5 delete published to dcosl therefore **never reaches the local strfry**, so the indexer — which rebuilds from local relay state and reads only kind 39999 — would never drop the deleted book; the prune would silently not take effect. Closing the gap requires a down-sync filter change to propagate librarian kind-5 to the local strfry, plus a confirmation that the local strfry honors NIP-09 deletion on ingest (stubbed in stories 28b/30b, never exercised in this deployment). The full prune design is preserved in ADR 0054's "Deferred to Story 56 (prune existing junk)" subsection — start there.

## User-facing description

As a Reader browsing and searching Unbnd, I want the junk records that predate the legitimacy gate (vanity one-offs, study guides, pamphlets, box sets, records with no cover or an implausible year) to be **gone** from browse and search, so that the catalog is uniformly trustworthy rather than clean only for books added after the gate.

## Acceptance criteria

(Stub-level — refined when the story is picked up.)

- [ ] Given the librarian's existing kind-39999 book records on the relay, when the prune runs, then it **reads** them (`#z`-scoped to book records only) and re-evaluates each against the **Story-55 gate** (the shared gate function — not a re-implementation).
- [ ] Given an existing record that **positively fails** the gate on its stored fields (missing title/author, missing cover, junk-denylist title, out-of-range year), when pruned, then the librarian **publishes a NIP-09 kind-5 deletion** referencing the offending event **by event id (`e` tag)**, signed through the existing librarian signing path (`finalizeEvent` — never bespoke crypto).
- [ ] Given a record that **still passes** the gate, or that fails only on signals the legacy records lack (edition/language/pages — absence is not evidence of failure), when the prune runs, then it is **never deleted**.
- [ ] Given a non-book or assertion event (also kind 39999, separated by `#z`), when the prune runs, then it is **never targeted** (the `#z=booksZ` read filter structurally excludes it).
- [ ] Given the prune has published deletions, when a **full re-index** runs afterward against a flushed index, then the deleted books are **dropped from search** (no longer returned) and no stale documents linger.
- [ ] Given the pass re-runs, when it runs again, then it is **idempotent and resumable** (a `prune:<eventId>` checkpoint namespace short-circuits an already-published deletion).
- [ ] Given CI, when it runs, then the prune's unit tests (keeper excluded, junk candidate deleted by `e`-tag, idempotent re-run no-op, never targets an assertion `#z`) and `pnpm -r typecheck` / `pnpm -r test` are green.

## Required capabilities

This story builds three capabilities the seeder does not have today:

1. **Relay read** of the librarian's kind-39999 **book** records (`{kinds:[39999], authors:[librarian], "#z":[booksZ]}`, paged past the relay cap — port the indexer's `queryAllPages`).
2. **kind-5 publish** through the existing librarian signing path (`finalizeEvent` → `relay.publish`).
3. **Down-sync filter change** to propagate librarian **kind-5** events to the local strfry, so a deletion published to dcosl actually reaches the indexer's relay (`/etc/cron.d/unbnd-sync`, `--dir down`, currently kinds 39998/39999 only).

## Prerequisite operator verification (gate the build on this)

Before building, the operator must **verify the local strfry honors NIP-09 deletion on ingest** — a quick droplet test: publish a kind-5 for a known event, sync it down, and confirm the target event vanishes from a REQ on the local strfry. This is unverified in this deployment (stubbed in stories 28b/30b). If the local strfry does **not** suppress on REQ, the prune cannot take effect by deletion alone and the approach (or an indexer-side deletion-aware read fallback) must be reconsidered. **Do not start the build until this verification passes.**

## DList shapes touched

- `kind:5` — NIP-09 deletion (NEW for the seeder). The librarian publishes a kind-5 referencing each failing book record by event id (`e` tag), with `["k","39999"]` per NIP-09, signed through the existing librarian path. See ADR 0054's "Deferred to Story 56" subsection for the exact template.
- `kind:39999` — book record, **read only** here (no new write beyond the kind-5 above). Distinguished from `BookTagAssertion` (also kind 39999) by the books-header `#z`.

## Out of scope

- **No change to the gate.** The Story-55 gate function is reused as-is; this story does not re-tune signals or the denylist.
- **No re-expansion or re-enrichment.** Growth and enrichment shipped in Story 55; this story only removes.
- **No web / API / design-system change.** Seeder + the down-sync filter + a flushed re-index only.
- **No popularity-based deletion.** Deletion is on positive junk evidence only, never on low readership or absence from the fresh gated set.

## Open questions

For the Architect, when the story is picked up (ADR 0055):

1. **Down-sync filter shape.** How to extend `/etc/cron.d/unbnd-sync` (`--dir down`) to pull librarian kind-5 without over-pulling — scope to the librarian author and/or a `#k`/`#e` constraint where the relay supports it.
2. **Local-strfry NIP-09 behavior.** Confirm (per the prerequisite verification) the exact suppression semantics on REQ after a kind-5 syncs down, and pin the re-index step (flush-before-rebuild) that reflects deletions.
3. **Diff source for the re-gate.** Re-confirm the conservative stored-field re-gate (delete only on positive junk evidence; never on missing edition/language/pages) from ADR 0054, and how it keys against the epoch checkpoint and the `prune:<eventId>` namespace.

## Linked artifacts

- **Depends on:** Story 55 / ADR 0054 — the legitimacy gate function is the shared oracle, and ADR 0054's "Deferred to Story 56 (prune existing junk)" subsection holds the full prune design (read path, kind-5 shape, conservative diff, idempotency/safety, and the integration gap that motivates this story).
- ADR: `engineering-team/decisions/0055-catalog-prune.md` (to be written by the Architect when this story is picked up).
- Test plan: (filled in after Test Design phase)
- Review: `engineering-team/reviews/56-catalog-prune.md` (pending).
