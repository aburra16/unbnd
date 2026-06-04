// icons.tsx — the five hand-authored icon render functions (ADR 0046 §Decision,
// "Implementation notes"). Each is a VERBATIM transcription of its pre-migration
// source <svg> (markup quoted in ADR 0046 §Context), parameterized ONLY by the
// props that source already varied, with the SAME defaults. This is the
// byte-identical (zero-diff) source of truth — same viewBox, child elements,
// attribute values, attribute source-order, default size, per-element opacity,
// and aria treatment as the originals. No normalization (Story 46 binding).
//
// Per-icon `className` rides through onto the root <svg> for every icon (so
// `check`'s `follow-check` class lands exactly as before, and future layout
// classes can ride along).
import type { ReactElement } from "react";
import { SEMANTIC_COLORS } from "../../colors";

// 1. search — from SearchIcon.tsx. Stroke magnifier. size default 16,
// stroke default SEMANTIC_COLORS.muted; fill="none", strokeWidth={2},
// strokeLinecap="round", aria-hidden. (SearchBox renders all defaults.)
export function renderSearch({
  size = 16,
  stroke = SEMANTIC_COLORS.muted,
  className,
}: {
  size?: number;
  stroke?: string;
  className?: string;
}): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

// 2. logo — from LogoMark.tsx. The Unbnd brand mark. size default 26, fill
// default SEMANTIC_COLORS.amber, opacityScheme default "solid", title default
// "Unbnd". The default-parameter fallbacks are LOAD-BEARING: AuthShell passes
// `fill={logoFill}` where logoFill is undefined for two callers, so `fill ===
// undefined` MUST resolve to amber via the default parameter (a bare
// fill={undefined} would drop the attribute and render none — a visible diff).
// This is the only icon that is NOT aria-hidden: role="img" + aria-label={title}.
export function renderLogo({
  size = 26,
  fill = SEMANTIC_COLORS.amber,
  opacityScheme = "solid",
  title = "Unbnd",
  className,
}: {
  size?: number;
  fill?: string;
  opacityScheme?: "solid" | "soft";
  title?: string;
  className?: string;
}): ReactElement {
  const cornerOpacity = opacityScheme === "soft" ? 0.85 : 1;
  const circleOpacity = opacityScheme === "soft" ? 0.7 : 1;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <path
        d="M4 46 Q4 4 46 4 L46 46 Z"
        fill={fill}
        fillOpacity={cornerOpacity}
      />
      <circle cx="72" cy="26" r="18" fill={fill} fillOpacity={circleOpacity} />
      <circle cx="26" cy="72" r="18" fill={fill} fillOpacity={circleOpacity} />
      <path
        d="M54 54 L54 96 Q96 96 96 54 Z"
        fill={fill}
        fillOpacity={cornerOpacity}
      />
    </svg>
  );
}

// 3. check — from FollowButton.tsx (CheckGlyph). Two-segment check. Fixed
// 14x14, viewBox="0 0 16 16", currentColor stroke, strokeWidth="1.8",
// strokeLinecap/strokeLinejoin "round", aria-hidden. `className` passthrough is
// the load-bearing case here (the `follow-check` descendant selector).
export function renderCheck({
  className,
}: {
  className?: string;
}): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <polyline
        points="3.5,8.5 6.5,11.5 12.5,4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 4. bolt — from AuthMethodCard.tsx (NostrBolt). Nostr lightning mark. Fixed
// 16x16, viewBox="0 0 24 24", fill="currentColor", aria-hidden. Defaults only.
export function renderBolt({
  className,
}: {
  className?: string;
}): ReactElement {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

// 5. star — from RatingControl.tsx (Star). Fixed 22x22, viewBox="0 0 24 24",
// currentColor stroke, strokeWidth="1.4", strokeLinejoin="round" (NO
// strokeLinecap — the source has none), aria-hidden. `filled` toggles the path
// fill between "currentColor" and "none".
export function renderStar({
  filled = false,
  className,
}: {
  filled?: boolean;
  className?: string;
}): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
    >
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9 6.2 20.9l1.1-6.47-4.7-4.58 6.5-.95z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
