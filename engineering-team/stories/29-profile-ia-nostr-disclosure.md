# Story 29: Profile IA — progressive disclosure of nostr internals

**Status:** Draft
**Created:** 2026-06-01
**Type:** UX Bug

**Gate decisions (2026-06-01):** tier-differentiated; Settings-home; nsec-export out. See `engineering-team/decisions/0030-profile-ia-nostr-disclosure.md`.

> **Type justification.** Filed as a **UX Bug**, not a Feature. The profile and
> settings surfaces already exist and work (Stories 11/19/22/27b; ADR 0012). The
> broken behavior is that `/profile/me` renders a raw 63-char `npub1…` string
> directly under the display name with no label, no explanation, and no
> affordance (it is not even click-to-copy — only a `title` attribute). For a
> custodial (email-signup) user who has never heard of nostr, that reads as a bug
> or noise rather than as their identity. This is existing UI behaving wrong on a
> core flow, which is a bug, and it is exactly what PRD Appendix **C-5** was
> filed to fix. This story introduces no new behavior the product doesn't already
> have data for; it relocates and dresses an identity field that is already
> rendered. No new API, no schema change, no new write path. Under Standard
> strictness a Bug may skip Architecture only if obvious; this one has a real IA
> decision (tab vs. section) and a tier branch, so the PO recommends it run
> through Architecture. The path is: this story → Architecture → Tests →
> Implement → Review.

## Background

A custodial (email-signup, Tier-2) user clicks **"Your profile"** in the account
menu and lands on `/profile/me`, where a raw `npub1…` string is printed directly
under their display name with no label, no explanation, and no way to act on it.
To someone who has never heard of nostr, a 63-character random-looking string
sitting under their name reads as a bug, not as an identity.

**Verified in the shipped code:**

- **`apps/web/src/routes/ProfileMe.tsx` lines 99–107.** The identity header
  renders `<Avatar>`, the display name (`me-name`), optional `nip05`, then a bare
  `<p className="me-npub" title={user.npub}>{user.npub}</p>`. The npub is the raw
  full bech32 string, with **no label**, **no explainer**, and **no click-to-copy**
  — the only affordance is the `title` attribute (a hover tooltip showing the same
  string). Confirmed against `apps/web/src/routes/ProfileMe.css` line 26 (`.me-npub`
  is text styling only; no cursor/copy behavior) and the absence of any
  `onClick`/`clipboard`/`copy` in `ProfileMe.tsx`.

- **`apps/web/src/components/AccountMenu.tsx` lines 70–84.** "Your profile" is the
  menu link to `/profile/me`. The menu header itself (`acct-id`, lines 70–76) shows
  a *shortened* npub (`shortNpub`, lines 16–18: `npub1xxxxxxxx…xxxx`) under the name
  — already truncated, no copy. "Settings" (line 83) links to `/settings`.

- **`apps/web/src/routes/Settings.tsx`.** Settings currently holds the Substack
  field (lines 165–180, Story 22) and, for custodial users only, the Display-name
  field (lines 221–275, Story 27b). It reads `user.email === null` to branch
  sovereign vs custodial (line 78). It does **not** today expose the npub. (PRD C-5
  says "the Settings page exposes nostr fields flat"; in the current code the npub
  lives on `ProfileMe`, not Settings. Settings exposes Substack + display name. The
  story aligns Settings to the same disclosure model regardless.)

- **Identity resolution.** Both surfaces resolve identity the same way:
  `session.user.npub` (the raw npub on `PublicUser`,
  `apps/web/src/lib/api.ts` lines 5–9: `{ email: string | null; displayName: string;
  npub: string }`) plus `useProfileMeta(npub)` → `displayNameOf(meta, fallback)` for
  name/picture/nip05/about/substack. The avatar derives initials/colour from the
  npub seed. **All identity data this story touches is already on `session.user`
  and `useProfileMeta` client-side.**

