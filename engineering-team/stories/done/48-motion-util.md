# Story 48: Motion util — honest scope after Story 44 (thin; the hook only, or skip)

**Status:** Done (closed as a no-op — no code)
**Created:** 2026-06-04
**Type:** Refactor (structural / invisible-to-users / zero-diff) — scope under review

**RESOLUTION 2026-06-04 (user-directive-aligned, no code):** epic story 11 is closed as a **no-op**. Story 44 already delivered the motion substance (all transitions tokenized onto `--u-duration-*`/`--u-ease-default` + the global `prefers-reduced-motion` block covering 100% of in-use motion). The three remaining "motion util" pieces are not buildable under the binding ZERO-DIFF / no-busywork directive: (1) a `transition()` CSS helper is **redundant** (every transition is already token-backed; no byte-identical cluster to dedupe — consolidating would edit property lists = not zero-diff); (2) routing `Button`/`IconButton` through a transition util would **ADD motion** (their hovers are instant today, preserved byte-identical by Story 45) = a user-visible behavior change, forbidden; (3) the `usePrefersReducedMotion` hook has **zero consumers** (no JS-driven motion exists) — a dormant speculative export, deferred (YAGNI) to the first JS-motion consumer. No primitive reroute, no helper, no hook this story. The §4 motion-layer closeout is noted in the docs story (epic 14). Closed without a PR (no code change).

## Background

This is epic story 11 of Epic 0001 (Overhaul-ready design system, `@unbnd/ui`). The epic line reads: "**Motion util/primitive** — small token-backed `transition()` helper/class set and a reduced-motion-aware hook for any JS-driven motion; route primitive interactions through it." ADR 0038 §4 (Motion layer) states it in the umbrella's own words: "Motion tokens (durations + easings, §1) plus a tiny primitive/util in `@unbnd/ui` (a `transition()` CSS helper / class set and, where JS-driven motion is needed, a small hook that reads the reduced-motion media query). All timing and easing centralize on the tokens. The 29 ad-hoc transitions migrate to the token-backed util."

**The decisive context: Story 44 (ADR 0044, Accepted/Done 2026-06-03) already delivered the motion substance.** Story 44 was epic story 7 (motion tokens). It:

- Tokenized **all 29 `transition` declarations** onto two-tier tokens (`--u-duration-{120,140,150,160,180,200}ms` and `--u-ease-default`), so every transition's timing and easing already centralize on the tokens. ("All timing and easing centralize on the tokens. The 29 ad-hoc transitions migrate to the token-backed util" — the first clause is done; the second clause assumed a util that, on inspection, the tokens already make redundant for the CSS sites. See the survey.)
- Added the global `@media (prefers-reduced-motion: reduce)` block in `packages/ui/styles/tokens.css` that zeroes the semantic duration aliases to `0.01ms`, so **every token-driven CSS transition already degrades to instant under reduced motion** ("Reduced-motion is honored globally via §1" — done).
- Added the motion CI guard (`packages/ui/test/architecture-motion-literals.test.ts`) that forbids raw duration/easing literals outside the token layer and asserts the reduced-motion block is present. The guard already covers `animation`/longhands and TSX inline-style motion defensively.
- Verified, twice, that **there is NO JS-driven motion anywhere on `main`**: zero `@keyframes`, zero `animation`, zero `transition`/`animation` strings in any `.tsx`, zero `matchMedia`/`requestAnimationFrame`/`.animate()`. Re-confirmed for this story (the single `matchMedia` mention in the repo is a comment in `packages/ui/src/breakpoints.ts`, not a call).

Story 44 explicitly **deferred** the two remaining pieces of §4 to this story (ADR 0044 Out of scope, and the Story-44 doc): "The motion util / `transition()` helper and the `matchMedia`-driven reduced-motion JS hook (ADR 0038 §4, epic story 11). This story tokenizes the existing CSS transitions and adds the global CSS reduced-motion block only; it builds no util, no hook, and routes no primitive interaction through them. (No JS-driven motion exists on `main`.)"

So this story is left holding only what Story 44 deferred: a `transition()` CSS helper/class set, a reduced-motion-aware JS hook, and "route primitive interactions through it." Under the binding directive (structural, invisible-to-users, **zero-diff**, no new features, no normalization, escalate rather than normalize), each of those must be assessed honestly for whether it adds **real zero-diff value** or is redundant / speculative / a behavior change in disguise. The quality bar (`memory/feedback_unbnd_quality_bar.md`) forbids padding a near-empty story into a full one to justify its existence.

