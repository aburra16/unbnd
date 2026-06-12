// Public list of community submissions (ADR 0016 / 16b-i) + the curator-gated
// Promote affordance, promotion state, and trust signals (Story 30 / ADR 0031).
// The gate is server-enforced; the UI only offers Promote when the gate-aware
// list marks a row `canPromote`. Signals are honest decision support — real
// counts/identities + the trust-weighted average, or "no trusted signal yet".
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { useSession } from "../hooks/useSession";
import { Button, Container } from "@unbnd/ui";
import { api, type SubmittedBook } from "../lib/api";
import "./CommunitySubmissions.css";
import { GuideLink } from "../components/GuideLink";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; submissions: SubmittedBook[] };

function shortNpub(npub?: string): string {
  if (!npub) return "";
  return npub.length <= 16 ? npub : `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

function Signals({ signals }: { signals: SubmittedBook["signals"] }) {
  if (!signals) {
    return <span className="cs-item-signal cs-item-signal-empty">No trusted signal yet</span>;
  }
  const avg =
    signals.trustedAverage === null ? null : signals.trustedAverage.toFixed(1);
  return (
    <span className="cs-item-signal">
      {signals.curatorRatingCount} curator
      {signals.curatorRatingCount === 1 ? "" : "s"}
      {avg !== null ? ` · ${avg} weighted` : ""}
    </span>
  );
}

function PromoteCell({
  submission,
  onPromoted,
}: {
  submission: SubmittedBook;
  onPromoted: (slug: string) => void;
}) {
  const [pending, setPending] = useState(false);

  if (submission.promotionStatus === "done") {
    return <span className="cs-item-state">In catalog</span>;
  }
  if (submission.promotionStatus === "pending" || submission.promotionStatus === "promoting") {
    return <span className="cs-item-state">Promotion queued</span>;
  }
  // Story 82 (Review #80 carry-forward): an in-flight removal is not
  // re-promotable yet; a `demoted` row falls through to the Promote button.
  if (
    submission.promotionStatus === "demote_pending" ||
    submission.promotionStatus === "demoting"
  ) {
    return (
      <span className="cs-item-state">
        Removal queued
        <GuideLink
          to="/guide/for-curators#removing-a-book-from-the-catalog"
          label="Removal"
        />
      </span>
    );
  }
  if (!submission.canPromote) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      className="cs-promote"
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api.submissions.promote(submission.slug);
          onPromoted(submission.slug);
        } catch {
          setPending(false);
        }
      }}
    >
      Promote
    </Button>
  );
}

export function CommunitySubmissions() {
  const [state, setState] = useState<State>({ status: "loading" });
  // The gate render reacts to the session; the server still enforces.
  useSession();

  useEffect(() => {
    let cancelled = false;
    api.submissions
      .list()
      .then((r) => !cancelled && setState({ status: "ready", submissions: r.submissions }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const markQueued = (slug: string) => {
    setState((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            submissions: prev.submissions.map((s) =>
              s.slug === slug ? { ...s, promotionStatus: "pending" } : s,
            ),
          }
        : prev,
    );
  };

  return (
    <Container>
      <Nav />
      <Breadcrumb trail={[{ label: "Home", to: "/" }, { label: "Community submissions" }]} />
      <header className="cs-head">
        <h1 className="cs-title">Community submissions</h1>
        <p className="cs-sub">
          Books readers have added. They wait here for a curator to vouch for
          them before joining the catalog.
        </p>
      </header>

      {state.status === "loading" && <p className="route-status" role="status">Loading…</p>}
      {state.status === "error" && (
        <p className="route-status" role="alert">Could not load submissions. Try again.</p>
      )}
      {state.status === "ready" && (
        state.submissions.length === 0 ? (
          <p className="route-status">No community submissions yet.</p>
        ) : (
          <ul className="cs-list">
            {state.submissions.map((s) => (
              <li className="cs-item" key={s.slug}>
                <span className="cs-item-title">{s.title}</span>
                <span className="cs-item-meta">
                  {s.authorName}
                  {s.publishYear ? ` · ${s.publishYear}` : ""}
                  {s.submitter ? (
                    <>
                      {" · "}
                      <Link className="cs-item-submitter" to={`/profile/${s.submitter}`}>
                        added by {shortNpub(s.submitter)}
                      </Link>
                    </>
                  ) : null}
                </span>
                <span className="cs-item-row">
                  <Signals signals={s.signals} />
                  <PromoteCell submission={s} onPromoted={markQueued} />
                </span>
              </li>
            ))}
          </ul>
        )
      )}
      <Footer />
    </Container>
  );
}
