# ADR 0030: Profile IA — progressive disclosure of the nostr identity (npub)

**Status:** Proposed
**Date:** 2026-06-01
**Story:** `engineering-team/stories/29-profile-ia-nostr-disclosure.md`

## Context

`/profile/me` prints a raw 63-char `npub1…` string directly under the display name
with no label, no explainer, and no copy affordance (only a `title` tooltip). For a
custodial (email-signup) user who has never heard of nostr, that reads as a bug or
noise, not as their identity. Story 29 (a UX Bug) relocates and dresses this
already-rendered field. It is **web-only**: it consumes `session.user.npub`,
`session.user.email` (the tier branch), and `useProfileMeta` — no new API, no schema,
no write path (AC-7).

**Verified against current `feat/profile-ia` (cite line numbers):**

- **`apps/web/src/routes/ProfileMe.tsx` lines 99–119** — the `<header className="me-head">`:
  `<Avatar>` (line 100), `me-name` (line 102), optional `me-nip05` (line 103), then
  **line 104–106** `<p className="me-npub" title={user.npub}>{user.npub}</p>` — the bare
  raw npub. `me-about` (line 107) and `me-substack` (lines 108–117) follow. This is the
  exact element the story removes/dresses. `ProfileMe.css` line 26–31 (`.me-npub`) is
  text styling only (mono, muted, `word-break`) — no cursor/copy behavior.
- **`apps/web/src/routes/Settings.tsx`** — gated like ProfileMe (loading → `route-status`;
  signed-out → `<Navigate to="/auth">`, lines 60–73). Holds the Substack form (lines
  157–219) and the custodial-only Display-name form (lines 221–275). It already branches
  tier at **line 78**: `const isSovereign = user.email === null`. It does **not** today
  expose the npub. `Settings.css` provides `set-head`, `set-title`, `set-sub`, `set-form`,
  `set-field` (label + input), `set-hint`, `set-error`, `set-saving`, `set-saved`,
  `set-actions`, `set-save`, `set-clear`.
- **`apps/web/src/components/AccountMenu.tsx` lines 16–18, 70–85** — `shortNpub(npub)`
  truncates to `npub1xxxxxxxx…xxxx`; the menu shows it at line 74 (`acct-npub`, mono,
  `AccountMenu.css` lines 58–62). "Your profile" → `/profile/me` (lines 70, 77);
  "Settings" → `/settings` (line 83). This is the existing nav path a custodial user uses
  to reach Settings.
- **`apps/web/src/lib/view-model.ts` lines 57–61** — `shortNpub(npub)`: returns the npub
  unchanged if `≤16` chars, else `npub1abcd…wxyz`. The canonical truncated-display helper;
  `AccountMenu` has a private duplicate (lines 16–18) — out of scope to dedupe here, but
  the sovereign header will import the `view-model.ts` one.
- **Data shapes confirmed.** `PublicUser` (`api.ts` lines 5–10): `{ id, email: string | null,
  displayName, npub }`. `useSession()` (`hooks/useSession.ts`) yields
  `{ status, user, refresh }`. `useProfileMeta(npub)` → `ProfileMeta | null`. The three
  inputs the story names (`session.user.npub`, `session.user.email`, `useProfileMeta`) are
  the only data needed. **No new API/endpoint/schema/write.**

**PRD anchor:** Appendix **C-5** "Profile information architecture: progressive disclosure
of nostr internals." C-5's engineering note: "purely a web IA/component refactor — no new
API, no schema change; consumes the same `session.user.npub` + `useProfileMeta`." This ADR
holds that line. The copy/visual no-slop rule (`memory/feedback_unbnd_copy_and_visual.md`)
governs every string. Its **Bridging principle** sanctions "a future Settings → Advanced
section where the user can inspect their nostr identity, see their npub, manage relays" as
the **one place** the words "nostr"/"npub" may surface — this ADR builds that place, in
Settings.

**Gate decisions (resolved by the user 2026-06-01, baked in below, not open):**

1. **Tier-differentiated disclosure.** Custodial (`email !== null`): the raw npub is
   **removed** from the `/profile/me` header; it lives only in the Settings "Nostr identity"
   surface. Sovereign (`email === null`): the npub **stays** in the `/profile/me` header,
   but as a **labeled + copyable** element, never a bare string.