- **Tier is already known client-side.** `user.email === null` ⇒ sovereign (NIP-07);
  non-null ⇒ custodial. Settings.tsx line 78 already uses exactly this branch
  (`const isSovereign = user.email === null`). So a tier-differentiated disclosure
  needs **no new data**.

**nsec export / sovereignty-upgrade — verified DOES NOT EXIST.** PRD C-5 asserts
the "sovereignty upgrade path (export nsec → NIP-07)" "already exists from Phase 1."
**That is not true in the shipped product.** A search across `apps/web/src` and
`apps/api/src` finds no nsec-export, key-reveal, or upgrade-to-NIP-07 UI or endpoint.
What exists is **encryption-at-rest of the custodial key** (the recovery *substrate*,
not a user-facing export): `encryptedNsecPassword` (NIP-49, password-encrypted) and
`encryptedNsecBackup` (XChaCha20-Poly1305 under the deployment backup key) in
`apps/api/src/auth/users.ts` lines 30–32; the server decrypts it only transiently to
establish a signing session (`apps/api/src/index.ts` lines 189–248). The two
`SovereigntyNote` usages (`apps/web/src/components/SovereigntyNote.tsx`;
`AuthEmailSignup.tsx` lines 146–150, `AuthNostrConnect.tsx` lines 186–190) are static
informational copy on the auth screens, not an export flow. **Conclusion:** there is
no nsec-export capability to surface. This story does **not** invent one (see Out of
scope and Flags). The Advanced surface leaves room for it as a future story.

**PRD anchor:** Appendix **C-5** "Profile information architecture: progressive
disclosure of nostr internals" — the charter for this story, quoted in full in
Background of the PRD. C-5's engineering note states it is "purely a web
IA/component refactor — no new API, no schema change; consumes the same
`session.user.npub` + `useProfileMeta`." This story holds that line. It also
supports **§2.4 "Public profiles + real activity"** — the identity-header
acceptance line ("Identity header … display name, handle, bio") describes a
*human-facing* header; a raw npub under the name works against that. C-5 "pairs
naturally with **C-3** (provider→npub federation)": the Advanced surface is where
linked identities would later appear, so this story establishes the home for C-3
without building C-3. The copy/visual no-slop rule
(`memory/feedback_unbnd_copy_and_visual.md`) governs every new string here; that
file's "Bridging principle" already names "a future Settings → Advanced … section
where the user can inspect their nostr identity, see their npub, manage relays" as
the *one place* the word "nostr" is allowed to surface — this story builds that
place.

This story touches no PRD §11.3 "Out of Scope" surface (no payments, file hosting/
Blossom, ebook sales, bounty marketplace, print-on-demand, social feed, reading
progress, federation, email notifications). It is a web-only IA/component refactor
over already-rendered, already-available identity data.

## User-facing description

As a **Reader** (PRD §3) who signed up with email and has never heard of nostr, I
want my profile to show my name, picture, bio, shelves, and activity without a
cryptic 63-character string under my name, so that my profile reads as *me* and not
as a bug. When I do want to understand or copy my underlying identity, I want it in
a clearly labeled "Nostr identity" place with a one-line plain explanation and a
button that copies it, so that the protocol detail is there when I look for it and
out of my way when I don't.

As a **Curator** who signed in with a nostr extension and already thinks in npubs, I
want my npub to stay easy to find and copy (it is how others follow and reference
me), so that the cleanup for newcomers doesn't bury the identity I actively use.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable. This is a
**web-only** change: it consumes `session.user.npub`, `session.user.email` (for the
tier branch), and `useProfileMeta`; it adds **no** API call, **no** schema change,
and **no** write path. Copy in these ACs is illustrative; the proposed final strings
are in "Proposed copy" below and every shipped string must pass the no-slop rule
(`memory/feedback_unbnd_copy_and_visual.md`). The exact IA mechanism (a tab vs. a
clearly-labeled section) is the Architect's call; these ACs constrain the *disclosure
behavior*, not the mechanism (see Open Question 1).

