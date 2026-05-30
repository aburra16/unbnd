// Ratings display with the trust perspective (ADR 0014). House view by default
// (nosfabrica-weighted when there's a trusted signal, else raw so the catalog
// never looks empty). Sovereign users with scores toggle House ⇄ Yours; those
// without can Personalize (in-app self-serve trigger, ~5–6 min build).
import { useEffect, useState } from "react";
import { api, type RatingsSummary } from "../lib/api";
import { useTrustView } from "../hooks/useTrustView";
import { RatingsBlock } from "./RatingsBlock";
import { ReviewsList } from "./ReviewsList";
import "./RatingsPanel.css";

const EMPTY: RatingsSummary = { count: 0, average: null, ratings: [], weighted: null };

export function RatingsPanel({ slug }: { slug: string }) {
  const { status, view, setView, personalize, error, npub } = useTrustView();
  const [house, setHouse] = useState<RatingsSummary | null>(null);
  const [yours, setYours] = useState<RatingsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.ratings.list(slug)
      .then((r) => !cancelled && setHouse(r))
      .catch(() => !cancelled && setHouse(EMPTY));
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (view !== "yours" || !npub || yours) return;
    let cancelled = false;
    api.ratings.list(slug, npub)
      .then((r) => !cancelled && setYours(r))
      .catch(() => !cancelled && setYours(EMPTY));
    return () => { cancelled = true; };
  }, [view, npub, slug, yours]);

  const showYours = view === "yours" && status === "ready";
  const active = showYours ? yours : house;
  if (!active) {
    return <p className="route-status" role="status">Loading ratings…</p>;
  }

  const w = active.weighted ?? null;
  let average: number | null;
  let count: number;
  let reviews = active.ratings;
  let label: string;
  let countNoun = "ratings";
  let emptyNote: string | undefined;

  if (showYours) {
    average = w?.average ?? null;
    count = w?.trustedCount ?? 0;
    reviews = w?.ratings ?? [];
    label = "Your perspective · weighted by trust";
    countNoun = "trusted ratings";
    emptyNote = "No ratings from your trust network yet.";
  } else if (w) {
    average = w.average;
    count = w.trustedCount;
    reviews = w.ratings;
    label = "Unbnd house view · weighted by trust";
    countNoun = "trusted ratings";
  } else {
    average = active.average;
    count = active.count;
    reviews = active.ratings;
    label = "Unbnd house view";
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
      <RatingsBlock average={average} count={count} countNoun={countNoun} label={label} emptyNote={emptyNote} />
      <ReviewsList ratings={reviews} />
    </div>
  );
}
