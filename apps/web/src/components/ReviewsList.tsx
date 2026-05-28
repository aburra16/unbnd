import { TrustBadge } from "./Pill";
import type { Review } from "../data/book-fixtures";
import "./ReviewsList.css";

type Props = {
  reviews: Review[];
};

function stars(n: number) {
  const full = Math.round(n);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

export function ReviewsList({ reviews }: Props) {
  return (
    <section className="reviews">
      <header className="reviews-head">
        <h2 className="reviews-title">Reviews</h2>
        <span className="reviews-meta">
          Sorted by reviewer trust
        </span>
      </header>
      <ul className="reviews-list">
        {reviews.map((r) => (
          <li className="review" key={r.id}>
            <header className="review-head">
              <span
                className="review-avatar"
                style={{
                  background: r.reviewer.avatarBg,
                  color: r.reviewer.avatarInk,
                }}
                aria-hidden="true"
              >
                {r.reviewer.initials}
              </span>
              <div className="review-id">
                <div className="review-name">{r.reviewer.name}</div>
                <div className="review-sub">
                  <span className="review-stars" aria-hidden="true">
                    {stars(r.rating)}
                  </span>
                  <TrustBadge label={r.reviewer.trustTier} />
                  <span className="review-time">{r.postedLabel}</span>
                </div>
              </div>
            </header>
            <p className="review-text">{r.text}</p>
            <footer className="review-foot">
              <button className="review-action" type="button">
                Helpful · {r.helpfulCount}
              </button>
              <button className="review-action" type="button">
                Reply
              </button>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  );
}
