import "./PoVBar.css";

type Props = {
  state?: "anonymous" | "building" | "personalized";
  followCount?: number;
  lastUpdatedLabel?: string;
};

export function PoVBar({
  state = "anonymous",
  followCount = 0,
  lastUpdatedLabel,
}: Props) {
  if (state === "personalized") {
    return (
      <div className="pov pov-personalized">
        <span className="pov-dot pov-dot-positive" aria-hidden="true" />
        <span>Showing</span>
        <span className="pov-strong">your perspective</span>
        <span className="pov-badge">personalized</span>
        <div className="pov-right">
          <div className="pov-switcher" role="tablist">
            <button className="pov-sw" type="button" role="tab">
              House
            </button>
            <button
              className="pov-sw pov-sw-active"
              type="button"
              role="tab"
              aria-selected="true"
            >
              Yours
            </button>
          </div>
        </div>
        {lastUpdatedLabel && (
          <span className="pov-hint">{lastUpdatedLabel}</span>
        )}
      </div>
    );
  }

  if (state === "building") {
    const pct = Math.min(100, Math.round((followCount / 10) * 100));
    return (
      <div className="pov">
        <span className="pov-dot" aria-hidden="true" />
        <span>Showing</span>
        <span className="pov-strong">Unbnd house view</span>
        <div className="pov-right">
          <div
            className="pov-progress"
            role="progressbar"
            aria-valuenow={followCount}
            aria-valuemin={0}
            aria-valuemax={10}
          >
            <span className="pov-progress-label">{followCount}/10</span>
            <span className="pov-progress-track">
              <span
                className="pov-progress-fill"
                style={{ width: `${pct}%` }}
              />
            </span>
          </div>
          <button className="pov-btn" type="button" disabled>
            Personalize
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pov">
      <span className="pov-dot" aria-hidden="true" />
      <span>Showing</span>
      <span className="pov-strong">Unbnd house view</span>
      <div className="pov-right">
        <button className="pov-btn" type="button">
          Personalize
        </button>
      </div>
    </div>
  );
}
