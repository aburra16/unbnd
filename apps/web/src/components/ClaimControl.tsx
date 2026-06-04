// Book-detail claim action (Story 31 / ADR 0032 §4). A signed-in user (sovereign
// OR custodial) can claim a catalog book; signed-out visitors get no affordance.
// Sovereign: template → NIP-07 signEvent → submit. Custodial: server-side submit
// (ADR 0006). Idle / in-flight / success / error states render IN PLACE (no
// toast). Claiming is open and states a self-claim — never "verified" (AC-7). On
// success the refreshed claimant list flows back up so the badge updates.
import { useState } from "react";
import {
  api,
  ApiError,
  type BookClaimant,
  type SignedEvent,
} from "../lib/api";
import { useSession } from "../hooks/useSession";
import { Button } from "@unbnd/ui";
import "./ClaimControl.css";

type Nip07 = {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

export function ClaimControl({
  bookSlug,
  onClaimed,
}: {
  bookSlug: string;
  onClaimed?: (claimants: BookClaimant[]) => void;
}) {
  const session = useSession();
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Signed-out visitors have no claim affordance (AC-1).
  if (session.status !== "signed-in") return null;

  // Sovereign users (no email) sign in the browser; custodial users (email) have
  // the server sign with their session-wrapped key (ADR 0006).
  const isSovereign = session.user.email === null;

  async function onClaim() {
    setStatus("submitting");
    setErrorMsg(null);
    try {
      let result: { claimed: boolean; claimants: BookClaimant[] };
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setErrorMsg("No Nostr extension found.");
          setStatus("error");
          return;
        }
        const { template } = await api.claims.template({ bookSlug });
        const signed = await nostr.signEvent(template);
        result = await api.claims.submit(signed);
      } else {
        result = await api.claims.submitCustodial({ bookSlug });
      }
      onClaimed?.(result.claimants);
      setStatus("done");
    } catch (err) {
      if (err instanceof ApiError && err.code === "reauth_required") {
        setErrorMsg("Please sign in again to claim this book.");
      } else {
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : "Could not record the claim. Try again.",
        );
      }
      setStatus("error");
    }
  }

  return (
    <section className="claim" aria-label="Claim this book">
      {status === "done" ? (
        <p className="claim-ok" role="status">
          You claimed this book.
        </p>
      ) : (
        <>
          <Button
            variant="secondary"
            size="md"
            className="claim-btn"
            type="button"
            disabled={status === "submitting"}
            onClick={onClaim}
          >
            {status === "submitting" ? "Claiming…" : "Claim this book"}
          </Button>
          {status === "error" && errorMsg && (
            <p className="claim-error" role="alert">
              {errorMsg}
            </p>
          )}
        </>
      )}
    </section>
  );
}
