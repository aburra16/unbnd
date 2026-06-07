# Story 73: Value before account on shared links

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
A reader arriving from a curator's shared link (#72) lands on a book or profile page with no account. The promise of the social loop is that they see the full value first and are asked to commit only when they try to *act* — "value before account; the account gate sits at the write, not the read" (social-loop PRD §5.5; wireframe `#shared`).

Most of this is already true and should be **locked in**: `/book/:slug` and `/profile/:npub` read fully with no account, showing the house/community trust context (community rating + count, community-consensus genre/style tags, reviews, the rated-by roster, curator badges). The viewer-relative signals (taste match #66, hype-gap #70, the personalized "Yours" view) are correctly absent for a visitor who has no point of view yet — that is honest POV-first behavior, not a wall.

The real gap is the **write gate**. Today each write action improvises its own signed-out treatment, and they are inconsistent and off-message:
- Rate, Save, Apply/Dispute tag, and Follow each render an ad-hoc `Sign in to …` text link to `/auth`.
- The Vouch control renders **nothing** when signed out — a signed-out reader cannot even tell the action exists (a silent dead end).
- None frames the action as *creating a free account*, and none explains what an account unlocks — so a brand-new reader reads "Sign in" as "you need an existing login," the opposite of the value-before-account invitation.

This story unifies the write gate into one consistent, explanatory account prompt across every write action, and locks the open-read behavior with tests. It serves the Trusting Reader (journey 4.2 step 1, arriving via a shared link).

Anchor: `product-team/prd/social-loop.md` §5.5. Wireframe: `product-team/guides/social-loop-wireframes.html#shared` ("Create a free account to rate or save this." + a "Create account" button). Pairs with #72.

## User-facing description
As a Trusting Reader arriving with no account, I want to read a book or profile in full and be asked to create an account only when I try to act — with a prompt that tells me what creating one unlocks — so that I get the value before being asked to commit, and the ask is an inviting "create a free account," not a confusing "sign in."

## Acceptance criteria
Testable from the outside.

- [ ] Given a signed-out visitor on a book page (`/book/:slug`), the full read content and house/community trust context render with nothing read-related hidden behind sign-in: the community rating and count, community-consensus genre/style tags, reviews, the rated-by roster, and any curator badges.
- [ ] Given a signed-out visitor on a profile page (`/profile/:npub`), the full public profile renders (identity, shelves, claimed books, stats, curator badge) with no account wall on read.
- [ ] Given a signed-out visitor, every write action — rate, save to a shelf, follow, vouch, apply/dispute a tag, and submit a book — presents a single, consistent account prompt at the point of action. No write action is silently absent (the current Vouch dead end is closed).
- [ ] The prompt frames the action as creating a free account (an inviting "Create a free account to …" with a Create-account affordance), not only "sign in," and routes to the account-creation flow.
- [ ] The prompt states what creating an account unlocks (the action the visitor was trying to take — rate / save / follow / vouch / tag / submit).
- [ ] No account prompt appears on read. The prompt is shown only in the signed-out branch of a write affordance, never as a page-level interstitial or gate over readable content.

## DList shapes touched
- None. This is auth-gating + presentation only; the read pages already use the existing public read endpoints, and no event shape changes.

## Out of scope
- Viewer-relative trust signals for anonymous visitors (taste match #66, hype-gap #70, the "Yours" personalized view). These require the visitor's own web of trust and remain honestly absent until they have a point of view — not a wall to remove. (An invitation to personalize already exists for signed-in users via the PoV bar.)
- The account-creation flow / onboarding itself (custodial kind-0 bootstrap shipped in #27). This story routes to it; it does not rebuild it.
- Which write actions exist, and any change to the read content itself.
- Sign-in for existing users (the `/auth` flow is unchanged); this story only reframes and unifies the *prompt* that leads there.

## Open questions
For the Architect (Phase 2):
1. **Shared prompt shape.** A single reusable account-prompt affordance reused by every write control's signed-out branch — inline near the action (matching the wireframe), versus a popover/sheet. The PO's intent: minimal, in place, never an interstitial over the read. Architect picks the component boundary and where it lives.
2. **Unlock copy.** The prompt names what the specific action unlocks. Architect/Design confirm the per-action copy against `product-team/guides/social-loop-style-guide.md` (and the no-AI-slop copy rules) — the wireframe's "Create a free account to rate or save this." is the reference voice.
3. **Routing target.** Whether "Create account" routes to the existing `/auth` entry (which already bootstraps a custodial account) with a return-to-page, or a dedicated create path. Architect confirms against the shipped auth flow.

## Linked artifacts
- ADR: `engineering-team/decisions/0071-value-before-account.md` (Accepted)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
