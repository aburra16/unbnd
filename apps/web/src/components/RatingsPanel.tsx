// Ratings display with the trust perspective (ADR 0014). House view by default
// (nosfabrica-weighted when there's a trusted signal, else raw so the catalog
// never looks empty). Sovereign users with scores toggle House ⇄ Yours; those
// without can Personalize (in-app self-serve trigger, ~5–6 min build).
//
// Story 28 / ADR 0029 §3: CONTROLLED. The shared `useBookRatings` hook (owned by
// BookDetail) does the fetching; this panel renders the `house`/`yours`/`status`
// slices it is handed and keeps owning the House⇄Yours toggle chrome via
// `useTrustView`. No self-fetch (the double-fetch race is gone).
import { type RatingsSummary } from "../lib/api";
import { useTrustView } from "../hooks/useTrustView";
import { RatingsBlock } from "./RatingsBlock";
import { RatedByRow } from "./RatedByRow";
import { ReviewsList } from "./ReviewsList";
import "./RatingsPanel.css";

export function RatingsPanel({
  // `slug` is retained for prop-shape parity with BookDetail; the read now lives
  // in the shared hook, so the panel itself never fetches.
  slug: _slug,
  house,
  yours,
  status: dataStatus,
}: {
  slug: string;
  house: RatingsSummary | null;
  yours: RatingsSummary | null;
  status: "loading" | "ready" | "error";
}) {
  const { status, view, setView, personalize, error } = useTrustView();

  const showYours = view === "yours" && status === "ready";
  const active = showYours ? yours : house;
  // The shared hook is still fetching, or nothing has arrived yet.
  if (dataStatus === "loading" || !active) {
    return <p className="route-status" role="status">Loading ratings…</p>;
  }

  const w = active.weighted ?? null;
  let average: number | null;
  let count: number;
  let reviews = active.ratings;
  let label: string;
  let caption: string;
  let countNoun = "ratings";
  let emptyNote: string | undefined;

  if (showYours) {
    average = w?.average ?? null;
    count = w?.trustedCount ?? 0;
    reviews = w?.ratings ?? [];
    label = "Your perspective";
    caption = "Trusted consensus, weighted by your own web of trust.";
    countNoun = "trusted ratings";
    emptyNote = "No ratings from your trust network yet.";
  } else if (w) {
    average = w.average;
    count = w.trustedCount;
    reviews = w.ratings;
    label = "Unbnd house view";
    caption = "Trusted consensus, weighted by the Unbnd house web of trust.";
    countNoun = "trusted ratings";
  } else {
    average = active.average;
    count = active.count;
    reviews = active.ratings;
    label = "Unbnd house view";
    caption = "Community consensus from all ratings. No trusted ratings for this book yet.";
  }

  return (
    <div className="ratings-panel">
      <div className="rp-controls">
        {status === "ready" && (
          <div className="rp-toggle" role="tablist" aria-label="Rating perspective">
            <button
              type="button"
              role="tab"
              aria-selected={view === "house"}
              className={view === "house" ? "rp-tab rp-tab-on" : "rp-tab"}
              onClick={() => setView("house")}
            >
              House
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "yours"}
              className={view === "yours" ? "rp-tab rp-tab-on" : "rp-tab"}
              onClick={() => setView("yours")}
            >
              Yours
            </button>
          </div>
        )}
        {status === "none" && (
          <button type="button" className="rp-personalize" onClick={personalize}>
            Personalize
          </button>
        )}
        {status === "building" && (
          <span className="rp-building" role="status">
            Building your web of trust… (~5 min)
          </span>
        )}
      </div>
      {error && <p className="rp-error" role="alert">{error}</p>}
      <p className="rp-caption">{caption}</p>
      <RatingsBlock average={average} count={count} countNoun={countNoun} label={label} emptyNote={emptyNote} />
      <RatedByRow ratings={reviews} />
      <ReviewsList ratings={reviews} />
    </div>
  );
}
