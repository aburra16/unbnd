import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Hero } from "../components/Hero";
import { PoVBar } from "../components/PoVBar";
import { Shelf } from "../components/Shelf";
import { GenreGrid, type Genre } from "../components/GenreGrid";
import { CallToAction } from "../components/CallToAction";
import { api } from "../lib/api";
import { genreColor, toCardBook } from "../lib/view-model";
import type { Book } from "../components/BookCard";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; recent: Book[]; genres: Genre[] };

export function Home() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const [recentRes, taxonomy] = await Promise.all([
          api.books.recent(18),
          api.tags.list().then((t) => t.tags).catch(() => []),
        ]);
        const genres: Genre[] = taxonomy
          .filter((t) => t.type === "genre")
          .map((t) => ({ slug: t.slug, name: t.name, color: genreColor(t.slug) }));
        if (!cancelled)
          setState({
            status: "ready",
            recent: recentRes.books.map(toCardBook),
            genres,
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
      <PoVBar state="anonymous" />
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
