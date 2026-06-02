# Review: Story 33 — Accusatory-tag gate (curator-gated write + ops reveal + filter-at-read)

**Story:** `engineering-team/stories/done/33-accusatory-tag-gate.md`
**ADR:** `engineering-team/decisions/0034-accusatory-tag-gate.md` (incl. 2026-06-02 ops-only-trigger Amendment)
**Test plan:** `engineering-team/stories/done/33-accusatory-tag-gate.test-plan.md`
**Base:** `main` … `feat/accusatory-gate`
**Date:** 2026-06-02

## Verdict: APPROVED

This is the project's most defamation-sensitive feature. I reviewed it adversarially — every gate,
the no-auto-reveal invariant, the write-gate bypass surface, key isolation, and test integrity. It
holds.

## Gates (run by the Reviewer, not trusted from the Implementer)

- `pnpm -r typecheck` — **PASS** (exit 0; all packages green).
- `pnpm -r test` — **PASS**. schemas 112, api 713 (+10 pre-existing infra-gated skips), web 282,
  promoter 28, search 11, seeder 12, indexer 6. No flake; deterministic.
  The 10 api skips are `db/integration.test.ts` (gated on `DATABASE_URL`) and
  `nostr/integration.test.ts` (gated on `STRFRY_TEST_URL`) — pre-existing, not Story-33 work hidden.
- `pnpm -r build` — **PASS** (exit 0). `pnpm --filter @unbnd/promoter bundle` — **PASS**, produced
  `apps/promoter/dist/index.js` (312 KB).
- Story-33 test count: 64 (schemas 10, api 31, promoter 17, web 6) — matches the ~60 claim.

Commit set coherent: story → ADR → amendment → red tests `33a6ac4` → impl `7f5b8cb`.

## No-auto-reveal (the load-bearing invariant) — CONFIRMED

`apps/api/src/tags/aggregate.ts:187` — `if (isAccusatory && !revealedTagSlugs.has(slug)) continue;`.
The ONLY input that surfaces an accusatory tag is membership in `revealedTagSlugs`. No count, no
trust weight, no polarity tally, no `weighted`/`trusted` flag, and no default feeds that set.

`apps/api/src/routes/tags.ts:75-107` (`resolveRevealedSlugs`) — a slug enters the set ONLY when the
LATEST event per (book,tag) d-tag has `state === "revealed"`. A later `withdrawn` supersedes by
`created_at`. The set is built purely from librarian-signed reveal events; assertions are never
consulted.

Attempted exploits (all fail to reveal):
- 12-assertion flood, no reveal → stays hidden (`tags-reveal-read.test.ts:206`, verified green).
- High trust weight / `weighted:true` → does not set `revealed` (`aggregate-reveal.test.ts:117`).
- Trust degrade / throwing seam → reveal path untouched (reveal is independent of trust).
`revealedTagSlugs` defaults to `new Set()` (`aggregate.ts:134`); `aggregateBookTags` and every
existing caller are byte-unchanged (`aggregate-reveal.test.ts:83` asserts empty-set ≡ omitted).

## Write-gate bypass-proofing — CONFIRMED

`apps/api/src/routes/tags.ts:268-290`. Gate runs BEFORE either tier path. Sensitivity is resolved
from the SIGNED EVENT on the sovereign path (`firstTTag(req.body.event.tags)`, line 282/64-66) and
from the body intent on the custodial path (no client event exists). A crafted body claiming a
normal slug while the signed event's first `t` is `ai-generated` is still gated 403
(`tags-accusatory-gate.test.ts:153`, green). Anon → 401, below → 403 `below_gate`, degrade → weight
0 → 403, never 500 (throwing-seam test `:276`). Normal genre/style + unknown slugs unaffected for any
signed-in user both tiers (`:211-247`). `houseWeightOf` (`:122-131`) is the lifted Story-30 helper,
reuses `curatorThreshold`, fail-closed.

NON-BLOCKING note (defensible, not a defamation breach): the write gate reads the wire `["t",…]`
tag, while the read aggregate keys visibility off the `["json",…]` payload `tagSlug`
(`wire.ts:78` / `BookTagAssertion.ts:108`). A hand-crafted sovereign event could set first `t` =
normal but payload `tagSlug` = accusatory, slipping the *write* gate. It does NOT breach the
defamation invariant: the read aggregate independently hides that accusatory `tagSlug` unless a
librarian reveal exists, so it never becomes visible. The realistic UI-bypass (body lies, signed
event carries accusatory) is blocked. Worth a follow-up to align the two field reads, but not
blocking.

## Canonical integrity + filter-at-read — CONFIRMED

Reveal lookup is ONE batched `#a`-scoped query (`tags.ts:176`; asserted single-call + `#a`-scoped at
`tags-reveal-read.test.ts:163`, no N+1). Latest-per-d-tag by `created_at`, withdrawn supersedes
(`:178`), out-of-order resolves to latest (`:192`). Canonical `BookTagAssertion` events are never
mutated/deleted — visibility composed at read time; `aggregate-reveal.test.ts:143-153` snapshots the
assertion array and asserts byte-identical before/after a reveal, with raw `applies` intact.

