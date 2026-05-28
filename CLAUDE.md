# Unbnd

Book discovery and curation built on Tapestry (nostr DList + GrapeRank). Phase 1 is the Goodreads replacement. Phase 2 brings the distribution and economic layer (Lightning, Blossom, bounty marketplace). Phase 3 brings federation, author reputation, print-on-demand, audiobooks. We are building Phase 1.

Before starting work, read all four:

- [AGENTS.md](./AGENTS.md) — orientation pattern. Read this BEFORE touching code.
- [unbnd-prd.md](./unbnd-prd.md) — product requirements document. The contract with the user.
- [unbnd-handoff.md](./unbnd-handoff.md) — visual handoff. Maps each screen to its PRD section and pins the design rules.
- [unbnd-wireframes.html](./unbnd-wireframes.html) — the visual reference and the production-ready CSS class set.

## ⚠️ Architecture invariants — read every session

Unbnd inherits three invariants from Tapestry. Default coding instincts trained on centralized SaaS systems will silently violate these. If a design feels "obvious" and it doesn't honor these, the design is probably wrong — pause and re-derive.

### 1. POV-first: there is no "the rating," only ratings from a perspective

Every personalized output — a book's displayed rating, whether a curator is "trusted," which genre tag wins the trust-weighted vote, which quality signals show on a card — is computed *from a specific point-of-view*. A POV is identified by a delegated pubkey. The "House POV" is Unbnd's default delegate. Logged-in users can switch to their own POV after they have enough follow signal (PRD §9.5: ten follows).

- A book's "4.7 from curators you trust" displayed on the detail page is the same underlying rating events filtered by the viewer's GrapeRank. Two viewers can see two different aggregate ratings for the same book and both can be right.
- Genre tags: ten people tagged it "sci-fi," three people tagged it "literary fiction." The primary genre depends on whose trust weights you apply. From the House POV maybe sci-fi wins; from a literary-leaning curator's POV maybe literary fiction wins.
- **Common mistake**: precomputing "the book's genre" as a single column on the book record. There is no such thing globally. If you want per-POV behavior, either (a) provision per-POV columns and accept the denormalization burden, or (b) — usually right — *filter at query time* using the POV's trust scores.

### 2. Decentralized-first: publishing is permissionless; aggregation is opinionated

Anyone publishes anything — ratings, reviews, genre tags, quality signal flags, shelves, follows. The system does **not** gate publication. It aggregates and presents per-POV.

- Don't write code that requires a "verified author" or an "approved curator" before something can exist. Quality signals can be applied by any pubkey. Ratings can be published by any pubkey. The Unbnd Librarian is not special at write time — it's special only because it publishes the catalog seed (Open Library imports).
- The "trusted curator" set emerges from a POV's GrapeRank computation, not from a list someone administers. If your code asks "is this user allowed to rate?", you probably want "does this user's published rating count *for this POV*?"
- **Common mistake**: validation that rejects events from unknown pubkeys, or features that only work for "verified" users. Wrong layer. Accept all signed events; trust filtering happens at read time, per POV.

### 3. Filter at view time, not write time

A POV's view of the world is `(events from anyone) × (that POV's trust scoring)`. Both inputs change over time. Storing the *result* — "what does PoV X think today" — invites stale data and a combinatorial denormalization burden across N POVs × M books × M tags.

- Prefer scanning raw DList events + applying the active POV's GrapeRank at query time. Meilisearch can carry per-POV trust columns; compose them with `#z` (parent-pointer) and `#p` (pubkey) filters from strfry.
- Only denormalize per-POV when the query-time cost is provably unacceptable. "It might be slow" is not enough — measure.
- **Common mistake**: "let me compute the trust-weighted score once and cache it." The answer changes when the POV changes (logged-in user switches from House to personalized) or when a new rating arrives. Re-derive on read; cache only with a clear invalidation story.

### Reflex checks when designing anything

Before writing the design, run these four questions on it:

