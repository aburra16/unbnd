import "./RatingsBlock.css";

type Props = {
  average: number | null;
  count: number;
  /** e.g. "ratings" or "trusted ratings" (weighted view). */
  countNoun?: string;
  /** Small label above the aggregate, e.g. the active perspective. */
  label?: string;
  /** Shown when there are no ratings in this view. */
  emptyNote?: string;
};

function stars(n: number) {
  const full = Math.round(n);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

export function RatingsBlock({ average, count, countNoun = "ratings", label, emptyNote }: Props) {
  if (count === 0 || average === null) {
    return (
      <section className="ratings ratings-empty">
        {label && <p className="ratings-label">{label}</p>}
        <p className="ratings-none">{emptyNote ?? "No ratings yet. Be the first to rate it."}</p>
      </section>
    );
  }
  const noun = count === 1 ? countNoun.replace(/s$/, "") : countNoun;
  return (
    <section className="ratings">
      {label && <p className="ratings-label">{label}</p>}
      <div className="ratings-aggregate">
        <div className="ratings-num">{average.toFixed(1)}</div>
        <div className="ratings-stars" aria-hidden="true">
          {stars(average)}
        </div>
        <div className="ratings-count">
          {count.toLocaleString("en-US")} {noun}
        </div>
      </div>
    </section>
  );
}
