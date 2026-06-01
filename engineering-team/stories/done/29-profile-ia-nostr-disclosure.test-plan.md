# Test Plan: Story 29 — Profile IA: progressive disclosure of nostr internals

**Story:** `engineering-team/stories/done/29-profile-ia-nostr-disclosure.md`
**ADR:** `engineering-team/decisions/0030-profile-ia-nostr-disclosure.md` (incl. the 2026-06-01 Amendment that pins the presentation)
**Date:** 2026-06-01
**Phase:** Test Design (failing tests committed; Implementer has a fixed target)

## Scope of this plan

Web-only IA/component refactor. No new API, schema, write path, or crypto (AC-7).
Tests mock `useSession` / `useProfileMeta` / `navigator.clipboard`; role-scoped
queries; no `Date.now()` in asserted output; no intra-module reach into `src/`.
Test runner: **Vitest + Testing Library** under `happy-dom`
(`apps/web/vitest.config.ts`). No relay / Docker prerequisite — all data is mocked.

### The pinned presentation contract (ADR Amendment) the tests enforce

- Explainer + labels are **always-visible on-page text**, never `title`/hover.
- The npub renders as a **monospace, middle-truncated** code chip via
  `shortNpub` (`apps/web/src/lib/view-model.ts`: `slice(0,10)+"…"+slice(-4)`).
  For the canonical fixture npub the chip is **`npub1n0ewa…rk23`**.
- The **full** npub is what `CopyButton` writes to the clipboard; the **visible**
  value is the truncated chip.
- **Settings** is the canonical home (heading + explainer + `Your npub` label +
  chip + Copy, both tiers).
- **Sovereign** ProfileMe header: quiet `npub` label + chip + Copy, **no**
  explainer line. **Custodial** ProfileMe header: **no** npub, plus a
  `Manage your nostr identity` link → `/settings`.
- Tier branch on `user.email === null`.

## Coverage map (all 7 ACs)

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| **AC-1** default profile drops the bare npub (custodial) | `custodial header is clean > does not render the raw full npub anywhere in the header` | `apps/web/test/routes/profile-me-nostr-identity.test.tsx` | component |
| AC-1 (sovereign, bare-string gone) | `sovereign nostr-identity header > no longer prints the bare full npub under the name` + the `…not the bare full npub` guards | `profile-me-polish.test.tsx`, `profile-me-shelves.test.tsx`, `profile-me-capped.test.tsx`, `profile-me-substack.test.tsx` | component |
| **AC-2** explicit, labeled Nostr-identity surface houses the npub | `Nostr identity section, {sovereign,custodial} tier > renders a 'Nostr identity' heading` + `…labels the npub with 'Your npub'` + `…renders a CopyButton in the section` | `apps/web/test/routes/settings-nostr-identity.test.tsx` | component |
| **AC-3** click-to-copy works + is announced + keyboard + a11y name + failure-safe | `CopyButton — *` (accessible name, copies FULL value, keyboard-activatable, role=status "Copied", "Copy failed" on reject + on absent clipboard, never throws) | `apps/web/test/components/copy-button.test.tsx` | component |
| AC-3 (copy wired on a surface) | `sovereign header … renders a CopyButton that copies the FULL npub`; `Nostr identity … copies the FULL npub while the visible chip stays truncated` | `profile-me-nostr-identity.test.tsx`, `settings-nostr-identity.test.tsx` | component |
| **AC-4** plain-language explainer present + slop-free + visible (not tooltip) | `Nostr identity section … shows the persistent explainer as visible on-page text (not a tooltip)`; `… copy passes the no-slop rule (no em dash, no emoji)` | `settings-nostr-identity.test.tsx` | component |
| **AC-5** tier-differentiated (custodial clean, sovereign keeps npub) | `custodial header is clean > offers a 'Manage your nostr identity' link to /settings` + `…does not render a copy control`; `sovereign header keeps a labeled, copyable npub > shows a quiet 'npub' label` + `…MIDDLE-TRUNCATED chip, never the bare 63-char string` + `…does NOT render the Settings explainer line in the header (Amendment §4)` + `…does not offer the custodial link` | `profile-me-nostr-identity.test.tsx` | component |
| **AC-6** Settings aligned, existing fields keep working | `Nostr identity section, {both} tiers …` (canonical layout); `existing fields keep working alongside the new section > still renders the Substack field` + `…the custodial Display-name field` + `…does not add a second editable npub textbox` | `settings-nostr-identity.test.tsx` (+ unchanged `settings.test.tsx`, `settings-display-name.test.tsx`) | component |
| **AC-7** no new data/endpoint/write; copy hits clipboard not server | `Nostr identity … hits the clipboard, not the server, on copy`; (CopyButton tests assert only `navigator.clipboard.writeText` is touched) | `settings-nostr-identity.test.tsx`, `copy-button.test.tsx` | component |

