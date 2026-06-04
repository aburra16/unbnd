# Review: Story 47a — `Link` + `Pill` primitives (clear the Story-45 Pill/Link deferrals, byte-identical)

**Reviewer:** Claude (acting as Reviewer, independent / fresh context)
**Date:** 2026-06-04
**Branch / PR:** `story-47-form-surface-primitives` / PR #90
**Diff:** `git diff origin/main...HEAD` (HEAD = `bd9d6ee`; Tester guard commit `dbae472`)
**Story:** `engineering-team/stories/47-form-surface-primitives.md` (shared 47a/47b)
**ADR:** `engineering-team/decisions/0047-link-pill-primitives.md` (Accepted)

This is a **zero-diff, structural-only** refactor (binding user directive: invisible to users, NO visual change, NOT a Story-45-style normalization). The review is held to byte-identical reproduction of every migrated instance + a clean guard shrink.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS** (10 projects: search, schemas, ui, indexer, seeder, promoter, web, trust, api, shelves all Done).
- [x] `pnpm -r test` — **PASS** (whole workspace green: ui 16/16, web 300/300, api 784 passed + 10 skipped, plus search/schemas/promoter/seeder/indexer/trust/shelves — 0 failures). The happy-dom teardown `AbortError` in the web suite is pre-existing environment noise on an async-fetch test, not a failure (suite reports 52/52 files, 300/300 tests passed).
- [x] `pnpm --filter @unbnd/ui test` — **PASS** (11/11 guard files: button-literals + tokens + all 9 other `architecture-*` guards green).
- [x] `pnpm --filter @unbnd/web test` — **PASS** (52 files, 300 tests).
- [x] `pnpm --filter @unbnd/web build` — **PASS** (`tsc --noEmit` clean; `vite build` 455 modules, dist emitted).
- [x] _Lint not configured — skipped (per house rules)._

## Guard integrity (Tester shrank the set; Implementer must not have touched the guards)

- [x] **Only `architecture-button-literals.test.ts` changed** vs `origin/main`; every other `architecture-*.test.ts` and `tokens.test.ts` is byte-unchanged (`git diff --name-only origin/main...HEAD -- packages/ui/test/architecture-*.test.ts packages/**/tokens.test.ts` returns only `architecture-button-literals.test.ts`).
- [x] **The guard change is the Tester's commit `dbae472` only.** `git log origin/main..HEAD -- packages/ui/test/architecture-button-literals.test.ts` lists exactly `dbae472`. The Implementer's commit `bd9d6ee` touched **no** test files (`git show --stat bd9d6ee -- packages/ui/test/` empty). The Implementer did not modify any guard.
- [x] **`DEFERRED_CLASSES` shrank 5 → 1**, leaving only `searchbox-hit`. The four deleted entries are `auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more`. The guard's scan/offender logic is otherwise unchanged (only the allowlist array + header comments + the failure message differ).
- [x] **The guard is real, not faked green.** No raw `<button>` carrying any of the four migrated classes remains anywhere in `apps/web/src` (`grep` for `gps-pill|rated-by-more|auth-linklike|sub-back` on `*.tsx` returns no `<button>` use). Their rendered `<button>`s (where any) moved into `packages/ui/src/components/Pill.tsx` / `Link.tsx` — outside `SCAN_ROOT=apps/web/src`. `searchbox-hit` is still a live `role="option"` site in `SearchBox.tsx` (correctly still deferred).
- [x] The button guard runs **GREEN** with only `searchbox-hit` exempt.

## Per-site zero-diff audit (against `git show origin/main:`)

Every migrated site verified by comparing the resolved CSS + rendered markup to `origin/main`. CSS cascade ties (single-class selectors of equal specificity) were resolved by checking source order in the built bundle `apps/web/dist/assets/index-*.css`.

### Pill primitive