2. **Canonical surface = Settings.** The "Nostr identity" surface (npub + plain explainer +
   click-to-copy) lives in `/settings`, for **both** tiers. ProfileMe's job is only: (a) drop
   the raw npub for custodial, (b) keep a labeled/copyable npub for sovereign, (c) give
   custodial users a discoverable way to reach the Settings surface.
3. **nsec export is OUT** — it does not exist in the product; this ADR does not design it.
   (PRD C-5's claim it "already exists from Phase 1" is **false**; flagged at close-out.)

This ADR does not contradict any prior ADR. It aligns with **ADR 0012** (the profile/identity
surface; its "copyable-npub" note is now honored) and mirrors the Settings field/section
patterns established by **ADR 0022** (Substack) and **ADR 0028** (custodial display-name).

## Options considered

The gate settled the IA forks (tier-differentiated; Settings-home; nsec out). Two design
forks remain: **(F1)** how the copy affordance is structured, and **(F2)** the Settings
surface mechanism (section vs tab/route).

### F1 — The copy affordance

#### Option A — One reusable `<CopyButton>` component (chosen)

A single `apps/web/src/components/CopyButton.tsx`, consumed by **both** the Settings "Nostr
identity" field and the ProfileMe sovereign header. Real `<button>`, `navigator.clipboard`,
transient "Copied" state, `aria-label`, `role="status"` announce, graceful clipboard-failure
fallback. One component, one test, two call sites.

- **Pros:** DRY — the AC-3 contract (keyboard, accessible name, announced state, failure
  fallback) is specified and tested **once**; both surfaces stay identical by construction;
  matches the codebase's small-shared-component idiom (`SovereigntyNote`, `Pill`,
  `ToggleSwitch`). **Cons:** one new file. Trivial.

#### Option B — Inline copy handler in each surface

Each surface (Settings field, ProfileMe header) writes its own `onClick` + state.

- **Cons:** duplicates the clipboard/announce/fallback logic in two places; the two will
  drift; the AC-3 a11y contract must be re-asserted per surface; two tests for one behavior.
  Rejected — directly violates the gate's DRY requirement.

### F2 — Settings surface mechanism

#### Option A — A labeled `<section>` on the existing `/settings` page (chosen)

A new "Nostr identity" `<section>` rendered on `/settings` (for both tiers), below the
existing Substack and Display-name forms. Heading `Nostr identity`, a labeled read-only npub
field, the one-line explainer, and the shared `<CopyButton>`. No routing change, no tab
state, no new route.

