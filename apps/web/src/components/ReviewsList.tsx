import type { PublicRating } from "../lib/api";
import { shortNpub } from "../lib/view-model";
import "./ReviewsList.css";

type Props = {
  // The full ratings list; only those with review text are shown.
  ratings: PublicRating[];
};

function stars(n: number) {
  const full = Math.round(n);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

export function ReviewsList({ ratings }: Props) {
  const reviews = ratings.filter(
    (r) => typeof r.reviewText === "string" && r.reviewText.trim() !== "",
  );
  if (reviews.length === 0) return null;
  return (
    <section className="reviews">
      <header className="reviews-head">
        <h2 className="reviews-title">Reviews</h2>
        <span className="reviews-meta">{reviews.length} with notes</span>
      </header>
      <ul className="reviews-list">
        {reviews.map((r) => (
          <li className="review" key={`${r.npub}:${r.reviewDate}`}>
            <header className="review-head">
              <div className="review-id">
                <div className="review-name">{shortNpub(r.npub)}</div>
                <div className="review-sub">
                  <span className="review-stars" aria-hidden="true">
                    {stars(r.score)}
                  </span>
                  <span className="review-time">{r.reviewDate}</span>
                </div>
              </div>
            </header>
            <p className="review-text">{r.reviewText}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