| Site | Migration | Verdict |
|---|---|---|
| `gps-pill` (GenrePillSelector) | `<button class="gps-pill …">` → `<Pill variant="select" on disabled onClick aria-pressed>` emitting `<button type="button" class="gps-pill {gps-on?}{gps-off?}">` | **byte-identical**. `.gps-pill`/`.gps-on`/`.gps-on:hover`/`.gps-off`/`:hover:not(:disabled)` moved into `Pill.css` value-for-value from the original `GenrePillSelector.css`. The className template (`gps-pill ${on?…} ${disabled?…}`) reproduces the original's exact double-space spans. `.gps` flex container stays at the call site (layout). `disabled` drives native `disabled` + `.gps-off`. ✓ |
| `rated-by-more` (RatedByRow) | `<button class="rated-by-more">` → `<Pill variant="count" aria-label onClick>` emitting `<button type="button" class="rated-by-more" aria-label>` | **byte-identical**. Skin moved into `Pill.css` value-for-value (height 30 / min-width 30 / padding 0 8 / radius-pill / border 1px --u-border / surface bg / amber / 12 / semibold / single-line transition / hover border-hover+amber-hover). The `margin-left: var(--u-space-4)` stays on `.rated-by-more` at the call site as layout-only residue; Pill renders class `rated-by-more` so that residue still applies. `aria-label` carried verbatim. ✓ |
| `GenrePill` ×3 (BookHeader, ShelfControl, TagControl) | import `./Pill` → `@unbnd/ui`; JSX unchanged | **byte-identical**. `GenrePill` re-exported as a thin `(p) => <Pill variant="genre" {...p}/>` wrapper; same public props (`label`/`color`/`count`/`community`), same `style` computation (`${color}14`), same `pill pill-genre [pill-community]` classes, same `.pill-conf` count badge. `.pill*` CSS moved from `apps/web/src/components/Pill.css` into `packages/ui/src/components/Pill.css` byte-for-byte (deleted apps/web `Pill.tsx`/`Pill.css`). Pure import repoint. ✓ |

### Link primitive — link-as-button affordances (the crux)

Verified the button-* variants emit Button's **own** skin classes so they match Button by construction; bundle order confirms the call-site density class (`.cta-btn`/`.auth-submit`/`.auth-btn-secondary`, all at offsets > the `.u-btn--*` classes) wins the padding/font-size ties over `u-btn--md`.

| Site | Migration | Verdict |
|---|---|---|
| `cta-btn` `<a>` (CallToAction) | `<a class="cta-btn" href>` → `<Link variant="button-primary" href className="cta-btn">` emitting `<a class="u-btn u-btn--primary u-btn--md cta-btn">` | **byte-identical**. `u-btn--primary` supplies amber/parchment/border-none/hover-amber-hover; `u-btn` supplies `--u-radius`; `.cta-btn` residue (display inline-block, font-size-13, padding 10 26, transition background 140ms) wins over `u-btn--md` (verified `.cta-btn` at bundle offset 19512 > `.u-btn--md` at 336). Skin half (`background`/`color`/`border`/`radius`/`weight`/`:hover`) deleted from `.cta-btn`. The sibling `<Button variant="primary" className="cta-btn">` branch is unchanged and stays identical. ✓ |
| `auth-submit` `<Link>` (AuthWelcome) | `<Link to className="auth-submit">` → `<Link as={RouterLink} to variant="button-primary" className="auth-submit" style={…}>` emitting `<a class="u-btn u-btn--primary u-btn--md auth-submit">` | **byte-identical**. Same resolution as cta-btn; `.auth-submit` residue (padding 12 16, font-size-14, margin-top 4, transition background 120ms) wins ties; skin deleted from `.auth-submit`. `style={{textAlign:center, textDecoration:none}}` carried verbatim. ✓ |
| `auth-submit` Buttons ×2 (AuthNostrConnect:182, AuthEmailSignup:138) | unchanged `<Button variant="primary" className="auth-submit">` | **byte-identical**. These stay Buttons; `className="auth-submit"` is now density-only residue. The Story-45 "partial double-skin" (both `u-btn--primary` AND `.auth-submit` setting amber) is resolved: `.auth-submit` skin deleted, both Buttons + the welcome Link now share `u-btn--primary` as the single skin source. ✓ |
| `auth-btn-secondary` `<Link>` ×3 (AuthNostrConnect:143,168; AuthWelcome:33) | `<Link to className="auth-btn-secondary">` → `<Link as={RouterLink} to variant="button-secondary" className="auth-btn-secondary" style={…}>` emitting `<a class="u-link--button-secondary auth-btn-secondary">` | **byte-identical**. Per ADR OQ-2 (a): `button-secondary` reproduces the **AUTH** secondary skin in `Link.css` (resting border `--u-border-hover`, hover `--u-ink` + `--u-surface`, transition border-color+background 120ms, font-weight-medium, radius), NOT Button's normalized secondary (`--u-border`/amber-hover) — verified value-for-value against the original `.auth-btn-secondary`. `.auth-btn-secondary` residue keeps only padding 12 18 + font-size-13. The asymmetry (primary shares Button's class, secondary is a distinct reproduced look) is intentional and documented. ✓ |