- **Pros:** lightest mechanism (PO's lean); no router/tab-state change; Settings is already
  the editable-identity home (Substack, display name); reuses `set-*` CSS patterns; the
  surface is visible/labeled (AC-2 "reachable without guessing"). Read-only — it shows the
  npub; it does not edit it, so no form/state-machine is needed (unlike Substack/name).
  **Cons:** the npub sits on the same scroll as the editable fields rather than behind a
  deliberate tab click. Acceptable — AC-2 only requires it be explicit and labeled, not
  hidden behind a tab; the heading "Nostr identity" makes it a distinct, named surface.

#### Option B — A new tab or `/settings/advanced` route

A tab strip on Settings, or a dedicated route.

- **Cons:** adds tab state or a route + nav entry for a single read-only field; heavier than
  the content warrants; C-5 and the PO both lean section-over-tab. Rejected for this story.
  (If C-3 federation / relay management later fills the surface, promoting it to a tab is a
  clean follow-up — the section heading is the seam.)

## Decision

We chose **F1-A (one `<CopyButton>`) and F2-A (a labeled Settings section)**, with the
gate-resolved tier branch and Settings-home IA. Concretely:

### 1. The shared copy control — `apps/web/src/components/CopyButton.tsx`

A single reusable component, the **one** copy affordance for both surfaces (AC-3).

**Props:** `{ value: string; label?: string }` — `value` is the **full** npub to copy
(always the full string, even when the trigger displays a truncated form); `label` is the
visible idle label, defaulting to `"Copy"`.

**Behavior:**

- Renders a real `<button type="button">` (keyboard-focusable and Enter/Space-activatable for
  free — no `div`-with-onClick).
- On activate: `await navigator.clipboard.writeText(value)`.
- **Success:** visible label swaps to `"Copied"` for ~1.5s via a `setTimeout`, then reverts to
  the idle label. (The timer is the only timing; **no `Date.now()`/timestamp** is rendered, so
  asserted output stays deterministic — the Tester asserts the label text, not a time.)
- **Announce (AC-3):** the button carries a stable `aria-label` (default
  `"Copy your npub"`); the **copied** state is announced to AT via a sibling
  `<span role="status">` (an `aria-live="polite"` status region) whose text is `"Copied"`
  while in the copied state and empty otherwise. (Using `role="status"` rather than mutating
  the `aria-label` mid-interaction keeps the accessible name stable and still announces the
  change — the established pattern in this codebase, cf. the `role="status"` saved/saving
  lines in Settings and ProfileMe.)
- **Clipboard-unavailable / rejected-promise fallback (AC-3, robustness):** guard with
  `if (navigator.clipboard?.writeText)` and wrap the call so a rejected promise (older browser,
  insecure context, permission denied) **never throws**. On unavailable-or-rejected, set a
  transient **`"Copy failed"`** visible label + `role="status"` text (same revert timer)
  instead of "Copied". The component never crashes the render and never leaves a dangling
  rejected promise. (No second fallback path like programmatic text-selection is built — the
  failure state is honest and self-clearing, which satisfies AC-3's "handle gracefully, never
  throws"; a select-the-text fallback is noted as a possible future refinement, not required.)
- Cleans up the revert `setTimeout` on unmount.

**Styling:** a new `CopyButton.css` reusing existing tokens only — base on the `set-clear`
ghost-button shape (`var(--u-border-hover)`, `var(--u-radius)`, `var(--u-amber)` focus/hover),
sized to sit inline next to a mono npub. **No new hex literal, no new icon library** (no copy
glyph — the word "Copy" is the affordance, consistent with the no-emoji-as-icons rule).

### 2. Settings "Nostr identity" surface (AC-2, AC-4, AC-6) — both tiers

A new `<section className="set-form">` block on `/settings`, rendered for **both** tiers
(it is the canonical home), placed **after** the Substack form and the custodial Display-name
form (so the editable fields stay first; the read-only identity surface is last). Structure,
mirroring the existing `set-field` pattern:

- **Heading:** `<h2>Nostr identity</h2>` (the one sanctioned "nostr" placement).
- **Field label:** `Your npub` (a `<label>`/labeled element so the bech32 string is never
  unlabeled — AC-4). The npub renders as **read-only display text** (full string, mono,
  `word-break` like `.me-npub`) — **not** an editable `<input>` (it is not editable; an input
  would imply it can be changed). It is presented via a labeled element + the value, so a
  role-scoped query can find it by its label.
- **Explainer (one line, AC-4):** the pinned string in §4 below, in a `set-hint`-styled line.
- **Copy control:** `<CopyButton value={user.npub} />` (full npub; default `"Copy"` label,
  `aria-label="Copy your npub"`).

Reuses `Settings.css` `set-form` / `set-field` / `set-hint` classes; adds at most a small
class for the read-only npub display (mono + `word-break`, reusing `--font-mono`,
`--u-muted`). **No new hex.** The existing Substack (Story 22) and custodial Display-name
(Story 27b) forms are **untouched** (AC-6) — they keep their own `idle|saving|saved|error`
state machines; the new section adds no write and no state machine.

### 3. ProfileMe tier branch (AC-1, AC-5)

Replace `ProfileMe.tsx` lines 104–106 (the bare `<p className="me-npub">`) with a tier branch
keyed off the existing `user.email === null` check (no new data):

- **Custodial (`user.email !== null`):** render **no npub** in the header (AC-1). Add a
  discovery affordance: a quiet text link **`Manage your nostr identity`** → `/settings`,
  styled like the existing muted/secondary profile links (reuse a `me-*` muted class; no new
  hex). **Decision + justification for the discovery affordance:** ship the explicit link
  rather than relying solely on the existing nav-to-Settings. Rationale: the account menu's
  "Settings" entry (AccountMenu line 83) is generic and does not signal that one's identity
  lives there; AC-2 requires the surface be "reachable without guessing," and a custodial user
  who has just had the cryptic string *removed* gets a one-line, in-context pointer to where it
  went. It is one quiet link, slop-free, and it makes the relocation discoverable instead of
  invisible. (It is a `<Link to="/settings">`, matching the router idiom.)
- **Sovereign (`user.email === null`):** render a **labeled, copyable** npub in the header
  (AC-5). Treatment (resolves Open Question 4 to the PO's lean, **truncated + copyable**):
  - A label so it is never bare (e.g. a visually-quiet `Nostr identity` / `npub` label, or the
    `<CopyButton>`'s `aria-label` carrying the semantic — the Implementer renders a short
    visible label such as `npub` next to the value; final micro-copy reviewed against the
    no-slop file).
  - The **displayed** value is the **truncated** form via `shortNpub(user.npub)` from
    `view-model.ts` (matches the existing `AccountMenu` mental model and keeps the header
    tight), rendered in the existing `.me-npub` mono style **without** the old `title`-only
    tooltip.
  - Beside it, `<CopyButton value={user.npub} />` — the **full** npub is copied even though a
    truncated form is shown (the gate's explicit requirement). The full npub + explainer also
    live in the Settings surface (§2), so the header stays compact while Settings is canonical.

  **Justification (truncated-in-header):** a curator references their npub by recognizing its
  head/tail and copying the whole thing; the full 63-char string under the name is the exact
  visual noise this story fights. Truncated-display + full-copy gives recognition without the
  wall of text, reuses the proven `shortNpub` treatment, and the canonical full string is one
  click away in Settings.

### 4. Pinned copy (reviewed against `memory/feedback_unbnd_copy_and_visual.md`)

All strings below pass the no-slop rule: no em dash, no rhetorical contrast, no hedged opener,
no banned filler verb, no exclamation CTA, no emoji. "npub"/"nostr" appear only on the
sanctioned surfaces (Settings section + sovereign header), never in the custodial header.

| Element | String |
|---|---|
| Settings section heading | `Nostr identity` |
| Field label (above the npub) | `Your npub` |
| Explainer (one line, AC-4) | `This is your identity on nostr. It travels with you to any nostr app, and it is how other people follow and reference you.` |
| Copy control idle label | `Copy` |
| Copy control success label | `Copied` |
| Copy control failure label | `Copy failed` |
| Copy control accessible name | `Copy your npub` (`aria-label`) |
| ProfileMe custodial discovery link | `Manage your nostr identity` |
| ProfileMe sovereign header npub label | `npub` (quiet label beside the truncated value) |

The explainer adopts the PO's proposed line verbatim — it is two short clauses, plain Anglo-Saxon
verbs ("travels," "follow," "reference"), no banned construction. **Confirmed passing.** (If the
gate later prefers a single clause, the approved shorter form is
`This is your identity on nostr. It travels with you to any nostr app.`)

### 5. No new data / API / crypto (AC-7)

Confirmed: the change consumes only `session.user.npub`, `session.user.email`, and
`useProfileMeta` (already in both surfaces). The copy action hits `navigator.clipboard` (a web
API), not the server. **No** new API endpoint, **no** schema/migration, **no** event published
or signed, **no** new runtime dependency (clipboard is a platform API; no `@noble`/applesauce
crypto is touched — there is no key/sig math here, only displaying an already-rendered npub).
**No** new hardcoded hex (all color/mono via existing `tokens.css` vars). **No** new
lint/typecheck/build tooling.

## Consequences

- **Enables** the C-5 progressive-disclosure IA: custodial users get a clean human-facing
  header (the reported bug fixed), sovereign users keep a recognizable, copyable npub, and
  Settings becomes the canonical, labeled, explained, click-to-copy home for the nostr
  identity. Honors ADR 0012's deferred "copyable-npub" note.
- **Constrains:** Settings now has a fourth block (read-only Nostr-identity section). The
  shared `<CopyButton>` becomes a small public component contract; future copy affordances
  should reuse it rather than re-rolling clipboard logic.
- **New debt / follow-ups:** the Settings "Nostr identity" section is the future home for C-3
  (provider→npub federation) and any relay display/management — neither built here. If that
  content grows, promote the section to a tab (the heading is the seam). `view-model.ts`
  `shortNpub` and the `AccountMenu` private `shortNpub` duplicate remain un-deduped (out of
  scope). **nsec export does not exist and is not built** (gate decision 3); PRD C-5's claim
  it exists is false and is flagged at close-out for PRD correction.
- **Affects existing fixtures?** No production/DList fixtures. No fixture data changes.
- **New dependency?** No. `navigator.clipboard` is a platform web API; no package added.
- **PRD section change required?** Yes, a **correction** (not a scope change): PRD Appendix
  C-5 states the "sovereignty upgrade path (export nsec → NIP-07) already exists from Phase 1."
  That is false in the shipped product (only encrypted-at-rest custodial key storage exists,
  used transiently for server signing). Flag for the user to correct the PRD line at close-out.
- **Brand tokens / copy:** new UI is the `<CopyButton>` (ghost-button shape on existing tokens),
  the Settings section (reusing `set-*` classes), and the ProfileMe tier branch. No new hex, no
  new icon library, no emoji. All strings reviewed against the copy/visual feedback file (§4).

## Testability seams (for the Tester)

The web tests mock `useSession` / `useProfileMeta` and render the component, then use
role-scoped queries (cf. `settings.test.tsx`, `profile-me-polish.test.tsx`). Mirror those.
**No intra-module `vi.mock`; no `Date.now()` in asserted output** (the CopyButton renders only
text labels, never a timestamp).

**CopyButton (new test, `apps/web/test/components/copy-button.test.tsx`):**

- Mock `navigator.clipboard.writeText` (e.g. `vi.fn().mockResolvedValue(undefined)` on a stubbed
  `navigator.clipboard`). Render `<CopyButton value={FULL_NPUB} />`.
- Assert the button is reachable by role with the accessible name (`getByRole("button",
  { name: /copy your npub/i })`).
- Activate (click **and** a keyboard test via `fireEvent` Enter/Space on the real button) →
  assert `writeText` was called **once with the full npub** (`FULL_NPUB`, not the truncated form).
- Assert the **announced** copied state: a `role="status"` (or `getByRole("status")`) node
  shows `Copied` after activation. (Use `findBy`/`waitFor` for the async write.)
- **Failure path:** make `writeText` reject (and a second case where `navigator.clipboard` is
  absent) → assert it does **not** throw and the status shows `Copy failed`. Assert no unhandled
  rejection.

**ProfileMe tier branch (extend `profile-me-*` tests; likely a new
`apps/web/test/routes/profile-me-nostr-identity.test.tsx`):**

- **Custodial** (`user.email = "x@y.com"`): assert the raw full npub does **not** appear in the
  header (`expect(screen.queryByText(FULL_NPUB)).not.toBeInTheDocument()`), and that the
  discovery link `Manage your nostr identity` → `/settings` is present
  (`getByRole("link", { name: /manage your nostr identity/i })` with `href="/settings"`).
- **Sovereign** (`user.email = null`): assert a **labeled, copyable** npub is in the header — the
  truncated `shortNpub` display is present, the full raw 63-char string is **not** printed bare,
  and a CopyButton (`getByRole("button", { name: /copy your npub/i })`) is present. Mock its
  `writeText` and assert it copies the **full** npub.
- Assert the old `title`-only `.me-npub` raw-string treatment is gone (no element whose text is
  the full npub for custodial).

**Settings "Nostr identity" surface (extend `settings.test.tsx` / new
`apps/web/test/routes/settings-nostr-identity.test.tsx`):**

- For **both** tiers: assert the `Nostr identity` heading, the `Your npub` label, the npub value
  rendered (full), the exact explainer copy present
  (`getByText(/This is your identity on nostr\./)` — assert the pinned string), and a CopyButton
  present that copies the full npub.
- Assert the existing Substack field and (custodial) Display-name field still render unchanged
  (AC-6) — the new section does not break the existing role-scoped queries in `settings.test.tsx`
  / `settings-display-name.test.tsx`.
- Assert **no network call** on copy (AC-7): the existing `api` mock's profile methods are not
  invoked by the copy action.

**Explainer copy assertion:** the Tester asserts the exact pinned string (§4) so a slop-regression
fails the test.

## Implementation notes

### New files

- **`apps/web/src/components/CopyButton.tsx`** — `export function CopyButton({ value, label = "Copy" }:
  { value: string; label?: string })`. Real `<button type="button">`; `aria-label="Copy your npub"`;
  `navigator.clipboard?.writeText(value)` guarded + try/catch; `idle | copied | failed` local state
  with a ~1.5s revert `setTimeout` (cleared on unmount); a sibling `<span role="status">` carrying
  `Copied` / `Copy failed` / empty. No timestamp rendered.
- **`apps/web/src/components/CopyButton.css`** — ghost-button styling on existing tokens
  (`--u-border-hover`, `--u-radius`, `--u-amber`, `--u-ink`, `--u-muted`). No new hex.
- **`apps/web/test/components/copy-button.test.tsx`** *(Tester-owned)*.
- *(Tester-owned, optional split)* `apps/web/test/routes/profile-me-nostr-identity.test.tsx`,
  `apps/web/test/routes/settings-nostr-identity.test.tsx`.

### Ripple files (modified — production)

- **`apps/web/src/routes/ProfileMe.tsx`** — replace lines 104–106 (the bare `.me-npub`) with the
  tier branch: custodial → the `Manage your nostr identity` `<Link to="/settings">`; sovereign →
  a quiet `npub` label + `shortNpub(user.npub)` (imported from `../lib/view-model`) display +
  `<CopyButton value={user.npub} />`. Import `CopyButton` and `shortNpub`.
- **`apps/web/src/routes/ProfileMe.css`** — adjust/repurpose `.me-npub` (drop the bare-string
  assumption; add a small wrapper class for the labeled sovereign npub + copy row, and a muted
  link class for the custodial discovery link). Existing tokens only.
- **`apps/web/src/routes/Settings.tsx`** — add the `Nostr identity` `<section className="set-form">`
  block (both tiers) after the existing forms: `<h2>Nostr identity</h2>`, a `set-field` with the
  `Your npub` label + read-only npub display + `set-hint` explainer + `<CopyButton value={user.npub} />`.
  Import `CopyButton`. No new state, no write, no API call.
- **`apps/web/src/routes/Settings.css`** — add at most a small read-only-npub display class (mono +
  `word-break`, reusing `--font-mono` / `--u-muted`). No new hex.

### Existing tests the Tester must migrate (note for Test Design — Tester-owned, not Implementer)

- **`apps/web/test/routes/profile-me-polish.test.tsx`**, **`profile-me-shelves.test.tsx`**,
  **`profile-me-substack.test.tsx`**, **`profile-me-capped.test.tsx`**,
  **`profile-following-count.test.tsx`** — these render `ProfileMe`. Any that assert (or
  incidentally depend on) the raw `.me-npub`/full-npub-in-header must be updated to the new tier
  branch. Most mock `useSession` with a **sovereign** user (`email: null`), so they will now see
  the sovereign header treatment (truncated npub + CopyButton) instead of the bare string; assertions
  that look for the full npub string need updating. Add custodial-tier render cases.
- **`apps/web/test/routes/settings.test.tsx`** — the "exposes ONLY the Substack field" assertion
  (lines 111–119) and any "no npub" assumption must be reconciled with the new (read-only,
  non-input) Nostr-identity section. The new npub surface is **not** a `textbox`, so the existing
  `queryByLabelText(/display name|bio|picture|nip05/i)` negatives stay valid; but a blanket
  "nothing but Substack" assumption needs a carve-out for the read-only identity section.
- **`apps/web/test/routes/settings-display-name.test.tsx`** — verify the custodial display-name
  field still resolves by its role-scoped query alongside the new section (no change expected, but
  confirm).
- **`apps/web/test/components/account-menu.test.tsx`**, **`account-menu-settings.test.tsx`** —
  unchanged (AccountMenu is not modified; its private `shortNpub` and the Settings link stay as-is).

### DList shapes

**None.** This is a web IA/component refactor over already-rendered identity data. No `kind:0`,
`kind:39998/39999`, or `kind:3` is read differently, written, or signed.

## Out of scope

- **nsec export / sovereignty-upgrade UI** (gate decision 3 — does not exist; not built; not even a
  placeholder). PRD C-5's "already exists" claim corrected at close-out.
- **Relay display or management** (deferred per the story's Open Question 3 / PO recommendation OUT).
- **Provider→npub federation (C-3)** — the Settings section is its future home; none of it is built.
- **De-duplicating `shortNpub`** between `view-model.ts` and `AccountMenu.tsx`.
- **Any change to `useProfileMeta`, `displayNameOf`, or any write path** (Substack/display-name/kind-0
  bootstrap are untouched).
- **Other-user public profiles** (`/profile/:npub`) — unchanged.
- **New API endpoint, schema, migration, or build/lint tooling.**