The epic's operating principle is "same pixels, better structure." House-rule anchors: `CLAUDE.md` "Brand tokens are the visual source of truth" and "No new lint/typecheck/build tooling without an ADR" (this story adds none). Governing ADR: 0038 §4. Whether a refining ADR is warranted depends on the scope call (see Open questions).

## Survey (read-only against `main`, 2026-06-04)

The three pieces epic story 11 / ADR 0038 §4 names, each assessed against the post-Story-44 tree under the zero-diff directive:

### 1. A token-backed `transition()` CSS helper / shared class set — REDUNDANT zero-diff

The argument for a helper is "so components apply transitions consistently." But after Story 44, **the transitions are already token-backed and already consistent per the tokens.** Every one of the 28 surviving CSS `transition` declarations (the 29th was a comment) reads `... var(--u-duration-*) var(--u-ease-default)` — the duration and easing already come from one source. A helper that injected the same `var()`s would change *where the string is authored*, not *what resolves*, and would not improve consistency the tokens have already enforced (and the motion guard already locks).

The real test for a shared CSS class is: **do unrelated sites share a byte-identical full `transition` value that a single class could collapse zero-diff?** They do not. The declarations vary along **two independent axes** — the *property set* (which properties animate) and the *duration*:

- **Single-line shapes (tallied):** `color … 120ms` (×5), `background … 120ms` (×3), `background … 140ms` (×2), `width … 200ms` (×1), `transform … 140ms` (×1), `transform … 120ms` (×1), and a `border-color, color … 120ms` two-layer (×1, Pill).
- **Multi-line shapes:** `transform+box-shadow 180ms` (BookCard), `transform+border-color 160ms` (GenreGrid), `border-color+box-shadow 120ms` (AuthForm/Hero/AuthMethodCard/Submit), `border-color+background 120ms` (Nav/WhereToRead/Link), `color+border-color 120ms` (PoVBar), `background-color+border-color+color 150ms` (FollowButton), `color+border-color+background 120ms` (Pill), etc.

No clean cluster of identical full values exists. Even the few that *look* alike (e.g. `border-color, background 120ms` in Nav / WhereToRead / Link) sit inside different selectors carrying different *other* declarations, so they are not byte-identical rule blocks; collapsing them onto a shared class would mean either (a) editing each rule's property list — not zero-diff if any property differs — or (b) extracting a utility class and **rewiring `className` lists in the TSX**, which touches markup and risks a diff for no resolved-value gain. Either path is the "normalize / consolidate" move the directive forbids and tells us to **escalate** instead. **A `transition()` CSS helper adds no real zero-diff value on top of Story 44's per-component token references.** A genuine motion-vocabulary helper (semantic role classes like a single "control interaction" transition) is a *consolidation/design* decision — it would merge property sets and/or durations and change feel/structure — and is exactly the deferred "richer semantic motion role tokens" item ADR 0044 already recorded as a separate, deliberate, visual-change story.

### 2. A `usePrefersReducedMotion` (or similar) JS hook — REAL but forward-looking, ZERO current consumer

ADR 0038 §4 scopes the hook precisely: "**where JS-driven motion is needed**, a small hook that reads the reduced-motion media query." Story 44 confirmed and this story re-confirms there is **no JS-driven motion on `main`** — nothing animates from JS, and nothing reads the reduced-motion preference in JS. The CSS reduced-motion block already covers 100% of in-use motion (all of it is token-reading CSS `transition`). So a hook today would be **infrastructure with no consumer**: zero user-facing change, zero current caller, green-but-dormant. It is genuinely zero-diff (it ships a new export; it changes no render), and it is the JS counterpart of the CSS reduced-motion block (parity: CSS motion already degrades; any future JS motion would need the same signal). But adding an unused export cuts against the epic's "no speculative steps" discipline that Stories 41–44 held for tokens (they refused to mint dead tokens). The honest framing: this hook is **forward-looking infra justified only by parity and by the §4 contract**, not by any current need.