Every AC has at least one test; AC-3/AC-5 (the load-bearing presentation pins)
have several.

## Edge cases explicitly covered

- [x] Clipboard `writeText` **rejects** (permission denied / insecure context) →
  `Copy failed`, no throw, no unhandled rejection.
- [x] `navigator.clipboard` **absent** entirely → `Copy failed`, no throw, no
  write attempted, never falsely reports success.
- [x] Keyboard activation of the real `<button>` (Enter) copies the full value.
- [x] **Truncated-visible / full-copied** divergence asserted on both surfaces
  (the chip shows `npub1n0ewa…rk23`; `writeText` is called with the 63-char npub).
- [x] **Tooltip negative:** the explainer is matched by `getByText` and asserted
  **not** to be carried by a `title` attribute (Amendment §1).
- [x] **No-slop:** the exact pinned explainer string is asserted verbatim; the
  section copy is checked for em dash and emoji.
- [x] Read-only surface: no second editable `npub` textbox is introduced; the
  existing Substack / Display-name input negatives in `settings.test.tsx` stay
  valid because the npub chip is not a `textbox`.

## "On-page text, not tooltip" — how it is asserted

`settings-nostr-identity.test.tsx` finds the explainer with
`getByText(EXPLAINER)` (proves it is real DOM text) and additionally asserts
`expect(line).not.toHaveAttribute("title", EXPLAINER)` (proves the meaning is not
hiding in a hover-only `title`). The ProfileMe sovereign test asserts the
explainer is **absent** from the header entirely (`queryByText(EXPLAINER)` null).

## "Truncated-visible / full-copied" — how it is asserted

On both Settings and the sovereign ProfileMe header: `getByText("npub1n0ewa…rk23")`
(the `shortNpub` form is the visible value) AND `queryByText(FULL_NPUB)` is null
(the bare 63-char string is never shown), while clicking the copy control asserts
`writeText` was called with the **full** 63-char npub.

## Files (new + migrated)

### New (Tester-owned)
- `apps/web/test/components/copy-button.test.tsx` — 10 tests for the shared
  `CopyButton` (AC-3, AC-7). Currently a **collection error** (the
  `src/components/CopyButton` module does not exist), which is the correct
  not-implemented red.
- `apps/web/test/routes/settings-nostr-identity.test.tsx` — 16 tests for the
  canonical Settings "Nostr identity" section, both tiers (AC-2/AC-4/AC-6/AC-7).
- `apps/web/test/routes/profile-me-nostr-identity.test.tsx` — 8 tests for the
  ProfileMe tier branch (AC-1/AC-5, Amendment §2/§4).

### Migrated (Tester-owned) — existing files re-expressed against the new header
- `apps/web/test/routes/profile-me-polish.test.tsx` — Story-19 shelf/stats
  behaviors **unchanged**; added a `sovereign nostr-identity header` block
  (bare npub gone; truncated chip + CopyButton present) + `FULL_NPUB`/`SHORT_NPUB`
  constants + migration note in the file header.
- `apps/web/test/routes/profile-me-shelves.test.tsx` — Story-18 shelf behaviors
  unchanged; added a sovereign header-npub guard.
- `apps/web/test/routes/profile-me-capped.test.tsx` — Story-21 capped-stat
  behaviors unchanged; added a sovereign header-npub guard.
- `apps/web/test/routes/profile-me-substack.test.tsx` — Story-20 Substack-link
  behaviors unchanged; added a sovereign header-npub guard **and a custodial
  render case** (Substack link still shows; npub gone; `Manage your nostr
  identity` link present).
- `apps/web/test/routes/settings.test.tsx` — the former
  `exposes ONLY the Substack field` test is **carved out** (renamed to
  `exposes no editable name/bio/picture/nip05 fields (the npub surface is
  read-only, not an input)`): the input-label negatives are **preserved**
  unchanged, and a new negative confirms the npub is not an editable `textbox`.
  No existing assertion was weakened or dropped.

