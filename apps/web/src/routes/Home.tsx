import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Hero } from "../components/Hero";
import { PoVBar } from "../components/PoVBar";
import { Shelf } from "../components/Shelf";
import { GenreGrid, type Genre } from "../components/GenreGrid";
import { CallToAction } from "../components/CallToAction";
import { api, type HomepageShelves } from "../lib/api";
import { genreColor, toCardBook } from "../lib/view-model";
import type { Book } from "../components/BookCard";

// The trust shelves, mapped to render-ready rows (Story 35 / ADR 0036 §5). Each
// is shown ONLY when its book list is non-empty — an empty trust shelf is
// absent, never filled with filler books (AC-5). No trust score / tier / badge
// is carried onto a card.
type TrustShelves = {
  trending: Book[];
  favorites: Book[];
  genres: { slug: string; name: string; books: Book[] }[];
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; recent: Book[]; genres: Genre[]; trust: TrustShelves };

const EMPTY_TRUST: TrustShelves = { trending: [], favorites: [], genres: [] };

function toTrustShelves(shelves: HomepageShelves): TrustShelves {
  return {
    trending: shelves.trending.books.map(toCardBook),
    favorites: shelves.favorites.books.map(toCardBook),
    genres: shelves.genres.map((g) => ({
      slug: g.slug,
      name: g.name,
      books: g.books.map(toCardBook),
    })),
  };
}

export function Home() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        // The trust shelves degrade to empty on any failure — the homepage still
        // renders the non-trust fallback (never a blank wall, never a throw).
        const [recentRes, taxonomy, trust] = await Promise.all([
          api.books.recent(18),
          api.tags.list().then((t) => t.tags).catch(() => []),
          api.homepage
            .shelves()
            .then(toTrustShelves)
            .catch(() => EMPTY_TRUST),
        ]);
        const genres: Genre[] = taxonomy
          .filter((t) => t.type === "genre")
          .map((t) => ({ slug: t.slug, name: t.name, color: genreColor(t.slug) }));
        if (!cancelled)
          setState({
            status: "ready",
            recent: recentRes.books.map(toCardBook),
            genres,
            trust,
          });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <Nav />
      <Hero />
      <PoVBar />
      {state.status === "loading" && (
        <p className="route-status" role="status">
          Loading the catalog…
        </p>
      )}
      {state.status === "error" && (
        <p className="route-status" role="alert">
          Could not load the catalog. Try again.
        </p>
      )}
      {state.status === "ready" && (
        <>
          {/* Trust shelves (ADR 0036 §5): each renders only when it has books;
              an empty trust shelf is absent, never filler. The labels carry no
              trust number/tier — the shelf only orders books. */}
          {state.trust.trending.length > 0 && (
            <Shelf title="Trending" books={state.trust.trending} />
          )}
          {state.trust.favorites.length > 0 && (
            <Shelf title="Community Favorites" books={state.trust.favorites} />
          )}
          {state.trust.genres
            .filter((g) => g.books.length > 0)
            .map((g) => (
              <Shelf key={g.slug} title={g.name} books={g.books} />
            ))}

          {/* The kept non-trust fallback, always present, labeled as recency /
              browse (NOT trust-ranked) so the homepage is never a blank wall. */}
          {state.recent.length > 0 && (
            <Shelf title="Recently added" books={state.recent} />
          )}
          {state.genres.length > 0 && (
            <GenreGrid title="Explore genres" genres={state.genres} />
          )}
        </>
      )}
      <CallToAction
        title="Your taste shapes your trust network"
        body="Rate the books you have read and follow the curators you respect. Your recommendations will start to match your shelf."
        ctaLabel="Get started"
        ctaHref="/auth"
      />
      <Footer />
    </div>
  );
}