### 3. "Route primitive interactions through it" — a BEHAVIOR CHANGE for Button/IconButton, redundant for Link/Pill

The primitives that exist today (Stories 45–47b: `Button`, `IconButton`, `Link`, `Pill`, `Avatar`, `Field`, `Label`) split into two cases:

- **`Button` and `IconButton` carry NO `transition` declaration at all** (verified: `Button.css` and `IconButton.css` have hover/focus/active state changes — background, opacity, border-color, the focus-visible ring — but **zero `transition`**). That means their hovers are **instant today**, and Story 45 preserved that byte-identical (ADR 0045 §2 zero-diff set). **Routing Button/IconButton interaction through a transition util would ADD an animated transition that does not exist today — a user-visible behavior change, not zero-diff.** The directive forbids this and says to escalate. Adding motion to the primitives is a deliberate motion-*design* story, not this structural one.
- **`Link` and `Pill` already carry token-backed `transition` declarations** (`Link.css:89`, `Pill.css:69` and `:114`), authored on the `var(--u-duration-120ms) var(--u-ease-default)` tokens by Stories 47a. They already get reduced-motion degradation via the global CSS block. Rerouting them through a CSS helper is the same redundant move as (1) — no zero-diff gain.

So "route primitive interactions through it" is **either a behavior change (Button/IconButton) or redundant (Link/Pill)** under zero-diff. Nothing to do here without crossing into motion redesign.

### Survey finding (summary)

**Story 44 already delivered the motion substance of epic story 11 / ADR 0038 §4.** Of the three pieces this story inherited: the `transition()` CSS helper is **redundant** (tokens already give the consistency; no zero-diff consolidation exists — the shapes vary by property set × duration); routing primitive interactions through a util is **a behavior change (Button/IconButton have no transition today) or redundant (Link/Pill already token-backed)**; only the **`usePrefersReducedMotion` JS hook** is genuinely zero-diff, and it is **forward-looking infra with no current consumer** (no JS-driven motion exists). This story is **thin**.

## Scope recommendation

**Recommend (b)-leaning-thin: ship ONLY the `usePrefersReducedMotion` JS hook as forward-looking parity infra, OR fold this story into the docs story (epic story 14) / drop it with a one-line note — Architect's call at the planning gate.** Do **not** build the `transition()` CSS helper or reroute the primitives; both are redundant or behavior-changing under zero-diff, and inventing them would be padding the quality bar forbids.

Two honest options for the Architect to choose between (the PO does not pick the mechanism):

- **Option A — minimal-real (the hook only).** Add a `usePrefersReducedMotion` hook to `@unbnd/ui` (the §4 JS counterpart of the CSS reduced-motion block), exported but with no current consumer, plus a one-line extension of the existing motion guard's allowlist for the hook's source file if the guard would otherwise flag it (it should not — the hook reads a media-query *string*, not a duration/easing literal). This discharges the §4 "reduced-motion-aware hook" line as parity infra, zero-diff, no user-facing change. Cost: one dormant export. This is the most that can be built honestly under the directive.
- **Option B — thin/skip (recommended if the gate values "no speculative steps" over "discharge §4 now").** Record that Story 44 already delivered §4's motion substance and that the remaining `transition()` helper and primitive-rerouting are redundant/behavior-changing under zero-diff; **defer the hook to the first story that actually introduces JS-driven motion** (build-it-when-there's-a-consumer), and fold the §4 closeout note into the docs story (epic story 14). Net: this story ships a decision and a note, no code. This is the most honest outcome if the gate weighs the Stories-41–44 "no dead tokens / no speculative steps" precedent above eagerly discharging the §4 line.

**PO read:** the substance is done; the only buildable, honest, zero-diff increment is the hook, and even that has no consumer today. Lead with Option B (thin/defer) unless the Architect judges that discharging the §4 hook line now (Option A) is worth one dormant export for parity with the CSS block. Either way, the `transition()` helper and primitive-rerouting are **out** — they are redundant or behavior-changing, not zero-diff.

## User-facing description

As an Unbnd engineer, I want the motion-util line of ADR 0038 §4 closed out honestly given that Story 44 already tokenized every transition and shipped the global reduced-motion block — either by adding the one genuinely-zero-diff piece that remains (a `usePrefersReducedMotion` hook as forward-looking parity infra for future JS-driven motion) or by recording that the substance is delivered and deferring the hook until a JS-motion consumer exists — so that the epic does not accrue a redundant CSS helper or a behavior-changing primitive reroute, and the §4 contract is discharged truthfully rather than padded.

