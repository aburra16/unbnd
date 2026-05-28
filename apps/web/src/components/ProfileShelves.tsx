import { Link } from "react-router-dom";
import type { ProfileShelfFixture } from "../data/profile-fixtures";
import "./ProfileShelves.css";

type Props = {
  shelves: ProfileShelfFixture[];
};

export function ProfileShelves({ shelves }: Props) {
  return (
    <section className="psh">
      <h2 className="psh-title">Shelves</h2>
      <div className="psh-list">
        {shelves.map((shelf) => {
          const overflow = Math.max(0, shelf.count - shelf.covers.length);
          return (
            <article key={shelf.slug} className="psh-shelf">
              <header className="psh-head">
                <h3 className="psh-name">{shelf.name}</h3>
                <span className="psh-count">{shelf.count} books</span>
              </header>
              <div className="psh-covers">
                {shelf.covers.map((c) => (
                  <Link
                    key={c.slug}
                    to={`/book/${c.slug}`}
                    className="psh-cover"
                    style={{
                      background: `linear-gradient(155deg, ${c.coverFrom}, ${c.coverTo})`,
                    }}
                    title={c.title}
                    aria-label={c.title}
                  >
                    <span
                      className="psh-cover-title"
                      style={{ color: c.coverInk }}
                    >
                      {c.title}
                    </span>
                  </Link>
                ))}
                {overflow > 0 && (
                  <div className="psh-overflow">
                    +{overflow}
                    <span>more</span>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
