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

## Product Team Mode (upstream — optional)

*Before* a feature is engineered, a product can be **discovered and designed** through a parallel harness in `product-team/`. It runs upstream of Engineering Team Mode and is optional: use it when starting a new product or a substantial feature area where the requirements aren't yet clear. A non-technical user describes what they want in natural language; the product team iterates through structured phases; the output is markdown artifacts the engineering team consumes.

> Unbnd's Phase 1 and Phase 2 were already built directly through the engineering harness against `unbnd-prd.md` and `engineering-team/phase2-prd.md`. This product flow is here for *future* cycles — discovering and scoping the next phase — and for the return edge (reading engineering's `audits/` when scoping what comes next). It does not replace the existing PRDs.

The boundary is clean: **the product team produces markdown (PRD, guides, story queue). The engineering team writes code.** No source, no file paths, no library choices cross into the product artifacts.

- **`product-team/`** — roles, workflows, templates, guardrails, and accumulating discoveries/personas/journeys/scope/domain/prd/guides. Source of truth for product behavior. Read [product-team/README.md](./product-team/README.md) for the layout.
- **`.claude/`** — wiring only:
  - `.claude/commands/<phase>.md` — slash commands: `/discover`, `/model-users`, `/scope`, `/model-domain`, `/design-experience`, `/assemble-prd`, `/decompose-stories`, `/discuss-product`.
  - `.claude/agents/<role>.md` — product subagents; each can Write only into `product-team/`, and the Product Advisor cannot Write at all.

The seven phases — **Discovery → User Modeling → Scope → Domain Modeling → Experience Design → PRD Assembly → Story Decomposition** — each have a human approval gate and write a durable artifact. The flow ends by emitting `product-team/stories-queue.md`, an ordered backlog. **The handoff is doc-driven and one-directional:** the engineering Product Owner reads that queue and promotes each brief into a flat `engineering-team/stories/<n>-<slug>.md` via `/plan-feature`. The product flow never writes into `engineering-team/`. See [product-team/README.md](./product-team/README.md) → "Handoff to the engineering team".

## Intent Detection (natural language is the primary interface)

Most people who use the product flow will never type a slash command. **Natural language is the default way in; slash commands are shortcuts for people who already know the flow.** Claude reads what the user says, infers which phase they mean, confirms it in plain language, and proceeds. The non-technical user never needs to know slash commands exist.

### Register — who am I talking to?

- **User spoke naturally** (no slash command) → treat them as non-technical. Enter the phase with the **plain-language entry message** from that phase's workflow file (its `## Natural language` section). Do **not** say "I'm acting as the UX Researcher. Phase 2: User Modeling" — role labels and phase numbers are internal machinery. Say what you're about to do in plain words, then ask "Ready?" before starting. Never use jargon like "persona," "acceptance criteria," or "entity" with this user — translate their words into structure silently.
- **User typed a slash command** → treat them as technical. Use the formal role announcement ("I'm acting as the Product Strategist. Phase: Discovery.") exactly as the command file specifies.

Between phases the gate is **conversational, never a command**: "I've captured the problem space. Next I'd map out who your users are and what their experience looks like. Want to continue?" The user says yes; the next phase begins. No `/model-users` required.

### Routing table

**Product flow — figuring out *what* to build** (enter the phase, confirm in plain language):

| The user says something like… | Phase to enter |
|---|---|
| "I have an idea," "I want to build," "what should we build," "help me figure out what to make" | Discovery (`/discover`) |
| "who are the users," "who is this for" | User Modeling (`/model-users`) |
| "what's in the first version," "what should we cut," "what's the scope" | Scope (`/scope`) |
| "what information do we need," "what are the things involved" | Domain Modeling (`/model-domain`) |
| "what should it look like," "design the screens" | Experience Design (`/design-experience`) |
| "put it all together," "write it up," "write the PRD" | PRD Assembly (`/assemble-prd`) |
| "break it into tasks," "what does engineering need" | Story Decomposition (`/decompose-stories`) |
| "let's start building," "hand off to engineering," "ready to build" | Story Decomposition → engineering handoff |

