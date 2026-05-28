// Book-detail rating control. ADR 0005. Sovereign session: 1-5 stars +
// optional review -> template -> NIP-07 signEvent -> submit. Anonymous: a
// sign-in prompt. Custodial: a "coming for email accounts" note (5b).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  ApiError,
  type RatingsSummary,
  type SignedEvent,
} from "../lib/api";
import { useSession } from "../hooks/useSession";
import "./RatingControl.css";

type Nip07 = {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9 6.2 20.9l1.1-6.47-4.7-4.58 6.5-.95z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RatingControl({ bookSlug }: { bookSlug: string }) {
  const session = useSession();
  const [summary, setSummary] = useState<RatingsSummary | null>(null);
  const [score, setScore] = useState(0);
  const [review, setReview] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.ratings
      .list(bookSlug)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bookSlug]);

  async function onSubmit() {
    const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
    if (!nostr || score < 1) return;
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const { template } = await api.ratings.template({
        bookSlug,
        score,
        reviewText: review.trim() === "" ? undefined : review.trim(),
        reviewDate: todayIso(),
      });
      const signed = await nostr.signEvent(template);
      const { summary: next } = await api.ratings.submit(signed);
      setSummary(next);
      setStatus("done");
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Could not save your rating. Try again.",
      );
      setStatus("error");
    }
  }

  const average =
    summary && summary.average !== null ? summary.average.toFixed(1) : null;

  return (
    <section className="rate" aria-label="Rate this book">
      {summary && (
        <p className="rate-summary">
          {summary.count === 0
            ? "No ratings yet."
            : `${average} average across ${summary.count} ${
                summary.count === 1 ? "rating" : "ratings"
              }.`}
        </p>
      )}

      {session.status === "signed-out" && (
        <p className="rate-gate">
          <Link to="/auth">Sign in</Link> to rate this book.
        </p>
      )}

      {session.status === "signed-in" && session.user.email !== null && (
        <p className="rate-gate">
          Ratings from email accounts are coming soon.
        </p>
      )}

      {session.status === "signed-in" && session.user.email === null && (
        <div className="rate-form">
          <div className="rate-stars" role="group" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="rate-star"
                aria-label={`Rate ${n} of 5`}
                aria-pressed={score === n}
                onClick={() => setScore(n)}
              >
                <Star filled={n <= score} />
              </button>
            ))}
          </div>
          <textarea
            className="rate-review"
            placeholder="Add a short review (optional)"
            value={review}
            maxLength={2000}
            onChange={(e) => setReview(e.target.value)}
          />
          {status === "error" && errorMsg && (
            <p className="rate-error" role="alert">
              {errorMsg}
            </p>
          )}
          {status === "done" && (
            <p className="rate-ok" role="status">
              Your rating is saved.
            </p>
          )}
          <button
            type="button"
            className="rate-submit"
            disabled={score < 1 || status === "submitting"}
            onClick={onSubmit}
          >
            {status === "submitting" ? "Saving…" : "Submit rating"}
          </button>
        </div>
      )}
    </section>
  );
}
