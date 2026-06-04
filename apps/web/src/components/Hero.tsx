import { Icon } from "@unbnd/ui";
import { SearchBox } from "./SearchBox";
import "./Hero.css";

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-mark">
        <Icon name="logo" size={48} opacityScheme="soft" />
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
        <SearchBox autoFocus />
      </div>
    </section>
  );
}
