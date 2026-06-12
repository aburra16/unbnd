import { Link } from "react-router-dom";
import "./NotFound.css";
import { PageShell } from "../components/PageShell";

export function NotFound() {
  return (
    <PageShell>
      <section
        className="not-found-section"
        style={{
          textAlign: "center",
        }}
      >
        <h1 className="not-found-heading">That page is not on the shelf.</h1>
        <p
          className="not-found-body"
          style={{
            color: "var(--u-muted)",
          }}
        >
          The link may be old, or the book has not been added yet.
        </p>
        <Link
          to="/"
          className="not-found-link"
          style={{
            color: "var(--u-amber)",
          }}
        >
          Back to the homepage →
        </Link>
      </section>
    </PageShell>
  );
}