**Engineering flow — figuring out *how* to build it** (technical audience; formal announcements are fine here):

| The user says something like… | Where to go |
|---|---|
| "let's implement," "write the code," "build this story" | `/plan-feature` (new story) or `/implement-feature` (story with tests) |
| "review the code," "is this ready to ship" | `/review-changes` |
| "I think that's everything," "that's all I needed," "looks done," "we're done" | **Offer to close the book** → `/close-book` (don't auto-run; the user's "yes" is the trigger) |

**Advisory — thinking out loud** (no artifacts):

| The user says something like… | Where to go |
|---|---|
| "what do you think about," "help me think through" (product / users) | `/discuss-product` |
| "what do you think about," "help me think through" (stack / feasibility) | `/discuss` |

**When in doubt, ask one question:** "Are you exploring a product idea (figuring out *what* to build) or ready to start engineering (*how* to build it)?" Then route.

### The non-technical journey, end to end

A product person opens Claude Code and says *"I have an idea for a new shelf feature and I want to figure out what to build."* Claude confirms it's the start of product discovery, explains in plain words that it'll ask about the problem, the people, and what exists today, and asks "Ready?" From there each phase flows into the next through conversational gates. The user talks in whatever words they have — *"readers need a way to find books their trusted curators actually loved"* — and the harness translates that into structured artifacts behind the scenes. When the product work is done, Claude presents the PRD and guides and offers to break the work into engineering tasks. If the user says "let's start building," Claude decomposes the stories and either hands to the engineering flow or notes that the engineering side is best run by (or with) a technical teammate. The user never types a slash command, never hears "persona" or "acceptance criteria," and never sees a phase number.

## Engineering Team Mode

This project runs every change through a **Product Owner → Architect → Tester → Implementer → Reviewer** harness with explicit human approval gates between phases. Pattern adapted from Rob Conery's *Eliminate Crappy Slop Code* (https://bigmachine.io/articles/video/eliminate-crappy-slop-code/).

The harness lives in two places:

- **`engineering-team/`** — roles, workflows, templates, and accumulating decisions/stories/reviews. Source of truth for behavior. Read [engineering-team/README.md](./engineering-team/README.md) for the layout and phase wiring.
- **`.claude/`** — wiring only:
  - `.claude/commands/<phase>.md` — slash commands: `/plan-feature`, `/design-architecture`, `/design-tests`, `/implement-feature`, `/review-changes`, `/close-book`, `/discuss`.
  - `.claude/agents/<role>.md` — subagents with role-appropriate tool whitelists. The Architect cannot Edit source. The Reviewer cannot Edit source.

Phases 1–5 are the **per-story** cycle. Above them sits one **per-book** milestone, `/close-book` — see "Books of work and the return edge" below.

**Spec-evolution variant (docs-mode).** For big-picture *schema/spec* changes — evolving Unbnd's DList shapes and their ADRs rather than writing code — use the lightweight **Spec-Evolution Workflow**: `/discuss` to scope → a living design doc to capture → the per-story cycle in *docs-mode* (Test Design skipped, Implementer authors spec prose, Reviewer audits accuracy) to ratify into the spec docs + ADRs. See [engineering-team/workflows/protocol-spec-workflow.md](./engineering-team/workflows/protocol-spec-workflow.md).

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

### Books of work and the return edge

