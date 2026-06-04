import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Hero } from "../components/Hero";
import { PoVBar } from "../components/PoVBar";
import { Shelf } from "../components/Shelf";
import "../components/Shelf.css";
import { GenreGrid, type Genre } from "../components/GenreGrid";
import { CallToAction } from "../components/CallToAction";
import { api, type ForYou, type HomepageShelves } from "../lib/api";
import { genreColor, toCardBook } from "../lib/view-model";
import { useTrustView } from "../hooks/useTrustView";
import { Button, Container } from "@unbnd/ui";
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

// The For-You shelf as render-ready state (Story 36 / ADR 0037 §5). `state`
// drives whether the homepage shows the shelf, the personalize invitation, or
// nothing — never a fabricated "For you" of arbitrary books.
type ForYouState = { state: ForYou["state"]; books: Book[] };

type State =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      recent: Book[];
      genres: Genre[];
      trust: TrustShelves;
      foryou: ForYouState;
    };

const EMPTY_TRUST: TrustShelves = { trending: [], favorites: [], genres: [] };
// Degrade target: a failed For-You fetch renders nothing (never blanks the page).
const EMPTY_FORYOU: ForYouState = { state: "anonymous", books: [] };

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
  // The shipped personalize trigger (PoVBar / RatingsPanel). The For-You
  // invitation reuses it rather than introducing a new route (ADR 0037 §5).
  const { personalize } = useTrustView();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        // The trust shelves + For-You both degrade on any failure — the homepage
        // still renders the non-trust fallback (never a blank wall, never a throw).
        const [recentRes, taxonomy, trust, foryou] = await Promise.all([
          api.books.recent(18),
          api.tags.list().then((t) => t.tags).catch(() => []),
          api.homepage
            .shelves()
            .then(toTrustShelves)
            .catch(() => EMPTY_TRUST),
          api
            .foryou()
            .then((f): ForYouState => ({ state: f.state, books: f.books.map(toCardBook) }))
            .catch(() => EMPTY_FORYOU),
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
            foryou,
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
    <Container>
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
          {/* For-You (ADR 0037 §5): the TOP trust surface for a personalized
              user, above the house shelves. Personalized + books → the shelf;
              not_personalized → an honest invitation reusing the shipped
              Personalize trigger; anonymous / personalized-empty → nothing. */}
          {state.foryou.state === "personalized" && state.foryou.books.length > 0 && (
            <Shelf title="For you" books={state.foryou.books} />
          )}
          {state.foryou.state === "not_personalized" && (
            <section className="shelf-section foryou-invite">
              <h2 className="shelf-title">For you</h2>
              <p className="foryou-invite-body">
                Build your web of trust and this shelf fills with books the
                curators you follow rate highly.
              </p>
              <Button
                variant="primary"
                size="md"
                className="foryou-invite-btn"
                type="button"
                onClick={personalize}
              >
                Personalize your view
              </Button>
            </section>
          )}

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
    </Container>
  );
}