There is **no user-facing change** under either option. The CSS-side motion behavior (token-driven transitions, reduced-motion degradation) was already shipped by Story 44 and is unchanged here. Option A adds a developer-facing export with no current caller; Option B adds no code.

## Acceptance criteria

Testable from the outside. Which set applies depends on the Architect's Option A vs B call at the gate; both hold the zero-diff line.

**If Option A (hook only):**

- [ ] Given `@unbnd/ui`, when its exports are inspected, then a `usePrefersReducedMotion` (or Architect-named) hook is exported with a documented, stable signature; it reads the `(prefers-reduced-motion: reduce)` media query and returns the current preference, updating if the preference changes; it is SSR-/no-`matchMedia`-safe (defined fallback when `matchMedia` is unavailable).
- [ ] Given the hook follows the crypto/no-hand-roll discipline only where applicable (N/A here) and the no-slop discipline, when its source and any doc string are read, then they contain no banned copy/visual slop.
- [ ] Given the app at the default (no-preference) media state, when it renders, then it is **byte-identical** to before this story; the hook has no consumer and changes no render. The Story-39 `visual` job is zero-diff with **no baseline update**.
- [ ] Given the hook ships with **no current consumer**, when the tree is searched, then no primitive or app code is rerouted through a new transition util and no `transition` is added to `Button`/`IconButton` (their hovers stay instant, byte-identical).
- [ ] Given the motion guard and all prior token guards, when `pnpm -r test` runs, then they stay green (the hook's source is added to the motion-guard allowlist only if needed; it carries no raw duration/easing literal).
- [ ] Given the workspace, when `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` run, then all pass.

**If Option B (thin/defer):**

- [ ] Given this story, when it is resolved, then it records that Story 44 already delivered ADR 0038 §4's motion substance, that the `transition()` CSS helper and primitive-rerouting are redundant or behavior-changing under zero-diff (with the survey evidence), and that the `usePrefersReducedMotion` hook is deferred to the first story that introduces a JS-driven-motion consumer; the §4 closeout note is folded into the docs story (epic story 14).
- [ ] Given the tree, when it is inspected, then **no code changes** land from this story; the app is byte-identical; the Story-39 `visual` job is zero-diff with no baseline update; all guards stay green.

**Both options:**

- [ ] No `transition()` CSS helper / shared transition class is added (redundant zero-diff; the shapes vary by property set × duration with no collapsible cluster).
- [ ] No primitive interaction is rerouted through a transition util; `Button`/`IconButton` gain no `transition` (that is a behavior change, escalated to a future motion-design story); `Link`/`Pill` are left as Story 47a shipped them.
- [ ] No motion-scale rationalization, no easing retune, no feel change, no normalization. Any tempting consolidation is escalated, not performed.

## DList shapes touched

None. This is front-end design-system infrastructure (a possible JS hook in `@unbnd/ui`, or a decision/doc note), not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo (ADR 0044 for the motion layer already shipped; `packages/ui/src/breakpoints.ts` for the `matchMedia`-aware-export precedent the hook would mirror). No data fixture changes.

## Out of scope

The fence is tight: this story closes out the §4 motion-util line **honestly and zero-diff**, nothing more.

- **A `transition()` CSS helper / shared transition class set.** Redundant after Story 44 (transitions already token-backed and consistent) and not zero-diff-consolidatable (the 28 shapes vary by property set × duration with no byte-identical cluster a class could collapse). A semantic motion-role helper is a consolidation/design decision (the deferred "richer semantic motion role tokens" ADR 0044 recorded) — a separate, deliberate, visual-change story.
- **Routing primitive interactions through a transition util.** `Button`/`IconButton` have **no `transition` today** (instant hovers, byte-identical per ADR 0045 §2); adding one is a user-visible behavior change escalated to a future motion-design story. `Link`/`Pill` already carry token-backed transitions; rerouting them is the same redundant move. Neither is zero-diff.
- **Any motion redesign / motion-scale rationalization / easing retune / feel change.** Out, same as Story 44's fence. Escalate, do not normalize.
- **Building JS-driven motion of any kind** (animations, transitions driven from React, a motion/animation library). None exists; this story does not add any. ADR 0038 §4: "No animation library is introduced."
- **Touching the motion tokens, the global reduced-motion CSS block, or the motion guard's literal scan** (all owned by Story 44 / ADR 0044). The only permitted guard touch is adding the hook's source file to the allowlist *if* Option A's hook would otherwise trip the guard (it should not).
- **Any other token axis or primitive** (color/type/spacing/shape/motion tokens; Button/IconButton/Icon/Link/Pill/Avatar/Field/Label primitives; layout primitives; theming) — all owned by their own epic stories.
- **Re-pointing `CLAUDE.md` / `AGENTS.md`** at `@unbnd/ui` or citing guards — that is epic story 14 (the docs story), which is also where Option B's §4 closeout note would land.
- Any behavior, copy, or information-architecture change. The default-state render must be byte-identical, proven zero-diff against the Story-39 harness with no baseline update.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, social feed, reading progress, federation, notifications). It is behavior-preserving infrastructure (or a decision note) and does not approach the §11.3 line.