1. **"Who is this true for?"** If the answer is "everyone" or "the database," check again — it's usually "*this POV's view*; others may differ."
2. **"Where does this trust come from?"** If you're about to hard-code an admin/owner/role check, look harder — there's usually a GrapeRank-derived signal you should use instead.
3. **"Could anyone else publish their own version of this?"** If yes, your code must not gate them at write time.
4. **"What changes when the POV changes?"** If your design forces a re-index or migration each time a user switches POV, the abstraction is at the wrong layer — push it to query time.

If the design you're about to write fails any of these, stop and re-derive from a POV-aware vantage point before continuing.

## Engineering Team Mode

This project runs every change through a **Product Owner → Architect → Tester → Implementer → Reviewer** harness with explicit human approval gates between phases. Pattern adapted from Rob Conery's *Eliminate Crappy Slop Code* (https://bigmachine.io/articles/video/eliminate-crappy-slop-code/).

The harness lives in two places:

- **`engineering-team/`** — roles, workflows, templates, and accumulating decisions/stories/reviews. Source of truth for behavior. Read [engineering-team/README.md](./engineering-team/README.md) for the layout and phase wiring.
- **`.claude/`** — wiring only:
  - `.claude/commands/<phase>.md` — slash commands: `/plan-feature`, `/design-architecture`, `/design-tests`, `/implement-feature`, `/review-changes`, `/discuss`.
  - `.claude/agents/<role>.md` — subagents with role-appropriate tool whitelists. The Architect cannot Edit source. The Reviewer cannot Edit source.

### How to operate

1. **Classify the request.** Ask: "Is this a new feature, a bug fix, a refactor, or a doc/typo change?" That answer determines which phases apply (Standard strictness):

   | Type | Phases that apply |
   |---|---|
   | Feature | All five phases |
   | Bug | Skip Architecture if obvious; otherwise all |
   | Refactor | Skip Tests if no behavior change |
   | Doc / typo / one-liner | Implementer + Reviewer only |

2. **Know which role you're in.** When a phase command is invoked, state at the top of your first response: "I'm acting as the {Role}. Phase: {Phase}."
3. **Stay in role.** The Architect doesn't write the implementation. The Implementer doesn't invent new requirements. If the inputs are unclear, kick back to the prior phase rather than drifting.
4. **Honor the gates.** End each phase by summarizing the output and asking the user to approve before moving on. Do not auto-advance.
5. **Use the templates.** Stories, ADRs, test plans, and reviews start from `engineering-team/templates/`.

### Project settings

| Setting | Value |
|---|---|
| Strictness | Standard |
| ADRs | enabled |
| Clean working tree before starting a feature | yes |
| Commit at each phase boundary | yes |

## House rules

### PRD scope discipline

The MVP scope is PRD §11.1. The "Out of Scope" list at §11.3 is binding for Phase 1 work. Reject Phase 2+ work in MVP discussions: payments, file hosting, ebook sales, editing bounty marketplace, print-on-demand, social feed, reading progress, federation, email notifications. If a request needs to break that line, the user must explicitly re-scope the PRD before the story can proceed.

### Brand tokens are the visual source of truth

[`apps/web/src/styles/tokens.css`](./apps/web/src/styles/tokens.css) is the single source of truth for colors, radii, type sizes, spacing. The handoff §"Brand Design Tokens" pins the values; the CSS file is their canonical home. No new hex literal outside `tokens.css` and the per-component genre/signal color styling. Amber is the only accent. Green for positive quality signals, red for negative, purple for sovereign/Nostr identity.

### No AI-slop, in copy or visuals

Every shipped string is reviewed against [`memory/feedback_unbnd_copy_and_visual.md`](../.claude/projects/-Users-avinashburra-Documents-Tapestry/memory/feedback_unbnd_copy_and_visual.md). Banned in copy: em dashes, declarative negatives, rhetorical contrasts ("not X, but Y"), hedged openers, three-item rhythmic lists where the third is throat-clearing, "whether you're X or Y," "designed to" / "built to" framing, filler verbs (delve, leverage, robust, seamless, comprehensive, unlock, empower), "simply," exclamation-point CTAs, emoji in body copy. Banned in visuals: generic shadcn card stacks, purple-pink gradients, animated blobs, glassmorphism that isn't load-bearing, emoji-as-icon, drop shadows as primary depth, more than two type weights without a structural reason.

