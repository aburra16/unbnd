import { LogoMark } from "./LogoMark";
import { SearchIcon } from "./SearchIcon";
import "./Hero.css";

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-mark">
        <LogoMark size={48} opacityScheme="soft" />
      </div>
      <h1 className="hero-title">
        Discover books through
        <br />
        people <em>you trust</em>
      </h1>
      <p className="hero-sub">
        Ratings and recommendations weighted by the readers whose taste you
        respect.
      </p>
      <div className="hero-search">
        <span className="hero-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          type="text"
          placeholder="Search by title, author, or ISBN"
          aria-label="Search the catalog"
        />
      </div>
    </section>
  );
}