### Link primitive — plain-* (former link-styled `<button>` controls; OQ-1)

| Site | Migration | Verdict |
|---|---|---|
| `auth-linklike` ×2 (AuthEmailSignup:60,69) | `<button class="auth-linklike" type="button" onClick>` → `<Link variant="plain-amber" type="button" onClick>` defaulting `as="button"` → `<button class="u-link--plain-amber" type="button" onClick>` | **byte-identical**, correct a11y. OQ-1 Reading 2 chosen: the handler is an in-page signup-mode toggle, so it stays a real `<button>` (no anchor abuse). `.u-link--plain-amber` reproduces the original `.auth-card-footer .auth-linklike` value-for-value, **preserving the original declaration order** (`font-weight: medium` then `font: inherit`, the latter resetting the weight identically — the medium was already dead in the original). `type="button"` + `onClick` carried verbatim. Element stays `<button>` but moves into the primitive (outside SCAN_ROOT), so the guard entry is correctly dropped. The real footer `<a>` links keep their bespoke `.auth-card-footer a` skin in AuthShell.css (untouched). ✓ |
| `sub-back` (Submit:155) | `<button class="sub-back" type="button" onClick>` → `<Link variant="plain-muted" className="sub-back" type="button" onClick>` defaulting `as="button"` → `<button class="u-link--plain-muted sub-back" type="button" onClick>` | **byte-identical**, correct a11y. Handler is `setAdding(null)` (collapse the form — an in-page action, NOT navigation), so Reading 2 (`<button>`) is the right call despite the ADR's "likely navigates" guess. `.u-link--plain-muted` reproduces the original `.sub-back` skin (border/bg none, padding 0, font-size-13, muted, hover ink, cursor pointer) value-for-value; `margin-bottom var(--u-space-16)` stays on `.sub-back` residue at the call site. `type="button"` + `onClick` verbatim. ✓ |

### Bespoke text-link migrations within touched files (correctly NOT given a Link variant)

The plain `react-router` text links in the touched files (`AuthEmailSignup` "Sign in with Nostr", `AuthNostrConnect` "email signup instead", `Submit` "See your submissions" / "Sign in" / "submission policy") were only re-aliased `Link` → `RouterLink` (because `Link` now names the `@unbnd/ui` primitive in those modules). They remain ordinary bespoke `<a>` route links, unstyled by any primitive — correct; the nav/footer/byline family is out of scope. Verified Nav.tsx imports only `Icon`, Footer.tsx imports `Icon`/`SEMANTIC_COLORS` (neither imports the `Link` primitive); `nav-link`/`footer-links` stay bespoke.

## Link-as-button reproduction check (the §2 crux)

