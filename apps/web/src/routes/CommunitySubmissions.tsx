// Public, read-only list of community submissions (ADR 0016 / 16b-i). Separate
// from the canonical catalog — these are reader-submitted and not yet promoted.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { api, type SubmittedBook } from "../lib/api";
import "./CommunitySubmissions.css";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; submissions: SubmittedBook[] };

function shortNpub(npub?: string): string {
  if (!npub) return "";
  return npub.length <= 16 ? npub : `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

export function CommunitySubmissions() {
  const [state, setState] = useState<State>({ status: "loading" });

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

  return (
    <div className="page">
      <Nav />
      <Breadcrumb trail={[{ label: "Home", to: "/" }, { label: "Community submissions" }]} />
      <header className="cs-head">
        <h1 className="cs-title">Community submissions</h1>
        <p className="cs-sub">
          Books readers have added. These are not yet in the main catalog — they
          surface here while the community vouches for them.
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
              </li>
            ))}
          </ul>
        )
      )}
      <Footer />
    </div>
  );
}
