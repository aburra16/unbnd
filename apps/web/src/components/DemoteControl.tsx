// Story 80 / ADR 0078: the curator-only "Remove from catalog" action on a
// community-promoted book. Visible only when the caller clears the curator
// gate AND the record's provenance is community (seeded records never offer
// it). Confirm-gated (a destructive action); the api enqueues the intent and
// the off-path worker fulfills asynchronously, so success settles into a calm
// requested state rather than pretending the catalog already changed.
import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "@unbnd/ui";
import "./DemoteControl.css";
import { GuideLink } from "./GuideLink";

export function DemoteControl({
  bookSlug,
  source,
  canCurate,
}: {
  bookSlug: string;
  source?: string;
  canCurate: boolean;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "sending" | "requested">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!canCurate || source !== "community") return null;

  async function onConfirm() {
    setStep("sending");
    setErrorMsg(null);
    try {
      await api.submissions.demote(bookSlug);
      setStep("requested");
    } catch {
      setStep("confirm");
      setErrorMsg("Could not request the removal. Try again.");
    }
  }

  return (
    <section className="demote" aria-label="Catalog curation">
      {step === "idle" && (
        <Button
          variant="ghost"
          size="sm"
          className="demote-trigger"
          type="button"
          onClick={() => setStep("confirm")}
        >
          Remove from catalog
        </Button>
      )}
      {(step === "confirm" || step === "sending") && (
        <div className="demote-confirm">
          <p className="demote-note">
            Remove this book from the catalog? It goes back to community
            submissions.
          </p>
          {errorMsg && (
            <p className="demote-error" role="alert">
              {errorMsg}
            </p>
          )}
          <div className="demote-actions">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={step === "sending"}
              onClick={() => setStep("idle")}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              type="button"
              disabled={step === "sending"}
              onClick={onConfirm}
            >
              {step === "sending" ? "Removing…" : "Remove"}
            </Button>
          </div>
        </div>
      )}
      {step === "requested" && (
        <p className="demote-requested" role="status">
          Removal requested. The catalog updates shortly.
          <GuideLink
            to="/guide/for-curators#removing-a-book-from-the-catalog"
            label="Removal"
          />
        </p>
      )}
    </section>
  );
}
