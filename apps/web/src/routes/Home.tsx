import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Hero } from "../components/Hero";
import { PoVBar } from "../components/PoVBar";
import { Shelf } from "../components/Shelf";
import { GenreGrid } from "../components/GenreGrid";
import { CallToAction } from "../components/CallToAction";
import {
  trendingBooks,
  communityFavorites,
  genres,
} from "../data/homepage-fixtures";

export function Home() {
  return (
    <div className="page">
      <Nav />
      <Hero />
      <PoVBar state="anonymous" />
      <Shelf
        title="Trending this week"
        books={trendingBooks}
        seeAllHref="/trending"
      />
      <GenreGrid
        title="Explore genres"
        genres={genres}
        seeAllHref="/genres"
      />
      <Shelf
        title="Community favorites"
        books={communityFavorites}
        seeAllHref="/favorites"
      />
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
