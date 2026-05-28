import { useState } from "react";
import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumb } from "../components/Breadcrumb";
import { GenreHeader } from "../components/GenreHeader";
import { SubgenrePills } from "../components/SubgenrePills";
import { GenreControls } from "../components/GenreControls";
import { BookGrid } from "../components/BookGrid";
import { Pagination } from "../components/Pagination";
import { NotFound } from "./NotFound";
import { getGenreRecord } from "../data/genre-fixtures";

export function GenreBrowse() {
  const { slug } = useParams<{ slug: string }>();
  const genre = slug ? getGenreRecord(slug) : undefined;
  const [page, setPage] = useState(1);

  if (!genre) return <NotFound />;

  // Pagination here is cosmetic for the fixture set. Real pagination
  // will window the result of a Meilisearch query against the genre.
  const totalPages = Math.max(1, Math.ceil(genre.bookCount / 24));

  return (
    <div className="page">
      <Nav />
      <Breadcrumb
        trail={[
          { label: "Home", to: "/" },
          { label: "Browse", to: "/browse" },
          { label: genre.name },
        ]}
      />
      <GenreHeader genre={genre} />
      <SubgenrePills subgenres={genre.subgenres} />
      <GenreControls
        topCurators={genre.topCurators}
        totalCurators={genre.topCurators.length + 22}
      />
      <BookGrid books={genre.books} />
      <Pagination
        current={page}
        totalPages={totalPages}
        onChange={setPage}
      />
      <Footer />
    </div>
  );
}