- [x] `button-primary` emits `u-btn u-btn--primary u-btn--md` — literally Button's own classes (verified in `Link.tsx` `VARIANT_CLASS`), so it tracks Button by construction. A future primary restyle updates buttons AND button-styled links in one edit (the epic goal).
- [x] `button-secondary` is intentionally NOT shared — it reproduces the distinct auth secondary skin in `Link.css` (OQ-2 (a)), because Button's normalized secondary differs (`--u-border`/amber-hover vs auth's `--u-border-hover`/ink+surface). Reusing Button's would have changed pixels. The asymmetry is documented in both `Link.css` and the ADR. Correct.
- [x] The `.auth-submit` shared-class resolution is exactly as the ADR specifies: skin → `u-btn--primary`, only density residue (padding/font-size/margin) kept; the welcome Link AND the two migrated Buttons resolve byte-identical.
- [x] `@unbnd/ui` does **not** import `react-router-dom` (`grep` finds it only in comments). `Link` is polymorphic via `as` (`ComponentPropsWithoutRef<T>`); callers pass `as={RouterLink}` so `to` flows through `...rest` without the package depending on the router (ADR 0038 §7 honored). Package deps unchanged (react/react-dom peers only).

## Visual gate

- [x] **`gh pr checks 90` → `Visual regression` is `success`** (also `Typecheck, test, build` pass, `Validate Caddyfile` pass).
- [x] **No `*.png` baseline changed** (`git diff --name-only origin/main...HEAD` matches no png/snapshot/baseline file). Zero-diff backstop intact; no re-baseline.

## ADR / spec / house-rules adherence

- [x] Files changed match ADR 0047 §Implementation notes exactly (new `Link.tsx`/`Link.css`, `Pill.tsx`/`Pill.css` in `packages/ui/src/components/`; `index.ts` exports added after Icon; the 8 call-site migrations; the 6 CSS residue trims; the `DEFERRED_CLASSES` shrink).
- [x] `className` rule (ADR 0038 §2): `Link`/`Pill` accept only an additive layout-only `className`, merged after the variant classes — no re-skin escape hatch. Variant/state ride on typed props (`variant`, `on`, `disabled`, discriminated `PillProps`). ✓
- [x] No new token minted; `Link.css`/`Pill.css` reference only `var(--u-*)`. All prior guards (40–46) stay green. No `<svg>` authored. No new tooling/dependency.
- [x] `Card`, `Input`/`Field`/`Label`, `Avatar`, signal pills (`book-signal` et al.), and `searchbox-hit` left bespoke / untouched per scope (47b owns Avatar/Field; Card scoped out of Story 47; signal pills + searchbox-hit deferred).
- [x] No secrets, no `console.log`, no commented-out code, no TODOs introduced. PRD §11.3 untouched (pure platform-hardening). Copy in new doc-comments passes the no-slop rules (no em dashes, no banned filler).

## Findings

### Blocking
None.

### Non-blocking
1. **`engineering-team/decisions/0047-link-pill-primitives.md` OQ-1 note** — the ADR guessed `sub-back` "likely navigates (Reading 1)", but its handler is an in-page `setAdding(null)`, so the Implementer correctly used Reading 2 (`<button>`). The implementation is right; the ADR's parenthetical guess is just stale. No action required (the ADR is Accepted and OQ-1 explicitly licensed either reading).
2. **Global vs scoped selector for `u-link--plain-amber`** — the original `.auth-linklike` skin was scoped under `.auth-card-footer`; `u-link--plain-amber` is global. It is byte-identical today because the control only renders in the auth footer and `font: inherit` picks up the same context. A future non-footer use of `plain-amber` would inherit a different surrounding font, but that is the intended primitive behavior, not a defect.

## Verdict

**PASS** — All gates green (typecheck, full `-r test`, web build, ui guards). Guard integrity intact (only the Tester's commit touched the one guard; the `DEFERRED` set honestly shrank 5→1 and is real). Every migrated site is provably byte-identical (CSS transcriptions value-for-value, cascade ties resolved by verified bundle order, markup/aria/type/onClick/href/to carried verbatim). The link-as-button affordances render Button's own primary skin by construction and reproduce the distinct auth secondary value-for-value. The visual job is `success` with no baseline change. Mergeable as-is.
