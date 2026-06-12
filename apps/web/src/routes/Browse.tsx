import { useEffect, useState } from "react";
import { Breadcrumb } from "../components/Breadcrumb";
import { GenreGrid, type Genre } from "../components/GenreGrid";
import { Shelf } from "../components/Shelf";
import { api } from "../lib/api";
import { genreColor, toCardBook } from "../lib/view-model";
import type { Book } from "../components/BookCard";
import { PageShell } from "../components/PageShell";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; genres: Genre[]; recent: Book[] };

export function Browse() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const [taxonomy, recentRes] = await Promise.all([
          api.tags.list().then((t) => t.tags).catch(() => []),
          api.books.recent(18),
        ]);
        const genres: Genre[] = taxonomy
          .filter((t) => t.type === "genre")
          .map((t) => ({ slug: t.slug, name: t.name, color: genreColor(t.slug) }));
        if (!cancelled)
          setState({ status: "ready", genres, recent: recentRes.books.map(toCardBook) });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell>
      <Breadcrumb trail={[{ label: "Home", to: "/" }, { label: "Browse" }]} />
      {state.status === "loading" && (
        <p className="route-status" role="status">
          Loading…
        </p>
      )}
      {state.status === "error" && (
        <p className="route-status" role="alert">
          Could not load the catalog. Try again.
        </p>
      )}
      {state.status === "ready" && (
        <>
          {state.genres.length > 0 && (
            <GenreGrid title="Browse by genre" genres={state.genres} />
          )}
          {state.recent.length > 0 && (
            <Shelf title="Recently added" books={state.recent} />
          )}
        </>
      )}
    </PageShell>
  );
}
