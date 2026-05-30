import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { BookHeader } from "../components/BookHeader";
import { RatingsPanel } from "../components/RatingsPanel";
import { RatingControl } from "../components/RatingControl";
import { TagControl } from "../components/TagControl";
import { ShelfControl } from "../components/ShelfControl";
import { WhereToRead } from "../components/WhereToRead";
import { NotFound } from "./NotFound";
import {
  api,
  ApiError,
  type BookTags,
  type PublicBook,
} from "../lib/api";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | {
      status: "ready";
      book: PublicBook;
      tags: BookTags;
    };

const EMPTY_TAGS: BookTags = { genres: [], styles: [], signals: [] };

export function BookDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const { book } = await api.books.get(slug);
        // Tags are best-effort; ratings load inside RatingsPanel.
        const tags = await api.tags.book(slug).catch(() => EMPTY_TAGS);
        if (!cancelled) setState({ status: "ready", book, tags });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const reloadTags = () => {
    if (!slug) return;
    api.tags
      .book(slug)
      .then((tags) =>
        setState((prev) =>
          prev.status === "ready" ? { ...prev, tags } : prev,
        ),
      )
      .catch(() => {
        /* keep the current chips on a refresh failure */
      });
  };

  if (state.status === "not-found") return <NotFound />;

  if (state.status === "loading") {
    return (
      <div className="page">
        <Nav />
        <p className="route-status" role="status">
          Loading…
        </p>
        <Footer />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page">
        <Nav />
        <p className="route-status" role="alert">
          Could not load this book. Try again.
        </p>
        <Footer />
      </div>
    );
  }

  const { book, tags } = state;
  const primaryGenre = tags.genres[0];

  return (
    <div className="page">
      <Nav />
      <Breadcrumb
        trail={[
          { label: "Home", to: "/" },
          ...(primaryGenre
            ? [{ label: primaryGenre.name, to: `/genre/${primaryGenre.slug}` }]
            : []),
          { label: book.title },
        ]}
      />
      <BookHeader book={book} genres={tags.genres} styles={tags.styles} />
      {slug && <RatingsPanel slug={slug} />}
      {slug && <RatingControl bookSlug={slug} />}
      {slug && <TagControl bookSlug={slug} tags={tags} onChanged={reloadTags} />}
      {slug && <ShelfControl bookSlug={slug} />}
      {book.purchaseUrl && (
        <WhereToRead
          links={[
            {
              label: "Buy or borrow",
              source: "Outside link",
              href: book.purchaseUrl,
            },
          ]}
        />
      )}
      <Footer />
    </div>
  );
}
