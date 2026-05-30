// Perspective bar (ADR 0014). Reflects the signed-in user's trust state and
// hosts the Personalize trigger. Trust-weighting itself is applied to ratings
// on book pages; here we surface the state + the entry point.
import { useTrustView } from "../hooks/useTrustView";
import "./PoVBar.css";

export function PoVBar() {
  const { status, personalize, error } = useTrustView();

  if (status === "building") {
    return (
      <div className="pov">
        <span className="pov-dot" aria-hidden="true" />
        <span>Building your</span>
        <span className="pov-strong">web of trust</span>
        <div className="pov-right">
          <span className="pov-hint">
            This takes a few minutes. Trust-weighted ratings turn on across the
            site when it is ready.
          </span>
        </div>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="pov pov-personalized">
        <span className="pov-dot pov-dot-positive" aria-hidden="true" />
        <span>Showing</span>
        <span className="pov-strong">your perspective</span>
        <span className="pov-badge">personalized</span>
        <div className="pov-right">
          <span className="pov-hint">
            Ratings are weighted by your web of trust. Toggle House / Yours on
            any book.
          </span>
        </div>
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="pov">
        <span className="pov-dot" aria-hidden="true" />
        <span>Showing</span>
        <span className="pov-strong">Unbnd house view</span>
        <div className="pov-right">
          {error && <span className="pov-hint pov-error">{error}</span>}
          <button className="pov-btn" type="button" onClick={personalize}>
            Personalize
          </button>
        </div>
      </div>
    );
  }

  // house-only: signed-out, custodial, trust disabled, or still loading.
  return (
    <div className="pov">
      <span className="pov-dot" aria-hidden="true" />
      <span>Showing</span>
      <span className="pov-strong">Unbnd house view</span>
    </div>
  );
}
