# Spec-Evolution Workflow (docs-mode)

**Status:** v1 — minimal codification. Graduate to a heavier harness only if it earns it (see "Graduating").

A lightweight flow for evolving **spec / protocol-shaped docs** — Unbnd's DList schemas, trust-and-curation rules, and the design docs that pin them (`unbnd-prd.md`, the DList schema notes, and their ADRs) — through **discussion → decision → documentation**. An alternative to the (code-oriented) Engineering Team workflow, for big-picture changes where the design isn't yet settled and the deliverable is spec prose + ADRs, not code.

Unbnd builds *on* the Tapestry protocol (nostr DList events, GrapeRank trust) rather than owning it. So this flow is for the layer Unbnd *does* own: its own event shapes (kinds, d-tags, word-wrapper JSON), its House-vs-personalized PoV rules, and how it cribs from / diverges from the upstream Tapestry branches. Upstream protocol changes belong in the Tapestry repo, not here.

## When to use this (vs the other flows)

| Flow | For | Deliverable |
|---|---|---|
| **Product Team** (`product-team/`) | figuring out *what* to build | product docs, story queue |
| **Engineering Team** (`engineering-team/`) | building *code* for a defined story | source + tests |
| **Spec-Evolution** (this) | evolving *how a DList shape / trust rule works* | spec/PRD prose + ADRs |

Reach for this when a schema or rule idea (a new DList kind, a d-tag convention, a PoV resolution rule, a quality-signal shape) needs thinking-through and then writing into the spec docs, the design isn't settled, and there's no executable behavior to test yet. If the design is already settled and you just need code, use the Engineering Team flow directly.

## The three phases

### 1. Scope — settle the design (`/discuss`, advisory)
Use `/discuss` (Product Expert lens — knows nostr / GrapeRank / the Tapestry branches / Unbnd's PoV model). Think out loud, surface trade-offs, settle open questions one at a time. **No artifacts.** Iterate until a piece is settled enough to capture. Be opinionated; kick back when a question is genuinely the user's.

### 2. Capture — a living design doc (don't lose the thinking)
As decisions settle, write them into a **living design/handoff doc** — `docs/<TOPIC>-design-handoff.md`, **Status: OPEN** — recording *settled decisions* **and** *open questions* + where you paused. Update it as you go. This is the safety net: capture-as-you-go so nothing lives only in the transcript. Flip it to SUPERSEDED once its content lands in the spec.

### 3. Ratify — settled piece → spec + ADR (Engineering Team flow, docs-mode)
When a piece is settled, run it through the Engineering Team flow **in docs-mode**:

`/plan-feature` (thin story) → `/design-architecture` (ADR) → **skip Test Design** → `/implement-feature` (write the spec section) → `/review-changes` (accuracy/consistency audit).

**Docs-mode rules** (how the eng-team roles adapt):
- **Test Design: skipped** — no executable behavior; flag it in the story's open questions.
- **Implementer writes spec prose**, not code. "Smallest change consistent with the ADR" = exactly the spec edits the ADR specifies. Mirror the working-doc spec; don't duplicate ADR rationale (point to the ADR).
- **Reviewer audits accuracy + consistency**, not coverage: are the claims true? do cross-references resolve (anchors, §-links, DList kind/d-tag references)? internally consistent + ADR-conformant? — *and* run `pnpm -r typecheck && pnpm -r test` to confirm the docs change caused **no regression**.
- **Quality gate:** docs only; the gates stay green; no new tooling.

Artifacts land in the normal homes: ADRs in `engineering-team/decisions/`, the canonical spec text in the relevant design doc (`unbnd-prd.md` / a DList schema doc), the review in `engineering-team/reviews/`.

## Why this isn't just "the eng-team flow"
Two reasons it's worth naming: (1) the **docs-mode adaptations** are easy to get wrong if you treat a schema change like a code change; (2) the **Scope + Capture front-end** (`/discuss` + a living handoff doc) is the part the eng-team flow lacks — and it's where schema design actually happens.

## Graduating to a full harness — only if it earns it
If spec work gets frequent enough that reusing eng-team-in-docs-mode feels strained — or you want dedicated roles and slash commands — build a parallel team folder (roles like Spec Author / Spec Reviewer, workflows, templates, `.claude/` commands + agents). Until then, this charter + reuse is enough. **Don't build the harness before the pattern demands it.**