The per-story cycle sits inside a larger unit — a **book of work**: a PRD, one roadmap phase of a PRD, or (with no PRD) a bounded ask. Books bracket the loop back to the product team. (Book tracking is opt-in: Unbnd's Phase-1/2 stories predate it, so an open `book.md` exists only for work bracketed at intake going forward.)

- **Open (eager anchor).** At intake, a new book opens `engineering-team/audits/<book-slug>/book.md` recording its intent anchor — the PRD §sections it realizes (`unbnd-prd.md`, `engineering-team/phase2-prd.md`, or `product-team/prd/<slug>.md`), or a short **acceptance frame** (the ask restated and confirmed) when there's no PRD. This is the durable definition of "done"; without it, completion can't be detected across sessions and the close drops to low confidence.
- **Detect completion (offer, don't auto-run).** After every per-story PASS — or when the user signals "I think that's everything" — check whether the book now looks complete (computed for PRD-backed books; judged against the acceptance frame otherwise). If it does, *offer* to close it. The system never declares done; it proposes done and the user ratifies. Their "yes" is the trigger for `/close-book`.
- **Close (`/close-book`).** The Reviewer, at book scope, writes two artifacts under `audits/<book-slug>/`: `audit.md` (the as-built record) and either `prd-addendum.md` (PRD-backed — deltas vs the PRD) or `prd-seed.md` (no PRD — a reconstructed baseline). These are the **return edge**: the product team reads them to scope the next phase. Engineering authors them under `engineering-team/` and never writes into `product-team/` — the mirror image of engineering reading the product team's `stories-queue.md`. See [engineering-team/README.md](./engineering-team/README.md) → "The return edge".

## House rules

### PRD scope discipline

The MVP scope is PRD §11.1. The "Out of Scope" list at §11.3 is binding for Phase 1 work. Reject Phase 2+ work in MVP discussions: payments, file hosting, ebook sales, editing bounty marketplace, print-on-demand, social feed, reading progress, federation, email notifications. If a request needs to break that line, the user must explicitly re-scope the PRD before the story can proceed.

### The design system lives in `@unbnd/ui`

The design system is the `@unbnd/ui` workspace package (`packages/ui/`), established by ADR 0038 and built across epic 0001 (stories 38–50). It is the single source of truth for tokens, primitives, the icon registry, the motion layer, and layout primitives. UI work goes through it; the CI guards in `packages/ui/test/architecture-*.test.ts` make that mandatory, not advisory.

- **Tokens** live in [`packages/ui/styles/tokens.css`](./packages/ui/styles/tokens.css), a two-tier system: raw values (`--u-raw-*`) aliased by a semantic tier (`--u-*` / `--signal-*` / `--genre-*`). App CSS references only the semantic tier. `apps/web` consumes the sheet via the package export `@unbnd/ui/styles/tokens.css` (imported once in `apps/web/src/main.tsx`). The handoff §"Brand Design Tokens" pins the values; the package is their canonical home.
- **Primitives** (`Button`, `IconButton`, `Link`, `Pill`, `Avatar`, `Label`, `Field`, `Container`), the typed `Icon` registry, and the `breakpoints` constant are exported from `@unbnd/ui`.
- A future redesign is a token-tier swap plus primitive-internals change, with no app-code churn. Theming is `[data-theme]`-scoped (`packages/ui/styles/tokens.css`); a dark skeleton exists for structural validation but is inert and not activated.

### Brand tokens are the visual source of truth

Colors, radii, type sizes, and spacing come from `@unbnd/ui` tokens (`packages/ui/styles/tokens.css`), never from literals in app code. The rules and the guard that enforces each:

- No raw color literals (hex, `rgb(a)`, named colors) outside the token layer. Enforced by `packages/ui/test/architecture-color-literals.test.ts` and `architecture-token-refs.test.ts` (the latter also kills the undefined-token drift that convention-only review let accumulate).
- No raw `font-size` / `font-weight` / `line-height`: `architecture-type-literals.test.ts`.
- No raw spacing (`padding` / `margin` / `gap` numeric literals) outside the token layer and layout primitives: `architecture-spacing-literals.test.ts`.
- No raw radius / box-shadow geometry / z-index: `architecture-shape-literals.test.ts`. No raw `transition` / `animation` durations or easings: `architecture-motion-literals.test.ts`.
- The TS palette and CSS raws stay in sync: `architecture-palette-sync.test.ts`. The page-frame tokens stay in `Container`: `architecture-page-frame.test.ts`.

Amber is the only accent. Green for positive quality signals, red for negative, purple for sovereign/Nostr identity. These are token-backed in `@unbnd/ui` and still binding.

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