- [ ] **AC-1 — The default profile no longer shows the raw npub under the name.**
  Given a signed-in user on `/profile/me`, when the identity header renders, then the
  full raw `npub1…` string is **no longer** printed directly under the display name
  in the default view. The header shows avatar, display name, optional nip05, bio
  (`about`), and the Substack link as today; the raw 63-char npub is not among them.
  (The npub moves to the Advanced surface per AC-2. For sovereign users the npub may
  also be shown in the header per AC-5 — but as a labeled, copyable element, never an
  unlabeled bare string.)

- [ ] **AC-2 — An explicit "Nostr identity" / "Advanced" surface exists and houses
  the npub.** Given a signed-in user, when they open the deliberately-labeled
  Advanced / Nostr-identity surface (a tab or a clearly-titled section on `/profile/me`
  and/or `/settings` — Architect's mechanism), then it displays their npub together
  with a one-line plain-language explainer (AC-4) and a copy control (AC-3). The
  surface is reachable from the profile/settings IA without guessing (a visible,
  labeled affordance), and it is **not** shown by default in the human-facing header
  flow (it is a distinct, explicitly-entered surface). The label uses the allowed
  "nostr" vocabulary (per the no-slop bridging principle), e.g. "Nostr identity".

- [ ] **AC-3 — Click-to-copy works and is announced.** Given the Advanced surface is
  open, when the user activates the npub's copy control (click or keyboard
  Enter/Space on a real `<button>`), then the full npub is written to the clipboard
  and the UI confirms the copy in place (e.g. the control's label changes to "Copied"
  for a moment), without a toast and without navigating away. The control is
  keyboard-focusable and has an accessible name (e.g. `aria-label="Copy your npub"`),
  and the copied/confirmation state is announced to assistive tech (e.g. via an
  `aria-live` region or an accessible status). This replaces the current
  `title`-attribute-only behavior, which is not copyable.

- [ ] **AC-4 — A plain-language explainer is present and slop-free.** Given the
  Advanced surface is open, when the npub is shown, then a single one-line explainer
  sits with it describing in plain language what the npub is (its portability across
  nostr apps), and that line passes the no-slop rule: no em dash, no rhetorical
  contrast, no hedged opener, no banned filler verb, no exclamation CTA, no emoji.
  The word "nostr" is permitted here (this is the sanctioned Advanced surface). See
  "Proposed copy" for the exact string the PO recommends.

- [ ] **AC-5 — Tier-differentiated disclosure: custodial is clean by default,
  sovereign keeps the npub prominent.** Given a **custodial** user (`email !== null`),
  when `/profile/me` renders, then the default header is clean (AC-1) and the npub
  appears only in the Advanced surface (AC-2). Given a **sovereign** user
  (`email === null`), when `/profile/me` renders, then their npub MAY also be shown
  in the header as a labeled, copyable element (it is their working mental model and
  how others reference them), and it is also present in the Advanced surface. In
  **neither** tier does an unlabeled, non-copyable raw npub appear under the name
  (AC-1 holds for both). The tier branch reuses the existing `user.email === null`
  check (no new data). (The exact sovereign-header treatment is flagged for the gate;
  see Flags.)

- [ ] **AC-6 — Settings is aligned to the same model.** Given a signed-in user on
  `/settings`, when the page renders, then the npub (if surfaced there) lives behind
  the same labeled Advanced / Nostr-identity surface with the same explainer and
  click-to-copy (AC-2–AC-4), consistent with `/profile/me`; the existing Substack
  field (Story 22) and custodial Display-name field (Story 27b) keep working
  unchanged. Settings does not gain a second, differently-styled raw-npub treatment.