### Reviewed, intentionally NOT changed
- `apps/web/test/routes/profile-following-count.test.tsx` — renders **`Profile`**
  (the public `/profile/:npub` route), which Story 29 and ADR 0030 scope **OUT**
  ("other-user public profiles unchanged"). It asserts following-count cells, not
  the npub, and its mocked meta resolves a name so no header-npub assertion
  applies. Left untouched.
- `apps/web/test/routes/settings-display-name.test.tsx` — confirmed still green;
  its role-scoped `display name` queries are unaffected by the new read-only
  section. No change needed.
- `apps/web/test/components/account-menu*.test.tsx` — AccountMenu is not modified
  by this story; untouched.

## Grep proof — every raw-npub render enumerated (Story-28 lesson)

Searched the whole web test dir for the canonical full-npub fixture and for
npub-display patterns:

```
grep -rn "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23" apps/web/test
  → profile-me-capped.test.tsx       (sovereign fixture → header rendered the bare npub)
  → profile-me-shelves.test.tsx      (sovereign fixture → header rendered the bare npub)
  → profile-me-polish.test.tsx       (sovereign fixture → header rendered the bare npub)
  → profile-me-substack.test.tsx     (sovereign fixture → header rendered the bare npub)
  → profile-following-count.test.tsx (renders Profile/public — OUT of scope; untouched)
  → settings.test.tsx                (npub is DATA, not a rendered bare string)
  → settings-display-name.test.tsx   (npub is DATA, not a rendered bare string)
```

Source grep confirming where the bare `me-npub`/`title` render lives:
`ProfileMe.tsx` lines 104–106 (the element this story dresses) and `Profile.tsx`
lines 100–102 (the public twin — explicitly OUT of scope, left as-is). Every test
file that renders the bare npub via `ProfileMe` is migrated above; the only other
renderer is the out-of-scope public `Profile`.

## How to run

```
pnpm --filter @unbnd/web exec vitest run
```

## Verification — red for the right reasons

Confirmed 2026-06-01 on branch `feat/profile-ia`. Full web suite:

```
 Test Files  7 failed | 34 passed (41)
      Tests  26 failed | 195 passed (221)
```

The 7 failing files are exactly the Story-29 targets (4 migrated profile-me +
the 2 new profile/settings suites + the new CopyButton suite). The other 34
files (195 tests), including `settings.test.tsx`, `settings-display-name.test.tsx`,
and `profile-following-count.test.tsx`, stay **green**.

### Not-implemented vs test-bug

All failures are because the feature is not built yet, not test bugs:

- **`copy-button.test.tsx`** — collection error, the correct not-implemented red:
  ```
  Error: Failed to resolve import "../../src/components/CopyButton" from
  "test/components/copy-button.test.tsx". Does the file exist?
  ```
  (10 tests blocked on the missing `CopyButton` module.)

- **`settings-nostr-identity.test.tsx` (14 failed)** — the `Nostr identity`
  heading, the `Your npub` label, the explainer line, the truncated chip, and the
  CopyButton are not rendered yet, e.g.
  `Unable to find an accessible element with the role "heading" and name /nostr identity/i`
  and `Unable to find an element with the text: npub1n0ewa…rk23`.

- **`profile-me-nostr-identity.test.tsx` (6 failed)** — the current header still
  renders the bare full npub with `title=...`, so:
  - `Unable to find an element with the text: npub1n0ewa…rk23` (truncated chip not built),
  - `Unable to find role="link" and name /manage your nostr identity/i` (custodial discovery link not built),
  - `Unable to find an element with the text: /^npub$/i` (sovereign quiet label not built).

- **Migrated profile-me files (`polish` 2, `shelves` 1, `capped` 1, `substack` 2)**
  — same root cause: the bare full npub is still present and the truncated chip /
  custodial link are not, e.g. `Unable to find an element with the text:
  npub1n0ewa…rk23`. The DOM dumps show the still-shipped
  `title="npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23"` element.

When the Implementer builds `CopyButton`, the Settings section, and the ProfileMe
tier branch per ADR 0030, all 26 (+ the 10 CopyButton) tests pass and the green
suite stays green.
