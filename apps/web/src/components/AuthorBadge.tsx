// Author claim badge (Story 31 / ADR 0032 §4). Given the book's claimant set it
// renders an honest "Claimed by {name}" mark, never "verified" — claiming is open
// and unverified, so the word "claimed" does the honesty work. Multiple claimants
// are shown honestly with no silently chosen winner: "Claimed by {name} and N
// others". Each name resolves via the Story 29 path (useProfileMeta +
// displayNameOf) with a short-npub fallback, linking to that author's profile.
import { Link } from "react-router-dom";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import { shortNpub } from "../lib/view-model";
import "./AuthorBadge.css";

type Claimant = { npub: string };

function ClaimantLink({ npub }: { npub: string }) {
  const meta = useProfileMeta(npub);
  const name = displayNameOf(meta, shortNpub(npub));
  return (
    <Link className="author-badge-link" to={`/profile/${npub}`}>
      {name}
    </Link>
  );
}

export function AuthorBadge({ claimants }: { claimants: Claimant[] }) {
  if (claimants.length === 0) return null;

  const [lead, ...rest] = claimants;
  return (
    <p className="author-badge">
      <span className="author-badge-label">Claimed by </span>
      <ClaimantLink npub={lead!.npub} />
      {rest.length > 0 && (
        <span className="author-badge-more"> and {rest.length} others</span>
      )}
    </p>
  );
}
