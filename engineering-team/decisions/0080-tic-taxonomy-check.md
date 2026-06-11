# ADR 0080: The tic-taxonomy mechanical check — one artifact, a data-driven scanner

**Status:** Accepted
**Date:** 2026-06-11
**Story:** `engineering-team/stories/83-tic-taxonomy-check.md`

## Context
The reader-guide epic's language law (`product-team/guides/reader-guide-style-guide.md`) marks each tic [M] (text-searchable) or [J] (judgment). The PRD requires a CI-wired mechanical scan over guide content, data-driven under the taxonomy's binding extension contract ("a taxonomy extension must not require touching check logic"), with a per-file exception for exactly one marked entry's protocol-wall words. The brief names drift between the document and the machine list as the failure mode to design against. No guide content exists yet (#84+); this story lands the gate first.

## Decision

### 1. One artifact: the machine list is an appendix OF the taxonomy (resolves OQ-1)
The product team amended the style guide with **Appendix M**, a fenced ```json taxonomy-mechanical-list``` block. The scanner parses that block out of the style guide markdown directly. Document and list are the same file, so an [M] extension is one product-side commit and the no-drift requirement holds by construction; there is no sibling data file to fall out of sync. The boundary stays clean: engineering tooling *reads* the product artifact; only the product side edits it.

Sense-dependent [M] words (metaphorical "journey," protocol-sense "event") are encoded `severity: "flag"`: reported with location and id for the judgment read, never failing CI, because a text search cannot judge sense. Hard bans are `severity: "error"`.

### 2. The scanner: `packages/guide-lint` (resolves OQ-2)
A small workspace package (so `pnpm -r typecheck/test` cover it for free), no new dependencies:
- **Pure core** `scan(rules, files) → hits[]`: each hit `{file, line, column, ruleId, ruleName, matched, severity}`. Rule kinds: `substring`, `word` (case-insensitive whole-word, Unicode-aware boundaries — the #75 matcher lesson), `regex`, `sentence-initial` (start of text, or after `.`/`?` + space, or a line start); `scope: "steps"` restricts a rule to numbered step lines (`^\s*\d+\.`).
- **Parser** `loadRules(styleGuideText)`: extracts and validates the Appendix M fenced block (the only coupling to the document is the fence tag).
- **Exemption**: a content file containing `<!-- taxonomy-exempt: E -->` is exempt from the listed rule ids, allow-listed by the appendix's `exemptibleRules` (E only today); claiming any other id is itself reported as an error. Frontmatter and the exemption comment line are excluded from scanning.
- **CLI** (`lint:guide` script): loads the style guide, expands `contentGlobs` (an absent/empty content dir is a clean pass — the zero-hit baseline), prints hits as `file:line:col [id] name: "matched"`, exits non-zero only on `error`-severity hits.

### 3. CI wiring + content location (resolves OQ-2/OQ-3)
- Content location (shared contract with #84): `apps/web/src/guide/content/**/*.md`, as the appendix's `contentGlobs` states. #84 consumes the same directory; this story only establishes the empty baseline.
- CI: a `Guide lint` step in the existing test job (`pnpm --filter @unbnd/guide-lint lint:guide`) after the test step. Cheap (milliseconds), loud, and independent of vitest so a hit reads as a content failure, not a test failure.

## Consequences
- **Enables:** every content story (#85+) lands pre-gated; extending the taxonomy is one document edit that the very next CI run enforces; the marked entry's exemption is narrow, self-documenting, and cannot widen silently.
- **Constrains:** Appendix M's fence tag and JSON schema are now a contract; the scanner validates the block and fails loudly on a malformed appendix (a broken appendix must never silently scan nothing).
- **Affects existing fixtures?** No existing surface touched; a new package + one CI step.
- **New dependency?** None (node builtins + a glob walk implemented over `fs`).
- **PRD change?** No — implements §5.3/§7.

## Implementation notes
- `packages/guide-lint/`: `src/rules.ts` (schema + `loadRules`), `src/scan.ts` (pure core), `src/cli.ts` (paths, globbing, exit codes), `package.json` (`lint:guide` script), tests.
- `.github/workflows/ci.yml`: the `Guide lint` step.
- No change to `apps/web` (the content dir is born in #84; the glob tolerates its absence).

## Out of scope
The guide surface and content (#84+); [J] enforcement; scanning non-guide copy (the deferred sweep story).
