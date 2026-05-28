import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";

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
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.6px",
            marginBottom: 10,
          }}
        >
          That page is not on the shelf.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--u-muted)",
            marginBottom: 22,
          }}
        >
          The link may be old, or the book has not been added yet.
        </p>
        <Link
          to="/"
          style={{
            fontSize: 13,
            fontWeight: 500,
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
