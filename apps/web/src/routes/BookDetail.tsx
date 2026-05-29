import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { BookHeader } from "../components/BookHeader";
import { RatingsBlock } from "../components/RatingsBlock";
import { RatingControl } from "../components/RatingControl";
import { ReviewsList } from "../components/ReviewsList";
import { WhereToRead } from "../components/WhereToRead";
import { NotFound } from "./NotFound";
import {
  api,
  ApiError,
  type BookTags,
  type PublicBook,
  type RatingsSummary,
} from "../lib/api";

type State =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | {
      status: "ready";
      book: PublicBook;
      tags: BookTags;
      ratings: RatingsSummary;
    };

const EMPTY_TAGS: BookTags = { genres: [], styles: [], signals: [] };
const EMPTY_RATINGS: RatingsSummary = { count: 0, average: null, ratings: [] };

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
        // Tags and ratings are best-effort; a book still renders without them.
        const [tags, ratings] = await Promise.all([
          api.tags.book(slug).catch(() => EMPTY_TAGS),
          api.ratings.list(slug).catch(() => EMPTY_RATINGS),
        ]);
        if (!cancelled) setState({ status: "ready", book, tags, ratings });
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

  const { book, tags, ratings } = state;
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
      <RatingsBlock summary={ratings} />
      {slug && <RatingControl bookSlug={slug} />}
      <ReviewsList ratings={ratings.ratings} />
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
