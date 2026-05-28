import "./TrustCard.css";

type Props = {
  tier: string;
  percentile: number;
  description?: string;
};

export function TrustCard({ tier, percentile, description }: Props) {
  const pct = Math.max(0, Math.min(100, percentile));
  return (
    <section className="tc">
      <div className="tc-ring" aria-hidden="true">
        <span className="tc-ring-num">{pct}</span>
        <span className="tc-ring-mark">%</span>
      </div>
      <div className="tc-body">
        <div className="tc-tier">{tier}</div>
        <p className="tc-desc">
          {description ??
            "Trust scores reflect how the rest of the network weights this curator's ratings, tags, and reviews."}
        </p>
        <div
          className="tc-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="tc-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}
