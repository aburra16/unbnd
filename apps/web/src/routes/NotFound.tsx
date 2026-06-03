import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import "./NotFound.css";

export function NotFound() {
  return (
    <div className="page">
      <Nav />
      <section
        style={{
          padding: "80px 0 60px",
          textAlign: "center",
        }}
      >
        <h1
          className="not-found-heading"
          style={{
            marginBottom: 10,
          }}
        >
          That page is not on the shelf.
        </h1>
        <p
          className="not-found-body"
          style={{
            color: "var(--u-muted)",
            marginBottom: 22,
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
      <Footer />
    </div>
  );
}
