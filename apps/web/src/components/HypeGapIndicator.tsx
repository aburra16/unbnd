// Story 70 / ADR 0068 — the hype-gap signal on book detail. Renders a token-only
// colour + text line for a hidden gem (trusted network above the crowd) or
// overhyped (crowd above the trusted network); nothing on consensus or below the
// trusted-rater minimum. The text label carries the meaning, so it is legible
// without colour (AC-6). Observer-relative: the caller passes the active
// perspective's raw + trusted averages.
import { classifyHypeGap } from "../lib/view-model";
import "./HypeGapIndicator.css";

export function HypeGapIndicator({
  rawAverage,
  trustedAverage,
  trustedCount,
}: {
  rawAverage: number | null;
  trustedAverage: number | null;
  trustedCount: number;
}) {
  const gap = classifyHypeGap(rawAverage, trustedAverage, trustedCount);
  if (gap !== "hidden-gem" && gap !== "overhyped") return null;

  const label =
    gap === "hidden-gem"
      ? "Hidden gem · your network rates this above the crowd"
      : "Overhyped · people you trust are cooler on this than the crowd";

  return (
    <p className={`hype-gap hype-gap-${gap}`}>
      <span className="hype-gap-dot" aria-hidden="true">
        ●
      </span>
      {label}
    </p>
  );
}
