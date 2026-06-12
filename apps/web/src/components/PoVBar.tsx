// Perspective bar (ADR 0014). Reflects the signed-in user's trust state and
// hosts the Personalize trigger. Trust-weighting itself is applied to ratings
// on book pages; here we surface the state + the entry point.
import { useTrustView } from "../hooks/useTrustView";
import { Button } from "@unbnd/ui";
import "./PoVBar.css";
import { GuideLink } from "./GuideLink";

export function PoVBar() {
  const { status, view, setView, personalize, error } = useTrustView();

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
    const yours = view === "yours";
    return (
      <div className="pov pov-personalized">
        <span className={yours ? "pov-dot pov-dot-positive" : "pov-dot"} aria-hidden="true" />
        <span className="pov-lead">Showing</span>
        <span className="pov-strong">{yours ? "your perspective" : "Unbnd house view"}</span>
        <GuideLink to="/guide/ratings-you-can-trust#unbnd-house-view" label="The view switch" />
        {yours && <span className="pov-badge">personalized</span>}
        <div className="pov-right">
          <div className="pov-switcher" role="tablist" aria-label="Rating perspective">
            <Button
              variant="ghost"
              size="sm"
              selected={!yours}
              className="pov-sw"
              type="button"
              role="tab"
              aria-selected={!yours}
              onClick={() => setView("house")}
            >
              House
            </Button>
            <Button
              variant="ghost"
              size="sm"
              selected={yours}
              className="pov-sw"
              type="button"
              role="tab"
              aria-selected={yours}
              onClick={() => setView("yours")}
            >
              Yours
            </Button>
          </div>
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
          <Button
            variant="secondary"
            size="sm"
            className="pov-btn"
            type="button"
            onClick={personalize}
          >
            Personalize
          </Button>
        </div>
      </div>
    );
  }

  if (status === "gated") {
    // Custodial below the follow gate (ADR 0026): an honest prompt for what
    // unlocks personalization, no Personalize affordance.
    return (
      <div className="pov">
        <span className="pov-dot" aria-hidden="true" />
        <span>Showing</span>
        <span className="pov-strong">Unbnd house view</span>
        <div className="pov-right">
          <span className="pov-hint">
            Follow a few curators to personalize your view.
          </span>
        </div>
      </div>
    );
  }

  // house-only: signed-out, trust disabled, or still loading.
  return (
    <div className="pov">
      <span className="pov-dot" aria-hidden="true" />
      <span>Showing</span>
      <span className="pov-strong">Unbnd house view</span>
    </div>
  );
}
