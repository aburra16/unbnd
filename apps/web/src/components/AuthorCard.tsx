import { Link } from "react-router-dom";
import { SignalPill } from "./Pill";
import type { AuthorInfo } from "../data/book-fixtures";
import "./AuthorCard.css";

type Props = {
  author: AuthorInfo;
};

export function AuthorCard({ author }: Props) {
  return (
    <section className="auth-card">
      <div className="auth-row">
        <span className="auth-avatar" aria-hidden="true">
          {author.initials}
        </span>
        <div className="auth-body">
          <div className="auth-name-row">
            <h3 className="auth-name">{author.name}</h3>
            {author.verified && (
              <SignalPill label="Author verified" tone="positive" />
            )}
          </div>
          <p className="auth-bio">{author.bio}</p>
        </div>
      </div>
      {author.moreBy && author.moreBy.length > 0 && (
        <div className="auth-more">
          <h4 className="auth-more-title">More by {author.name}</h4>
          <div className="auth-more-row">
            {author.moreBy.map((b) => (
              <Link
                key={b.slug}
                className="auth-more-item"
                to={`/book/${b.slug}`}
              >
                <span
                  className="auth-more-cover"
                  style={{
                    background: `linear-gradient(155deg, ${b.coverFrom}, ${b.coverTo})`,
                  }}
                >
                  <span
                    className="auth-more-cover-title"
                    style={{ color: b.coverInk }}
                  >
                    {b.title}
                  </span>
                </span>
                <span className="auth-more-title-text">{b.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
