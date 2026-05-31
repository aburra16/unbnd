// "Rated by" roster (Story 24, ADR 0024 Option A). Takes the ACTIVE
// perspective's ratings array and surfaces every rater — reviewers and
// rate-only alike — as a circular Avatar badge linking to /profile/<npub>.
//
// Collapsed: the first ≤5 raters as an overlapping avatar pile + a "+N" chip.
// Expanded (in place): a wrapping grid of a badge for EVERY rater, each showing
// the resolved name + ★ score. The overflow badges (and thus their
// useProfileMeta kind-0 fetches) mount ONLY after expand — the lazy guarantee
// is structural (a hook only fires for a mounted component).
//
// Each RaterBadge self-fetches its kind-0 via the cached useProfileMeta (Story
// 19), so a rater who also appears in a review byline resolves a single kind-0.
import { useState } from "react";
import { Link } from "react-router-dom";
import type { PublicRating } from "../lib/api";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import { shortNpub } from "../lib/view-model";
import { Avatar } from "./Avatar";
import "./RatedByRow.css";

const CAP = 5;

// A leaf badge that resolves its own kind-0 (cached/deduped) and links to the
// profile. `detailed` adds the name + score line used in the expanded grid.
function RaterBadge({
  rating,
  size,
  detailed,
}: {
  rating: PublicRating;
  size?: number;
  detailed?: boolean;
}) {
  const meta = useProfileMeta(rating.npub);
  const name = displayNameOf(meta, shortNpub(rating.npub));
  return (
    <Link
      to={`/profile/${rating.npub}`}
      className={detailed ? "rated-by-badge rated-by-badge-grid" : "rated-by-badge"}
      title={name}
      aria-label={name}
    >
      <Avatar label={name} seed={rating.npub} picture={meta?.picture} size={size ?? 30} />
      {detailed && (
        <span className="rated-by-detail">
          <span className="rated-by-name">{name}</span>
          <span className="rated-by-score" aria-hidden="true">
            ★ {rating.score}
          </span>
        </span>
      )}
    </Link>
  );
}

// One expanded-grid cell, scoping a single rater's badge + name + score.
function RaterGridItem({ rating }: { rating: PublicRating }) {
  return (
    <li className="rated-by-cell">
      <RaterBadge rating={rating} detailed />
    </li>
  );
}

export function RatedByRow({ ratings }: { ratings: PublicRating[] }) {
  const [expanded, setExpanded] = useState(false);

  // Dedup by npub so a rater listed twice (defensive) is one badge; preserve
  // the perspective array's order.
  const raters: PublicRating[] = [];
  const seen = new Set<string>();
  for (const r of ratings) {
    if (seen.has(r.npub)) continue;
    seen.add(r.npub);
    raters.push(r);
  }

  // AC-8: zero raters → render nothing (no shell, no placeholder).
  if (raters.length === 0) return null;

  const overflow = raters.length - CAP;
  // Lazy-on-expand: collapsed mounts only the first CAP badges. The rest mount
  // (and fire their kind-0 fetch) only after expand.
  const shown = expanded ? raters : raters.slice(0, CAP);

  return (
    <section className="rated-by">
      <header className="rated-by-head">
        <span className="rated-by-label">Rated by</span>
      </header>
      {expanded ? (
        <ul className="rated-by-grid">
          {shown.map((r) => (
            <RaterGridItem key={r.npub} rating={r} />
          ))}
        </ul>
      ) : (
        <div className="rated-by-pile">
          {shown.map((r) => (
            <RaterBadge key={r.npub} rating={r} />
          ))}
          {overflow > 0 && (
            <button
              type="button"
              className="rated-by-more"
              aria-label={`Show all ${raters.length} raters`}
              onClick={() => setExpanded(true)}
            >
              +{overflow}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
