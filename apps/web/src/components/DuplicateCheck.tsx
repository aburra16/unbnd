import { useState } from "react";
import { Link } from "react-router-dom";
import "./DuplicateCheck.css";

type MatchResult = {
  slug: string;
  title: string;
  author: string;
} | null;

const fixtureMatches: Record<string, NonNullable<MatchResult>> = {
  orbital: {
    slug: "orbital",
    title: "Orbital",
    author: "Samantha Harvey",
  },
};

export function DuplicateCheck() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MatchResult | "none" | null>(null);

  function runCheck() {
    const key = query.trim().toLowerCase();
    if (!key) {
      setResult(null);
      return;
    }
    const hit = Object.entries(fixtureMatches).find(
      ([slug, m]) =>
        slug.includes(key) ||
        m.title.toLowerCase().includes(key) ||
        m.author.toLowerCase().includes(key),
    );
    setResult(hit ? hit[1] : "none");
  }

  return (
    <section className="dc">
      <h2 className="dc-title">Check if the book is already on Unbnd</h2>
      <p className="dc-sub">
        Search by title, author, or ISBN before submitting. Most books are
        already catalogued from Open Library.
      </p>
      <div className="dc-row">
        <input
          className="dc-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runCheck();
            }
          }}
          placeholder="Try 'Orbital' or '9780802161543'"
          aria-label="Duplicate check"
        />
        <button type="button" className="dc-btn" onClick={runCheck}>
          Check
        </button>
      </div>
      {result && result !== "none" && (
        <div className="dc-result dc-result-hit">
          <p>
            Found a match: <strong>{result.title}</strong> by {result.author}.
          </p>
          <div className="dc-actions">
            <Link to={`/book/${result.slug}`} className="dc-link">
              View the existing entry →
            </Link>
            <span className="dc-sep">·</span>
            <Link to={`/book/${result.slug}#claim`} className="dc-link">
              Claim it as the author
            </Link>
          </div>
        </div>
      )}
      {result === "none" && (
        <div className="dc-result dc-result-empty">
          <p>
            Nothing matched. Carry on with the submission below to add this
            book to Unbnd.
          </p>
        </div>
      )}
    </section>
  );
}
