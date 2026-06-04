import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { SearchBox } from "../components/SearchBox";
import { BookGrid } from "../components/BookGrid";
import { Button, Container } from "@unbnd/ui";
import { api, type SearchHit } from "../lib/api";
import { coverGradient } from "../lib/view-model";
import type { Book } from "../components/BookCard";
import "./Search.css";

const PAGE = 24;

function toCard(h: SearchHit): Book {
  const g = coverGradient(h.slug);
  return {
    slug: h.slug,
    title: h.title,
    author: h.authorName,
    coverUrl: h.coverUrl,
    coverFrom: g.from,
    coverTo: g.to,
    coverInk: g.ink,
  };
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; hits: Book[]; total: number };

export function Search() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [state, setState] = useState<State>({ status: "idle" });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    api.search(q, { limit: PAGE, offset: 0 })
      .then((r) => {
        if (!cancelled) setState({ status: "ready", hits: r.hits.map(toCard), total: r.total });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function loadMore() {
    if (state.status !== "ready") return;
    setLoadingMore(true);
    try {
      const r = await api.search(q, { limit: PAGE, offset: state.hits.length });
      setState({ status: "ready", hits: [...state.hits, ...r.hits.map(toCard)], total: r.total });
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Container>
      <Nav />
      <div className="search-head">
        <SearchBox />
      </div>

      {state.status === "idle" && (
        <p className="route-status">Type at least two characters to search.</p>
      )}
      {state.status === "loading" && (
        <p className="route-status" role="status">Searching…</p>
      )}
      {state.status === "error" && (
        <p className="route-status" role="alert">Search is temporarily unavailable. Try again.</p>
      )}
      {state.status === "ready" && (
        <>
          <p className="search-count">
            {state.total === 0
              ? `No results for “${q}”.`
              : `${state.total.toLocaleString("en-US")} result${state.total === 1 ? "" : "s"} for “${q}”`}
          </p>
          {state.hits.length > 0 && <BookGrid books={state.hits} />}
          {state.hits.length < state.total && (
            <div className="search-more">
              <Button
                variant="secondary"
                size="md"
                className="search-more-btn"
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
      <Footer />
    </Container>
  );
}
