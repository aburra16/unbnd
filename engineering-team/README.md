# Engineering Team — Unbnd

This directory is the harness Claude Code uses when working on Unbnd. It encodes the team's roles, phases, templates, and accumulated decisions/stories/reviews.

Pattern ported from Tapestry's `feat/pubkey-tagging-target` branch. Strictness: **Standard**.

## Layout

```
engineering-team/
├── README.md           this file
├── roles/              role definitions — one file per role
├── workflows/          phase definitions — one file per phase
├── templates/          document templates (user story, ADR, test plan, review)
├── decisions/          ADRs accumulate here as <NNNN>-<slug>.md
├── epics/              multi-story features — one file per epic
├── stories/            user stories accumulate here as <n>-<slug>.md
│   └── done/           shipped stories move here (numbers are never reused)
└── reviews/            review reports accumulate here as <n>-<slug>.md
```

The Claude Code wiring lives elsewhere:

- `.claude/agents/<role>.md` — subagents with role-appropriate tool whitelists. These run in isolated context with only the tools each role legitimately needs.
- `.claude/commands/<phase>.md` — slash-command entry points for each phase: `/plan-feature`, `/design-architecture`, `/design-tests`, `/implement-feature`, `/review-changes`, `/discuss`.
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

`/discuss` defaults to the **Product Expert** — a read-only thinking partner who knows the PRD, the handoff, the existing fixtures, and the relevant Tapestry branches. Use `as <role> <topic>` for a different lens, or `roundtable <topic>` for a multi-perspective response.

## How the phases connect

```
  /plan-feature           → stories/<n>-<slug>.md
  /design-architecture    → decisions/<NNNN>-<slug>.md
  /design-tests           → stories/<n>-<slug>.test-plan.md + failing tests
  /implement-feature      → code changes that make the failing tests pass
  /review-changes         → reviews/<n>-<slug>.md
```

The user is the approval gate between phases. After each phase output, Claude asks you to confirm before continuing. On PASS, the reviewer retires the story by setting `**Status:** Done` and `git mv`-ing it under `stories/done/`.

## Role isolation

Each phase has a corresponding **subagent** in `.claude/agents/`. Subagents run in isolated context with constrained tools — the Architect literally cannot Edit source, the Reviewer cannot Edit source, etc. The slash commands invoke role behavior in the main session for interactive phases; the subagents are useful when you want a role to run autonomously or in the background (e.g., kick off `/review-changes` and let the Reviewer subagent audit a branch end-to-end).

## Tuning the team

Edit role files in `roles/` to change how each role behaves. Edit workflow files in `workflows/` to change phase rules. The slash commands and subagents in `.claude/` only orchestrate — the source of truth for behavior is in this directory.

## Origin

Pattern adapted from Rob Conery's *Eliminate Crappy Slop Code* (https://bigmachine.io/articles/video/eliminate-crappy-slop-code/) and the broader "agentic Scrum" idea: structural guardrails matter more than model intelligence for output quality.

Worked examples to crib from: the ADRs on Tapestry's `feat/pubkey-tagging-target` branch, especially ADR 0001 (profile tag architecture) through ADR 0014 (tag-detail curated view).
