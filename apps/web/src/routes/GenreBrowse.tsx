import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { BookGrid } from "../components/BookGrid";
import { api } from "../lib/api";
import { toCardBook } from "../lib/view-model";
import type { Book } from "../components/BookCard";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; name: string; books: Book[] };

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function GenreBrowse() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const [{ books: slugs }, taxonomy] = await Promise.all([
          api.tags.genreBooks(slug),
          api.tags.list().then((t) => t.tags).catch(() => []),
        ]);
        const name = taxonomy.find((t) => t.slug === slug)?.name ?? titleCase(slug);
        const books =
          slugs.length === 0
            ? []
            : (await api.books.list(slugs)).books.map(toCardBook);
        if (!cancelled) setState({ status: "ready", name, books });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="page">
      <Nav />
      <Breadcrumb
        trail={[
          { label: "Home", to: "/" },
          { label: state.status === "ready" ? state.name : titleCase(slug ?? "") },
        ]}
      />
      {state.status === "loading" && (
        <p className="route-status" role="status">
          Loading…
        </p>
      )}
      {state.status === "error" && (
        <p className="route-status" role="alert">
          Could not load this genre. Try again.
        </p>
      )}
      {state.status === "ready" && (
        <>
          <header className="genre-browse-head">
            <h1 className="genre-browse-title">{state.name}</h1>
            <p className="genre-browse-count">
              {state.books.length === 0
                ? "No books carry this genre yet."
                : `${state.books.length} ${state.books.length === 1 ? "book" : "books"}`}
            </p>
          </header>
          {state.books.length > 0 && <BookGrid books={state.books} />}
        </>
      )}
      <Footer />
    </div>
  );
}
