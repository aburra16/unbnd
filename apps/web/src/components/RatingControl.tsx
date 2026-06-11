// Book-detail rating control. ADR 0005 + Story 28 / ADR 0029. CONTROLLED: the
// shared `useBookRatings` hook (owned by BookDetail) passes `yourRating` (the
// trust-view-independent own read) and `applyWrite` (the optimistic + reconcile
// entry point). When the user has rated, this is the prefilled in-place editor:
// stars filled to their score, their review, a quiet "You rated this on <date>"
// line, and an "Update rating" button. Sovereign: template -> NIP-07 signEvent
// -> submit. Custodial: server-side submit (ADR 0006). Anonymous: a sign-in
// prompt. Editing republishes under the existing addressable d-tag (replace) via
// the EXISTING per-tier write path — no new write path, no new crypto.
import { useState } from "react";
import { AccountPrompt } from "./AccountPrompt";
import {
  api,
  ApiError,
  type PublicRating,
  type RatingsSummary,
  type SignedEvent,
} from "../lib/api";
import { useSession } from "../hooks/useSession";
import { Button, Icon, IconButton } from "@unbnd/ui";
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Format an ISO YYYY-MM-DD date for display without going through `new Date()`,
// which would parse as UTC midnight and shift the day in negative-offset zones.
function formatReviewDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, year, month, day] = m;
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

export function RatingControl({
  bookSlug,
  yourRating,
  applyWrite,
}: {
  bookSlug: string;
  yourRating: PublicRating | null;
  applyWrite: (summary: RatingsSummary, ownRating: PublicRating | null) => void;
}) {
  const session = useSession();
  const hasRated = yourRating !== null;
  // Prefill from the own read when the user has rated (AC-4); otherwise empty.
  const [score, setScore] = useState(yourRating?.score ?? 0);
  const [review, setReview] = useState(yourRating?.reviewText ?? "");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Story 79 / ADR 0077: the removal flow's own small state machine, kept
  // apart from the rate/edit submit state (a deliberate, confirm-gated action).
  const [removeStep, setRemoveStep] = useState<"idle" | "confirm" | "removing">(
    "idle",
  );

  // Sovereign users (no email) sign in the browser; custodial users (email)
  // have the server sign with their session-wrapped key (ADR 0006).
  const isSovereign =
    session.status === "signed-in" && session.user.email === null;

  async function onSubmit() {
    if (score < 1) return;
    // Capture the prior own-rating slice for an honest rollback (AC-6).
    const priorScore = yourRating?.score ?? 0;
    const priorReview = yourRating?.reviewText ?? "";
    setStatus("submitting");
    setErrorMsg(null);
    const reviewText = review.trim() === "" ? undefined : review.trim();
    const reviewDate = todayIso();
    try {
      let result: {
        rating: { score: number; reviewText?: string; reviewDate: string };
        summary: RatingsSummary;
      };
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setErrorMsg("No Nostr extension found.");
          setStatus("error");
          return;
        }
        const { template } = await api.ratings.template({
          bookSlug,
          score,
          reviewText,
          reviewDate,
        });
        const signed = await nostr.signEvent(template);
        result = await api.ratings.submit(signed);
      } else {
        result = await api.ratings.submitCustodial({
          bookSlug,
          score,
          reviewText,
          reviewDate,
        });
      }
      // Reconcile both slices from the single saved source (ADR 0029 §4): the
      // POST's refreshed aggregate + the own rating we just published.
      const own: PublicRating = {
        npub: session.status === "signed-in" ? session.user.npub : (yourRating?.npub ?? ""),
        score,
        reviewText,
        reviewDate,
      };
      applyWrite(result.summary, own);
      setStatus("done");
    } catch (err) {
      // Rollback the optimistic state to the prior rating (AC-6); do not
      // reconcile the shared store as if the write succeeded.
      setScore(priorScore);
      setReview(priorReview);
      if (err instanceof ApiError && err.code === "reauth_required") {
        setErrorMsg("Please sign in again to update your rating.");
      } else {
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : "Could not save your rating. Try again.",
        );
      }
      setStatus("error");
    }
  }

  // Story 79: publish the retraction through the same per-tier path as a
  // rating, then reconcile with the own slice CLEARED (the control returns to
  // the un-rated state; re-rating later is the restore).
  async function onRemoveConfirm() {
    setRemoveStep("removing");
    setErrorMsg(null);
    try {
      let result: {
        removed: boolean;
        summary: RatingsSummary;
        yourRating: PublicRating | null;
      };
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setErrorMsg("No Nostr extension found.");
          setStatus("error");
          setRemoveStep("idle");
          return;
        }
        const { template } = await api.ratings.removeTemplate(bookSlug);
        const signed = await nostr.signEvent(template);
        result = await api.ratings.removeSubmit(signed);
      } else {
        result = await api.ratings.removeCustodial(bookSlug);
      }
      setScore(0);
      setReview("");
      setStatus("idle");
      setRemoveStep("idle");
      applyWrite(result.summary, null);
    } catch (err) {
      setRemoveStep("idle");
      if (err instanceof ApiError && err.code === "reauth_required") {
        setErrorMsg("Please sign in again to remove your rating.");
      } else {
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : "Could not remove your rating. Try again.",
        );
      }
      setStatus("error");
    }
  }

  return (
    <section className="rate" aria-label="Rate this book">
      {session.status === "signed-out" && <AccountPrompt action="rate" />}

      {session.status === "signed-in" && (
        <div className="rate-form">
          {hasRated && yourRating && (
            <p className="rate-edit-note">
              You rated this on {formatReviewDate(yourRating.reviewDate)}.
            </p>
          )}
          <div className="rate-stars" role="group" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <IconButton
                key={n}
                variant="bare"
                shape="square"
                className="rate-star"
                type="button"
                aria-label={`Rate ${n} of 5`}
                aria-pressed={score === n}
                onClick={() => setScore(n)}
              >
                <Icon name="star" filled={n <= score} />
              </IconButton>
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
              Your rating is in.
            </p>
          )}
          <Button
            variant="primary"
            size="md"
            className="rate-submit"
            type="button"
            disabled={score < 1 || status === "submitting"}
            onClick={onSubmit}
          >
            {status === "submitting"
              ? "Saving…"
              : hasRated
                ? "Update rating"
                : "Submit rating"}
          </Button>

          {hasRated && removeStep === "idle" && (
            <div className="rate-remove">
              <Button
                variant="ghost"
                size="sm"
                className="rate-remove-trigger"
                type="button"
                disabled={status === "submitting"}
                onClick={() => setRemoveStep("confirm")}
              >
                Remove rating
              </Button>
            </div>
          )}
          {hasRated && removeStep !== "idle" && (
            <div className="rate-remove rate-remove-confirming">
              <p className="rate-remove-note">
                Remove your rating? You can rate again anytime.
              </p>
              <div className="rate-remove-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={removeStep === "removing"}
                  onClick={() => setRemoveStep("idle")}
                >
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  type="button"
                  disabled={removeStep === "removing"}
                  onClick={onRemoveConfirm}
                >
                  {removeStep === "removing" ? "Removing…" : "Remove"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
