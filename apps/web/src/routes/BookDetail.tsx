import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Container } from "@unbnd/ui";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { BookHeader } from "../components/BookHeader";
import { RatingsPanel } from "../components/RatingsPanel";
import { RatingControl } from "../components/RatingControl";
import { TagControl } from "../components/TagControl";
import { DemoteControl } from "../components/DemoteControl";
import { ShelfControl } from "../components/ShelfControl";
import { ClaimControl } from "../components/ClaimControl";
import { AuthorEdit } from "../components/AuthorEdit";
import { WhereToRead } from "../components/WhereToRead";
import { useTrustView } from "../hooks/useTrustView";
import { useBookRatings } from "../hooks/useBookRatings";
import { useSession } from "../hooks/useSession";
import { NotFound } from "./NotFound";
import {
  api,
  ApiError,
  type AuthorProvidedField,
  type BookClaimant,
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
      claimants: BookClaimant[];
      authorProvided: AuthorProvidedField[];
    };

const EMPTY_TAGS: BookTags = { genres: [], styles: [], signals: [], weighted: false };

export function BookDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { view, status: trustStatus, npub } = useTrustView();
  // The tag consensus follows the same observer as the ratings panel (ADR 0025):
  // the user's own npub on the "Yours" vantage, else the server-side house default.
  const observer = view === "yours" && trustStatus === "ready" ? npub : undefined;
  // Story 28 / ADR 0029 §3: one owner of the book's rating data; the panel and
  // the control consume slices of it instead of each self-fetching.
  const ratings = useBookRatings(slug ?? "");
  const session = useSession();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const { book, claimants, authorProvided } = await api.books.get(slug);
        // Tags are best-effort; ratings load inside RatingsPanel.
        const tags = await api.tags.book(slug, observer).catch(() => EMPTY_TAGS);
        if (!cancelled)
          setState({
            status: "ready",
            book,
            tags,
            claimants: claimants ?? [],
            authorProvided: authorProvided ?? [],
          });
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
  }, [slug, observer]);

  const reloadTags = () => {
    if (!slug) return;
    api.tags
      .book(slug, observer)
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
      <Container>
        <Nav />
        <p className="route-status" role="status">
          Loading…
        </p>
        <Footer />
      </Container>
    );
  }

  if (state.status === "error") {
    return (
      <Container>
        <Nav />
        <p className="route-status" role="alert">
          Could not load this book. Try again.
        </p>
        <Footer />
      </Container>
    );
  }

  const { book, tags, claimants, authorProvided } = state;
  const primaryGenre = tags.genres[0];

  const onClaimed = (next: BookClaimant[]) =>
    setState((prev) =>
      prev.status === "ready" ? { ...prev, claimants: next } : prev,
    );

  const onSaved = (next: PublicBook) =>
    setState((prev) =>
      prev.status === "ready" ? { ...prev, book: next } : prev,
    );

  // The verified-author edit surface is revealed ONLY when the session user is the
  // Verified author of THIS book — their npub is a claimant marked verified:true.
  const sessionNpub =
    session.status === "signed-in" ? session.user.npub : undefined;
  const isVerifiedAuthor =
    sessionNpub != null &&
    claimants.some((c) => c.verified && c.npub === sessionNpub);
  // Sovereign users (no email) sign in the browser; custodial users (email) have
  // the server sign with their session-wrapped key (ADR 0006).
  const isSovereign =
    session.status === "signed-in" && session.user.email === null;

  return (
    <Container>
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
      <BookHeader
        book={book}
        genres={tags.genres}
        styles={tags.styles}
        weighted={tags.weighted}
        claimants={claimants}
        authorProvided={authorProvided}
      />
      {slug && isVerifiedAuthor && (
        <AuthorEdit
          bookSlug={slug}
          book={book}
          isSovereign={isSovereign}
          onSaved={onSaved}
        />
      )}
      {slug && <ClaimControl bookSlug={slug} onClaimed={onClaimed} />}
      {slug && (
        <RatingsPanel
          slug={slug}
          house={ratings.house}
          yours={ratings.yours}
          status={ratings.status}
          tasteMatches={ratings.tasteMatches ?? undefined}
          sortBy={ratings.sortBy}
          onSortChange={ratings.setSortBy}
        />
      )}
      {slug && (
        <RatingControl
          bookSlug={slug}
          yourRating={ratings.yourRating}
          applyWrite={ratings.applyWrite}
        />
      )}
      {slug && <TagControl bookSlug={slug} tags={tags} onChanged={reloadTags} />}
      {slug && <ShelfControl bookSlug={slug} />}
      {slug && (
        <DemoteControl
          bookSlug={slug}
          source={book.source}
          canCurate={tags.canAssertAccusatory === true}
        />
      )}
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
    </Container>
  );
}
