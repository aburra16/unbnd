# Engineering Team — Unbnd

This directory is the harness Claude Code uses when working on Unbnd. It encodes the team's roles, phases, templates, and accumulated decisions/stories/reviews.

Pattern ported from Tapestry's `feat/pubkey-tagging-target` branch. Strictness: **Standard**.

## Layout

```
engineering-team/
├── README.md           this file
├── roles/              role definitions — one file per role
├── workflows/          phase definitions — one file per phase
├── templates/          document templates (user story, ADR, test plan, review, book, audit)
├── decisions/          ADRs accumulate here as <NNNN>-<slug>.md
├── epics/              multi-story features — one file per epic
├── stories/            user stories accumulate here as <n>-<slug>.md
│   └── done/           shipped stories move here (numbers are never reused)
├── reviews/            review reports accumulate here as <n>-<slug>.md
└── audits/             one folder per book of work: <book-slug>/ — book.md (opened at
                        intake) + audit.md & prd-addendum.md|prd-seed.md (at close); done/<book-slug>/
```

**Layout note (flat, by design):** Unbnd's stories/ADRs/reviews live in **one flat namespace** (`<n>-<slug>`), with shipped stories moved to `stories/done/`. The upstream harness this was ported from uses per-epic subfolders to keep parallel feature branches from colliding on the same number. Unbnd has not adopted that — see [MIGRATION-epic-folders.md](./MIGRATION-epic-folders.md) for the convention and when it would be worth applying. All docs here describe the flat layout that actually exists.

The Claude Code wiring lives elsewhere:

- `.claude/agents/<role>.md` — subagents with role-appropriate tool whitelists. These run in isolated context with only the tools each role legitimately needs.
- `.claude/commands/<phase>.md` — slash-command entry points for each phase: `/plan-feature`, `/design-architecture`, `/design-tests`, `/implement-feature`, `/review-changes`, `/discuss`, `/close-book`.
- `CLAUDE.md` — auto-loaded; introduces Engineering Team Mode, the Unbnd architecture invariants, and the house rules.

## Quick reference

| To do this | Run |
|---|---|
| Talk to the team in advisory mode (no artifacts) | `/discuss` |
| Start a new feature | `/plan-feature` |
| Design an approach for an existing story | `/design-architecture` |
| Write tests for a story + ADR | `/design-tests` |
| Implement a story that has tests | `/implement-feature` |
| Review a diff before commit | `/review-changes` |
| Close a finished book of work — audit + product feedback | `/close-book` |

`/discuss` defaults to the **Product Expert** — a read-only thinking partner who knows the PRD, the handoff, the existing fixtures, and the relevant Tapestry branches. Use `as <role> <topic>` for a different lens, or `roundtable <topic>` for a multi-perspective response.

For **big-picture schema/spec changes** — evolving Unbnd's DList shapes + ADRs rather than code — use the lightweight **Spec-Evolution Workflow** (`/discuss` to scope → a living design doc to capture → the per-story cycle in *docs-mode* to ratify). See [workflows/protocol-spec-workflow.md](./workflows/protocol-spec-workflow.md).

## How the phases connect

```
  /plan-feature           → stories/<n>-<slug>.md
  /design-architecture    → decisions/<NNNN>-<slug>.md
  /design-tests           → stories/<n>-<slug>.test-plan.md + failing tests
  /implement-feature      → code changes that make the failing tests pass
  /review-changes         → reviews/<n>-<slug>.md
```

The user is the approval gate between phases. After each phase output, Claude asks you to confirm before continuing. On PASS, the reviewer retires the story by setting `**Status:** Done` and `git mv`-ing it under `stories/done/`.

Phases 1–5 are the **per-story** cycle. Above them sits one **per-book** milestone:

```
  /close-book             → audits/<book>/audit.md          (as-built record)
                          → audits/<book>/prd-addendum.md   (PRD-backed: deltas vs the PRD)
                            …or prd-seed.md                 (no PRD: reconstructed baseline)
```

## The return edge — closing the loop with the product team

The product team's flow (`product-team/`, see its README) hands work *into* engineering: a PRD and a story queue. **Book Close is the edge that hands learning back out.** When a book of work finishes — a PRD, a roadmap phase, or a no-PRD ask captured as an acceptance frame — `/close-book` reconciles what shipped against what was intended and writes two artifacts the product team reads to scope the next phase:

```
product PRD ─▶ eng stories ─▶ build ─▶ /close-book ─▶ audit.md + prd-addendum.md
     ▲                                                       │
     └──────────  product /discover (next phase) ◀──────────┘
```

Two mechanisms make this reliable rather than something a human has to remember:

- **Eager anchor (open bracket).** At intake (`workflows/0-intake.md`), a new book opens a `book.md` recording its intent anchor — the PRD it realizes, or, with no PRD, a short **acceptance frame** (the ask restated and confirmed). The thing you reconcile against at close is the thing you anchored to at open; skipping the anchor just drops the close to lower confidence.
- **Completion detection (the offer).** After every per-story PASS, the Reviewer checks whether the book now looks complete (computed for PRD-backed books, judged against the frame otherwise) and *offers* to close it — it never auto-runs. The human's "yes" is the invocation. See `workflows/5-review.md` → "Completion detection".

The boundary stays clean and symmetric: each team writes only in its own tree and reads across the line. Engineering reads the product team's queue; the product team reads engineering's `audits/`. Neither writes into the other. (Book tracking is opt-in: Unbnd's Phase-1/2 stories predate it, so an open `book.md` is only present for work bracketed at intake going forward.)

## Role isolation

Each phase has a corresponding **subagent** in `.claude/agents/`. Subagents run in isolated context with constrained tools — the Architect literally cannot Edit source, the Reviewer cannot Edit source, etc. The slash commands invoke role behavior in the main session for interactive phases; the subagents are useful when you want a role to run autonomously or in the background (e.g., kick off `/review-changes` and let the Reviewer subagent audit a branch end-to-end).

## Tuning the team

Edit role files in `roles/` to change how each role behaves. Edit workflow files in `workflows/` to change phase rules. The slash commands and subagents in `.claude/` only orchestrate — the source of truth for behavior is in this directory.

## Origin

Pattern adapted from Rob Conery's *Eliminate Crappy Slop Code* (https://bigmachine.io/articles/video/eliminate-crappy-slop-code/) and the broader "agentic Scrum" idea: structural guardrails matter more than model intelligence for output quality.

Worked examples to crib from: the ADRs on Tapestry's `feat/pubkey-tagging-target` branch, especially ADR 0001 (profile tag architecture) through ADR 0014 (tag-detail curated view).
