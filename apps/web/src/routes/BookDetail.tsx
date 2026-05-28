import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { BookHeader } from "../components/BookHeader";
import { ActionBar } from "../components/ActionBar";
import { RatingsBlock } from "../components/RatingsBlock";
import { RatingControl } from "../components/RatingControl";
import { ReviewsList } from "../components/ReviewsList";
import { WhereToRead } from "../components/WhereToRead";
import { AuthorCard } from "../components/AuthorCard";
import { NotFound } from "./NotFound";
import { getBookRecord } from "../data/book-fixtures";

export function BookDetail() {
  const { slug } = useParams<{ slug: string }>();
  const book = slug ? getBookRecord(slug) : undefined;

  if (!book) return <NotFound />;

  return (
    <div className="page">
      <Nav />
      <Breadcrumb
        trail={[
          { label: "Home", to: "/" },
          { label: book.primaryGenreLabel, to: `/genre/${book.primaryGenreSlug}` },
          { label: book.title },
        ]}
      />
      <BookHeader book={book} />
      <ActionBar />
      <RatingsBlock book={book} />
      {slug && <RatingControl bookSlug={slug} />}
      <ReviewsList reviews={book.reviews} />
      <WhereToRead links={book.whereToRead} />
      <AuthorCard author={book.authorInfo} />
      <Footer />
    </div>
  );
}