## Key isolation + worker — CONFIRMED

`LIBRARIAN_NSEC` appears ONLY in `apps/promoter/src/main.ts` (decoded at runtime, `finalizeEvent`,
lines 44-49/85-90) and `apps/seeder/src/index.ts` — NONE under `apps/api/src` (grep + the real
filesystem-scan guard `no-librarian-nsec-in-api.test.ts`, green). No `POST /api/tags/reveal`,
no `/withdraw`, no `not_librarian` (grep NONE). No reveal button / in-app reveal UI in `apps/web`
(grep NONE). The `reveals` table + migration `0004` live in `apps/api/src/db` (the API runs the DDL)
but the API never signs — the operator CLI (`apps/promoter/src/reveal/cli.ts`) upserts the row
(idempotent on `UNIQUE(book_slug,tag_slug)`), and `runRevealCycle` (`cycle.ts`) mints via the
worker's `finalizeEvent` + publishes local+dcosl + markDone. No hand-rolled crypto.

## Curator-gate reuse + honest render — CONFIRMED

Same house-PoV `houseWeightOf` ≥ `curatorThreshold` as Story 30, fail-closed, no new env, no client
weight/observer spoof. `canAssertAccusatory` computed once per request (`tags.ts:189-193`;
single-seam-hit asserted at `:329`), drives the picker only; server is the real gate.
`apps/web/src/components/TagControl.tsx:144-155` renders a revealed accusatory tag in a separate
"Reviewed signals" block, "Surfaced by a librarian review", NO count/tally, NOT labeled
"community/trusted consensus" (the consensus label applies only to genre/style chips, `:84/130`).
Brand tokens (`var(--signal-negative)`), no new icon library, no new hex outside the file's existing
CSS-fallback pattern. Copy slop-free. Picker offers accusatory signals only when
`canAssertAccusatory` (`:66/193`).

## Schema additive — CONFIRMED

`AccusatoryReveal` is a new event under the new `accusatory-reveals` header. `BookTag`,
`BookTagAssertion`, `BookRecord` schemas NOT widened (diff empty). `index.ts` adds one export.
`aggregate`'s `revealedTagSlugs` is optional/default-empty. Round-trip (reveal + withdraw) green.

## Test integrity — CONFIRMED

Meaningful and adversarial (smuggle, 12-flood, withdraw-supersede, out-of-order, N+1 guard,
throwing-seam degrade, no-count-tally render). Deterministic: fixture trust, fake worker signer
(no real key) + fake publisher, fixed `created_at` in asserted output. `vi.mock` only on the web's
sibling api-client + session hook (no intra-module mock of the unit under test). No existing test
weakened/skipped — `tag-control.test.tsx`, `tags.test.ts`, `tags-weighted.test.ts`,
`aggregate-weighted.test.ts`, the NSEC guard, and the ADR-0014 architecture guard are byte-untouched
and green.

## Scope / firewall — CONFIRMED

No auto/emergent reveal, no automated AI-detection, accusatory only on books, no curator-role system,
no house-observer swap, no reveal endpoint/UI. ADR rationale is moderation-framed, not legal/business.
No business/grant/community content. Story / ADR / amendment / test-plan consistent.

## Findings

- **BLOCKING:** none.
- **NON-BLOCKING:** the write gate reads the wire `t` tag while the read aggregate keys on the json
  payload `tagSlug` (`tags.ts:282` vs `aggregate.ts` via `wire.ts:78`). A hand-crafted sovereign
  event could record an accusatory assertion past the *write* gate by diverging the two; it never
  becomes visible (the read gate independently hides it absent a reveal). Recommend a follow-up to
  resolve sensitivity from the same canonical field both places.

PASS / APPROVED.

## Re-review — hardening (2026-06-02)
The non-blocking wire-`t`/payload-`tagSlug` divergence finding above was **folded in and fixed** (test `fa52941`, impl `543c040`): `POST /api/tags` now validates the signed event first, then rejects any tag-assertion whose wire `["t",…]` ≠ the canonical payload `tagSlug` (parsed via the same `fromWireEvent`→`fromBookTagAssertionEvent` pipeline the read uses) with `400 tag_mismatch`, not published, weight-independent; and the write gate resolves sensitivity from that canonical `tagSlug` (read-aligned). The exploit (below-gate, wire=normal/payload=accusatory) now returns 400 not-published (was 200); symmetric + above-gate-divergent + malformed-payload all 400; the custodial path and all consistent-event gate behavior are unchanged (6 additive tests, 23/23 green). Gates re-run green (api 719/10-skip, typecheck, build, promoter bundle); no-auto-reveal / canonical-never-mutated / LIBRARIAN_NSEC-worker-only / ADR-0014 guards all still green; no test weakened. **Finding resolved. Final verdict: APPROVED. Completes Block C.**
