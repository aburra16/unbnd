# ADR 0071: Value before account — a unified write-gate account prompt

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/73-value-before-account.md`

## Context
The read pages already satisfy "value before account": `/book/:slug` and `/profile/:npub` render fully for a signed-out visitor (no route guard in `apps/web/src/App.tsx`; only `/profile/me` and `/settings` redirect), showing the house/community trust context. The gap is the **write gate** — six write controls each improvise their own signed-out treatment, and they are inconsistent and off-message (social-loop PRD §5.5; wireframe `#shared`):

- `RatingControl.tsx:141` → `<p class="rate-gate"><Link to="/auth">Sign in</Link> to rate this book.</p>`
- `ShelfControl.tsx:205` → `<p class="shelfc-gate"><Link to="/auth">Sign in</Link> to add this book to a shelf.</p>`
- `TagControl.tsx:157` → `<p class="tagc-gate"><Link to="/auth">Sign in</Link> to apply or dispute a genre or style.</p>`
- `FollowButton.tsx:54` → `<Link class="follow-signin" to="/auth">Sign in to follow</Link>`
- `VouchButton.tsx:42` → **returns `null`** (silent — a signed-out reader can't tell the action exists)
- `Submit.tsx:473` → `<p class="sub-submit-note"><RouterLink to="/auth">Sign in</RouterLink> to submit a book.</p>`

All six already read session via the same `useSession()` hook (`status: "loading" | "signed-in" | "signed-out"`). They all say "Sign in" (reads as "you need an existing login") and none explains what creating an account unlocks. There is **no shared prompt component**; `@unbnd/ui` exports primitives (`Button`, `Link`, `Pill`, `Avatar`, `Field`, `Container`, `Icon`) but no Callout/Banner/Notice. `Button` renders a raw `<button>` (no `href`), and a no-raw-`<button>` guard is in force — so a navigational CTA must be a react-router `<Link>` styled via tokens (the `.follow-signin` precedent).

`/auth` (`AuthMethodSelect`) already offers both create-account (custodial kind-0 bootstrap, #27) and existing sign-in, and takes **no return-to param** today (signup → `/auth/welcome`, login → `/`).

Constraints: brand tokens only (no new hex outside `tokens.css`); no-AI-slop copy (`product-team/guides/social-loop-style-guide.md`); POV-first (viewer-relative signals stay honestly absent for an anon visitor — out of scope). No DList change.

## Options considered

### Option A — One shared `AccountPrompt` app component, keyed by action; swapped into each control's signed-out branch
A new `apps/web/src/components/AccountPrompt.tsx` takes an `action` key, renders one consistent line — `Create a free account to <action>.` — plus a "Create account" CTA (a react-router `<Link to="/auth">` styled via tokens). Each of the six controls replaces its bespoke signed-out JSX with `<AccountPrompt action="rate" />` etc. The per-action copy lives in one map inside the component.
- **Pros:** one consistent affordance and one place for copy (satisfies AC-3/4/5 by construction); closes the Vouch dead end; deletes five ad-hoc gate styles; reuses `useSession` checks already present; no new dependency, no `@unbnd/ui` change. App-level component is the right boundary (it knows `/auth` + domain actions).
- **Cons:** touches six files (mechanical). The six call-site copy strings centralize into one map (a feature, not a cost).

### Option B — A generic `Callout`/`Notice` primitive in `@unbnd/ui`, composed per call site
Add a reusable notice primitive to the design system; each control composes its own message + CTA.
- **Pros:** a reusable primitive for future notices.
- **Cons:** over-generalizes now (YAGNI — one consumer); pushes copy back out to six call sites (re-fragmenting the message we are trying to unify); a `@unbnd/ui` primitive should not know about `/auth` or domain verbs. Rejected.

### Option C — A global route-level account gate / interstitial
Intercept write intents at a higher level.
- **Cons:** violates AC-6 (no page-level interstitial over readable content) and the value-before-account principle; the gate belongs *at the action*, inline. Rejected.

## Decision
We chose **Option A** — a single `AccountPrompt` app component keyed by an `action`, swapped into each write control's signed-out branch.

It unifies the message and copy in one place, closes the silent Vouch dead end, frames every gate as "create a free account" with the per-action unlock stated inline, keeps the gate at the action (never an interstitial), and adds no dependency and no `@unbnd/ui` primitive.

## Consequences
- **Enables:** one consistent, on-message write gate everywhere; the Vouch action is now discoverable when signed out; copy lives in one map (easy to keep on-voice).
- **Constrains / makes harder:** every new write control must use `AccountPrompt` for its signed-out branch (document in the component).
- **Behavior change (intended) → existing tests update.** This deliberately changes the signed-out output of all six controls, so their existing signed-out tests change in Test Design: `vouch-control` (`renders nothing` → `renders the account prompt`), `follow-button` (`sign in to follow` → create-account copy), `tag-control` / `shelf-control` / `rating-control` (`/sign in/i` → create-account copy), `submit` (note copy). These are expected updates, logged by the Tester.
- **Follow-up / deferred:** **return-to after account creation** is NOT in this story (it would modify the `/auth` flow, which is out of scope, and needs safe-redirect handling to avoid an open-redirect). The CTA routes to `/auth` exactly as today; landing the reader back on the originating book/profile is a recommended fast-follow (**#73b**). Flag it, don't build it here.
- **Affects existing fixtures?** No event/data fixtures. The six component tests' signed-out assertions update (above).
- **New dependency?** No. Built from the react-router `Link` + brand tokens; no `@unbnd/ui` change.
- **PRD section change required?** No. Implements §5.5 as written.

## Implementation notes
Concrete; the Implementer reads this.

**1. New component** `apps/web/src/components/AccountPrompt.tsx` (+ `AccountPrompt.css`):
- `export type AccountAction = "rate" | "save" | "follow" | "vouch" | "tag" | "submit";`
- A copy map (the reference voice is the wireframe's "Create a free account to rate or save this."):
  - `rate` → "rate this book", `save` → "save this book to a shelf", `follow` → "follow this curator", `vouch` → "vouch for this curator", `tag` → "suggest a genre or style", `submit` → "submit a book".
- Renders (role `note`): `<p class="account-prompt-body">Create a free account to {phrase}.</p>` + a react-router `<Link to="/auth" class="account-prompt-cta">Create account</Link>`. The single sentence delivers AC-4 (create-free-account framing) and AC-5 (states the unlock); the CTA delivers the route (AC-4). `/auth` already serves existing sign-in, so no separate sign-in affordance is needed.
- `AccountPrompt.css`: tokens only (mirror the existing gate styling — `--u-muted` body, amber CTA; reuse the `.follow-signin`/`.shelf-invite-btn` token patterns). No new hex.
- Optional `className` passthrough so a host control can adjust spacing in place.

**2. Swap each control's signed-out branch** to render `<AccountPrompt action="…" />`:
- `RatingControl.tsx:141-144` → `action="rate"`.
- `ShelfControl.tsx:205-209` → `action="save"`.
- `TagControl.tsx:157-161` → `action="tag"`.
- `FollowButton.tsx:54-60` → `action="follow"` (keep the `loading`/`isOwnProfile` → `null` branches).
- `VouchButton.tsx:42` → branch signed-out FIRST: `if (session signed-out) return <AccountPrompt action="vouch" />;` then keep `isSelf || !canVouch → null`. The signed-out path must NOT trigger the eligibility query (branch before/independent of it) — preserves "does not query eligibility when signed out".
- `Submit.tsx:473-476` → replace `.sub-submit-note` with `<AccountPrompt action="submit" />`; keep the submit button `disabled` when signed-out as a backstop, and keep the `onSubmit` guard at line 196.

**3. Remove the now-dead gate CSS** (`.rate-gate`, `.shelfc-gate`, `.tagc-gate`, `.follow-signin`, `.sub-submit-note`) once their only consumers use `AccountPrompt` — no orphaned styles (quality bar).

**4. AC-1/AC-2/AC-6 are structural:** `AccountPrompt` is only rendered inside a write control's signed-out branch, never as a route guard or page interstitial. A signed-out book/profile page therefore renders all read content AND inline prompts in the action areas — read content is never hidden, and no prompt sits over readable content.

## Out of scope
- Return-to after account creation (#73b) and any change to the `/auth` flow.
- Viewer-relative signals for anonymous visitors (taste match / hype-gap / Yours).
- A generic `@unbnd/ui` notice primitive (revisit if a second, non-auth use appears).
