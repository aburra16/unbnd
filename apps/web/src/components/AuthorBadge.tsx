// Author claim badge (Story 31 / ADR 0032 §4; verified upgrade Story 32 / ADR
// 0033 §3). Given the book's claimant set it renders an honest mark: a
// trust-verified author shows "Verified Author"; the open (unverified) claimants
// collapse into "Claimed by {name} and N others" (no silently chosen winner) —
// the word "claimed" does the honesty work, and the two states are unmistakably
// distinct. Each name resolves via the Story 29 path (useProfileMeta +
// displayNameOf) with a short-npub fallback, linking to that author's profile. No
// trust-tier string, no raw GrapeRank number, no curator count appears — only the
// badge state.
import { Link } from "react-router-dom";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import { shortNpub } from "../lib/view-model";
import type { BookClaimant } from "../lib/api";
import "./AuthorBadge.css";

function ClaimantLink({ npub }: { npub: string }) {
  const meta = useProfileMeta(npub);
  const name = displayNameOf(meta, shortNpub(npub));
  return (
    <Link className="author-badge-link" to={`/profile/${npub}`}>
      {name}
    </Link>
  );
}

// A verified claimant: the "Verified Author" mark is the visible, honest state;
// the profile link is identified by the resolved author name (its accessible
// name), so the badge both states verification and links to the author.
function VerifiedClaimant({ npub }: { npub: string }) {
  const meta = useProfileMeta(npub);
  const name = displayNameOf(meta, shortNpub(npub));
  return (
    <p className="author-badge author-badge-verified">
      <Link className="author-badge-link" to={`/profile/${npub}`} aria-label={name}>
        <span className="author-badge-mark">Verified Author</span>
      </Link>
    </p>
  );
}

export function AuthorBadge({ claimants }: { claimants: BookClaimant[] }) {
  if (claimants.length === 0) return null;

  const verified = claimants.filter((c) => c.verified);
  const claimed = claimants.filter((c) => !c.verified);
  const [lead, ...rest] = claimed;

  return (
    <div className="author-badge-set">
      {verified.map((c) => (
        <VerifiedClaimant key={c.npub} npub={c.npub} />
      ))}
      {lead && (
        <p className="author-badge">
          <span className="author-badge-label">Claimed by </span>
          <ClaimantLink npub={lead.npub} />
          {rest.length > 0 && (
            <span className="author-badge-more"> and {rest.length} others</span>
          )}
        </p>
      )}
    </div>
  );
}