## Open questions

For the Architect to resolve at the planning/architecture gate. The PO frames the scope call and the survey; the PO does not pick the hook's API or build mechanism.

- **The scope call: Option A (ship the hook) vs Option B (thin/defer).** Given Story 44 delivered §4's motion substance and the survey shows the `transition()` helper is redundant and primitive-rerouting is behavior-changing/redundant, the only buildable zero-diff increment is the `usePrefersReducedMotion` hook — and it has no current consumer. Does the gate want to discharge the §4 hook line now as parity infra (one dormant export, Option A), or defer it to the first JS-motion consumer and fold the §4 closeout into the docs story (Option B, the PO's lead recommendation under "no speculative steps")? This is the load-bearing decision.
- **If Option A: the hook's shape.** Name (`usePrefersReducedMotion`?), return type (boolean? a richer object?), the `matchMedia` listener wiring and cleanup, the SSR / no-`matchMedia` fallback, and whether it mirrors the `packages/ui/src/breakpoints.ts` "typed export for JS-driven logic" precedent. The Architect picks; the PO only requires it be zero-diff (no consumer, no render change) and no-slop.
- **Do the primitives dedupe transitions zero-diff?** The PO's read is **no**: `Button`/`IconButton` have no transition (adding one is a behavior change), and `Link`/`Pill`'s token-backed transitions are not byte-identical-collapsible with each other or with app-CSS sites (different selectors, different property sets). The Architect confirms there is no zero-diff dedup available, or escalates any tempting one rather than normalizing.
- **Whether a refining ADR is warranted.** Under Option B, likely a short ADR or an addendum to ADR 0044 recording "§4 motion-util closed out: substance delivered by Story 44; helper redundant, primitive-reroute behavior-changing, hook deferred." Under Option A, an ADR for the hook's API. The Architect decides and writes it if so.
- **Guard touch.** If Option A, confirm the hook's source needs no motion-guard exemption (it reads a media-query string, carries no duration/easing literal) or, if it does, that the allowlist addition is the legitimate one-file exemption ADR 0038 §6 anticipates for new token-source/util files.

## Phase-2 hardening note

This is Phase-2 platform hardening under Epic 0001 (design-system overhaul), not a product-feature change. It touches no product surface and no PRD §11.x in-scope claim. Either outcome (a dormant hook, or a decision/defer note) is invisible to Readers, Curators, and Authors. Any PRD addendum is the post-Phase-2 platform-hardening addendum, not now — and under the recommended thin/defer outcome there is no behavior to record at all.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; §1 motion tokens + reduced-motion mechanism, §4 motion layer naming the util/hook). A refining ADR (or an ADR-0044 addendum) may come from the Architecture phase per the scope call.
- ADR: `engineering-team/decisions/0044-motion-tokens.md` (the motion substance already shipped: two-tier tokens, the global reduced-motion block, the motion guard; it explicitly deferred this story's util/hook).
- Story: `engineering-team/stories/done/44-motion-tokens.md` (epic story 7; what was already delivered).
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 11).
- Test plan: (filled in after Test Design phase, if the chosen option warrants one — Option B may not.)
- Review: (filled in after Review phase.)