- [ ] **AC-7 — No new data, no new endpoint, no write.** Given the implemented
  change, when the profile and settings surfaces render and the copy control is used,
  then only already-available client-side data is consumed (`session.user.npub`,
  `session.user.email`, `useProfileMeta`), and **no** new API endpoint is called,
  **no** schema/migration is introduced, and **no** event is published or signed.
  (This is verifiable by inspecting the diff and the network calls: the copy action
  hits the clipboard, not the server.)

## DList shapes touched

**None.** This is a web IA/component refactor. It publishes nothing and signs
nothing. It reads `session.user` (from `/auth/me`) and the kind-0-derived
`useProfileMeta`, both already in use. No `kind:0`, no `kind:39998`/`39999`, no
`kind:3` is written or changed.

## Out of scope

State explicitly — do not build:

- **nsec export / sovereignty-upgrade (export nsec → NIP-07) UI.** Verified it does
  **not** exist in the product today (see Background). Do **not** invent it in this
  story. The Advanced surface leaves room for it; PO recommends a **separate future
  story** when/if the upgrade flow is designed (it is a real custodial-custody
  security design, related to C-3's KeyVault note). At most this story may leave a
  labeled placeholder/anchor in the Advanced surface; it ships no key-reveal,
  no decrypt, no download. (See Flags.)
- **Relay MANAGEMENT (adding/editing/removing relays).** C-5 lists the relay list as
  a *candidate* for the Advanced surface. This story scopes relay handling to
  **display-only at most** (and the PO leans toward deferring even read-only relay
  display to keep the story tight — see Open Question 3). No relay editing UI.
- **Provider → npub federation (C-3).** The linked-identities/IdentityMapping surface
  is Phase 3. This story establishes the Advanced surface as its future home but
  builds none of it.
- **Any change to how identity is resolved or published.** Bootstrapping/repairing
  kind-0 (Story 27), the display-name rename write (Story 27b), and the Substack write
  (Story 22) are untouched. This story relocates and dresses an *already-rendered*
  npub; it does not change `useProfileMeta`, `displayNameOf`, or any write path.
- **Public profiles of other users (`/profile/:npub`).** This story is about the
  signed-in user's own `/profile/me` and `/settings`. Other-user public profiles
  (Story 20) already show a truncated npub fallback only when no name resolves; no
  change here.
- **New API endpoint, schema, or migration.** C-5 engineering note: none needed. AC-7
  asserts this.
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": touches none of payments, file
hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed,
reading progress, federation, or email notifications.

## Proposed copy (for the gate — eyeball for slop)

Recommended final strings (Implementer may refine within the no-slop rule; the PO
proposes these so the user can approve the voice now):

- **Surface label / tab title:** `Nostr identity`
  (Plain, uses the one allowed "nostr" placement. Not "Advanced settings", which
  hides *what* it is.)
- **npub explainer (one line, AC-4):**
  `This is your identity on nostr. It travels with you to any nostr app, and it is
  how other people follow and reference you.`
  (No em dash, no rhetorical contrast, no hedged opener, no banned filler, no
  exclamation, no emoji. Two short clauses. If the gate prefers a single clause:
  `This is your identity on nostr. It travels with you to any nostr app.`)
- **Copy control label:** `Copy` → on success, `Copied`
  (accessible name: `Copy your npub`).
- **Field label above the npub string:** `Your npub`
  (so the bech32 string is never unlabeled).

PO note on voice: "npub" is unavoidable jargon here, but this is the sanctioned
surface for it, and the explainer carries the plain-language meaning. The header for
custodial users never says "npub" or "nostr" (AC-1/AC-5).

## Open questions

Resolve before approving the story.

1. **Tab vs. section — leave to the Architect.** C-5 says "a tab or a clearly-labeled
   section … leave the exact mechanism to the Architect." PO agrees: the AC constrains
   the *disclosure behavior* (explicit, labeled, not in the default header), not the
   widget. PO's lean: a **collapsed/expandable "Nostr identity" section** on the
   existing pages is lighter than a new tab and avoids a routing change, but a tab is
   fine if the Architect prefers it. Confirm the mechanism in the ADR.

2. **One Advanced surface or two?** The npub could live on `/profile/me`, on
   `/settings`, or be a single shared surface reachable from both. PO's lean:
   **`/settings` is the natural home** (it already holds the editable identity fields:
   Substack, display name), and `/profile/me` simply stops showing the raw npub (AC-1)
   and links to it. But sovereign users may want it on `/profile/me` too (AC-5).
   Architect picks where the canonical surface lives and how the other page references
   it; AC-2 and AC-6 only require the behavior to be consistent.

3. **Read-only relay display — in or out?** C-5 lists the relay list as a *candidate*.
   PO's lean: **defer relay display entirely** to keep this story to the npub
   disclosure (the core reported problem). If the user wants read-only relay display
   included, it stays display-only (no editing) and needs the Architect to confirm
   where the relay list is available client-side (it may not be on `session.user`
   today — flag: this could be the one place the "no new data" claim needs a check).
   PO recommendation: **out** for this story.

4. **Sovereign header npub treatment (AC-5).** Should a sovereign user's npub in the
   `/profile/me` header be the full string (labeled + copyable) or a truncated form
   (e.g. `npub1xxxx…xxxx`) that expands/copies? PO's lean: **truncated + copyable** in
   the header (matches the existing `shortNpub` treatment in `AccountMenu`), with the
   full string + explainer in the Advanced surface. Confirm.

## Flags for the gate (PO — possibly contentious, user decides)

- **PRD C-5 is wrong about nsec export "already existing."** Verified: there is **no**
  nsec-export / sovereignty-upgrade UI in the shipped product (only encrypted-at-rest
  key storage used transiently for server signing). PO recommendation: **scope nsec
  export OUT of this story** and file it as a separate future story when the upgrade
  flow is actually designed; this story ships only the npub disclosure (label +
  explainer + click-to-copy) and the IA. The PRD line should be corrected at closeout.
  Flagging so the user can decide whether to (a) defer entirely, or (b) allow a
  labeled placeholder/anchor in the Advanced surface that points to a future flow.
  PO leans (a) or a minimal (b); **do not build the export**.

- **Tier-differentiated disclosure (AC-5) vs. uniform.** PO recommends
  **tier-differentiated**: custodial users get the clean default (the reported
  problem), sovereign users keep the npub prominent because it is their working mental
  model. The alternative is a uniform "npub always behind Advanced for everyone,"
  which is simpler to build and test but mildly annoying for sovereign curators who
  reference their npub constantly. PO leans **differentiated**; flagging so the user
  can choose uniform if they prefer the simpler model. (Either way, AC-1 holds: no
  unlabeled raw npub under the name for anyone.)

- **Where the canonical surface lives (Open Question 2)** is an IA judgment with a
  visible effect on navigation; called out so the user can weigh in at the gate rather
  than discovering it post-Architecture.

## Linked artifacts
- PRD anchor: `engineering-team/phase2-prd.md` Appendix **C-5** (charter), with §2.4
  (public profiles identity header) and Appendix C-3 (provider→npub federation, the
  Advanced surface's future tenant) for adjacency.
- Prior ADR: `engineering-team/decisions/0012-profile-surface.md` (the profile/identity
  surface, `Avatar`/`AccountMenu`/`ProfileMe`, kind-0 resolution, copyable-npub note).
  See also Stories 19 (profile polish), 22 (Substack field), 27/27b (custodial kind-0
  + display-name) for the surfaces this aligns with.
- Copy rule: `memory/feedback_unbnd_copy_and_visual.md` (no-slop; the "Bridging
  principle" sanctioning the Advanced surface as the one place "nostr"/"npub" may
  appear).
- ADR: `engineering-team/decisions/0030-profile-ia-nostr-disclosure.md` (Proposed;
  0029 was taken by Story 28's "your rating" surface).
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
