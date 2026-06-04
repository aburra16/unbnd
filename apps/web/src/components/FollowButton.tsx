// The follow control on a public profile (ADR 0023 Decision 5). Follows are
// real Nostr kind-3 contact-list writes for all three tiers: sovereign signs in
// the browser via NIP-07; custodial is signed server-side with the session's
// ephemeral-wrapped key. The control reads the viewer's own follow status, and
// drives Follow ↔ Following with an optimistic pending state that reverts on
// failure (no fabricated success).
//
// Render rules (AC-1): signed-out → a sign-in affordance; viewing your OWN
// profile → no control; otherwise the follow control. States (AC-2/AC-10):
// Follow (filled amber) / Following (quiet outline + a check, revealing Unfollow
// in a negative treatment on hover/focus). No icon library — the check is
// hand-authored SVG. Tokens-only styling.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type SignedEvent } from "../lib/api";
import { useSession } from "../hooks/useSession";
import { Button } from "@unbnd/ui";
import "./FollowButton.css";

type Nip07 = {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

/** A short two-segment check, drawn from tokens (currentColor). Not an icon lib. */
function CheckGlyph() {
  return (
    <svg
      className="follow-check"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <polyline
        points="3.5,8.5 6.5,11.5 12.5,4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FollowButton({ target }: { target: string }) {
  const session = useSession();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Track whether this is the viewer's own profile so we never render a control.
  const isSignedIn = session.status === "signed-in";
  const isOwnProfile = isSignedIn && session.user.npub === target;

  // Read the viewer's follow status toward this target (AC-2). Never called when
  // signed-out or on the viewer's own profile.
  useEffect(() => {
    if (!isSignedIn || isOwnProfile) return;
    let cancelled = false;
    setFollowing(null);
    api.profile
      .followStatus(target)
      .then((r) => !cancelled && setFollowing(r.following))
      .catch(() => !cancelled && setFollowing(false));
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, isOwnProfile, target]);

  if (session.status === "signed-out") {
    return (
      <Link className="follow-signin" to="/auth">
        Sign in to follow
      </Link>
    );
  }
  if (session.status === "loading" || isOwnProfile) return null;
  // Status not resolved yet — render nothing rather than guess the state.
  if (following === null) return null;

  const isSovereign = isSignedIn && session.user.email === null;

  async function runFollow(action: "follow" | "unfollow") {
    if (pending) return;
    const prev = following;
    // Optimistic flip + busy affordance.
    setFollowing(action === "follow");
    setPending(true);
    setErrorMsg(null);
    try {
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setFollowing(prev);
          setPending(false);
          setErrorMsg("No Nostr extension found. Install one to follow from this account.");
          return;
        }
        const { template } = await api.profile.followTemplate({ target, action });
        const signed = await nostr.signEvent(template);
        const r = await api.profile.follow(signed, { target, action });
        setFollowing(r.following);
      } else {
        const r = await api.profile.followCustodial({ target, action });
        setFollowing(r.following);
      }
    } catch (err) {
      // Revert to the prior state — never a fabricated success.
      setFollowing(prev);
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Could not update your follow. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (following) {
    // Following state. Hover/focus reveals the Unfollow affordance in a negative
    // treatment so the consequence reads clearly; the same button performs the
    // unfollow. Keyboard users reach it via :focus, not hover-only.
    const showUnfollow = hovered;
    return (
      <div className="follow-wrap">
        <Button
          variant="secondary"
          selected={showUnfollow}
          className="follow-btn follow-following"
          type="button"
          aria-pressed="true"
          aria-label={`Following ${target}, activate to unfollow`}
          disabled={pending}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onClick={() => runFollow("unfollow")}
        >
          {showUnfollow ? (
            <span className="follow-label">Unfollow</span>
          ) : (
            <>
              <CheckGlyph />
              <span className="follow-label">Following</span>
            </>
          )}
        </Button>
        {errorMsg && (
          <p className="follow-error" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  // Follow state — the affirmative primary action.
  return (
    <div className="follow-wrap">
      <Button
        variant="primary"
        className="follow-btn follow-follow"
        type="button"
        aria-pressed="false"
        disabled={pending}
        onClick={() => runFollow("follow")}
      >
        <span className="follow-label">Follow</span>
      </Button>
      {errorMsg && (
        <p className="follow-error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