### Trust is shown as percentile tiers, never raw GrapeRank numbers

"Top 2% curator" reads. "0.91" does not. Computed values stay in the data layer; UI shows tier strings.

### Per-deployment Unbnd Librarian pubkey — NEVER hardcode

The Unbnd Librarian is the system signing key for catalog imports (Open Library seed, per PRD §7.2). It is generated at deployment startup and is **different on every environment** — local dev, staging, and unbnd.ink each have their own.

A literal hardcode in shared code silently breaks any flow that signs as the Librarian or filters events by Librarian author on every non-dev deployment.

**Always resolve the Librarian pubkey at runtime:**
- Server-side: read from the deployment's secrets store / env, never a JS constant in committed code.
- Client-side: read from a `/api/system/librarian-pubkey` endpoint backed by the server-side lookup.

This rule applies anywhere the Librarian pubkey is used as: an `authors:` filter on a strfry scan; the pubkey portion of a concept handle (`kind:<librarian>:<slug>`); a signer identity; or any other identity check. If you find yourself typing a literal npub or hex, stop — use the runtime lookup.

### Cryptographic library policy — no hand-rolled crypto, ever

Every cryptographic operation in Unbnd goes through the audited stack:

- **Applesauce** (`applesauce-core`, `applesauce-signers`) is the default nostr SDK. Higher-level abstractions for signers, keys, encryption, and event handling.
- **nostr-tools** is the explicit fallback for primitives Applesauce doesn't wrap (e.g., `nip19.nsecEncode` / `npubEncode`).
- **No hand-rolled crypto.** No bespoke secp256k1, no DIY bech32 encoders, no custom hashes, no rolled-from-scratch ciphers. Ever.

The transitive crypto floor is `@noble/secp256k1` (Trail of Bits and Cure53 audited; constant-time; side-channel hardened), `@noble/hashes`, and `@noble/ciphers`. Applesauce and nostr-tools are wrappers, not new cryptography.

The rule covers, at minimum:
- Key generation (`generateSecretKey`, `getPublicKey`) — Applesauce re-exports from nostr-tools/pure.
- Event signing — the four `applesauce-signers` classes (`PrivateKeySigner` for the Librarian, `PasswordSigner` for Tier 2 custodial, `ExtensionSigner` for Tier 1 NIP-07, `NostrConnectSigner` for the bunker stretch).
- NIP-19 bech32 encoding (npub / nsec) — `nostr-tools/nip19`.
- NIP-49 password-encrypted keys (Tier 2 custodial per PRD §8.4) — `applesauce-core/helpers/keys.encryptSecretKey`.
- NIP-04 / NIP-44 DM encryption — `applesauce-core/helpers/encryption`.
- Signature verification — Applesauce or `nostr-tools.verifyEvent`.

Versions are pinned exactly (no `^`). Established by ADR 0002.

### No new lint/typecheck/build tooling without an ADR

`pnpm -r typecheck` is the typecheck gate. Vitest is the workspace test runner (introduced by ADR 0001, in use across all three packages). Anything beyond that (ESLint, Prettier hooks, custom build targets) goes through Architecture phase.

### Tapestry prior art is the protocol baseline

The Tapestry source repo at `~/Documents/Tapestry/tapestry/` (remote `nous-clawds4/tapestry`) holds three branches that matter for Unbnd:

- `concept-graph` — canonical DList kind 39998/39999 patterns, BIBLE.md, firmware concepts.
- `feat/communities` — community-scoped DList items. Closest pattern for ratings, shelves, and most user-scoped data.
- `feat/pubkey-tagging-target` — tag, pin, and Trusted List patterns (ADRs 0001–0014 are worked examples). Closest pattern for genre tags, quality signals, and "top curators in this genre."

When designing anything DList-shaped, **read the relevant Tapestry branch first**. We crib patterns, we don't reinvent them.
