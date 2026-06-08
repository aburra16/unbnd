// Story 76 / ADR 0074: the "take ownership of your key" card in Settings, Nostr
// identity. A deliberate, calm flow: explain, one explicit confirmation, password
// re-auth, then reveal the nsec ONCE (copy + a required acknowledgement before
// dismiss). Never forced, always dismissible. The revealed nsec lives in
// component state only (never localStorage/sessionStorage) and is cleared on
// dismiss. No hand-rolled crypto: the server reveals via the audited path.
import { useState } from "react";
import { Button, Field, Label } from "@unbnd/ui";
import { CopyButton } from "./CopyButton";
import { useSession } from "../hooks/useSession";
import { api, ApiError, type PublicUser } from "../lib/api";
import "./SovereigntyCard.css";

type Step = "idle" | "confirm" | "reauth" | "revealed";

export function SovereigntyCard({ user }: { user: PublicUser }) {
  const session = useSession();
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [nsec, setNsec] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A sovereign user already holds their own key, so never offer the export.
  if (user.email === null) {
    return (
      <section className="sov-card" aria-label="Key ownership">
        <h3 className="sov-title">You own your key</h3>
        <p className="sov-body">
          You hold your own key. Your identity is yours to carry to any nostr app.
        </p>
      </section>
    );
  }

  // A custodial user who has already taken ownership.
  if (user.keyExportedAt) {
    return (
      <section className="sov-card sov-card-taken" aria-label="Key ownership">
        <h3 className="sov-title">You have taken ownership</h3>
        <p className="sov-body">
          You hold a copy of your key. Your account still works here as normal.
        </p>
      </section>
    );
  }

  function reset() {
    setStep("idle");
    setPassword("");
    setNsec(null); // the revealed key leaves memory on dismiss
    setAcknowledged(false);
    setError(null);
  }

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const { nsec: revealed } = await api.auth.exportKey(password);
      setNsec(revealed);
      setPassword(""); // do not retain the password past the reveal
      setStep("revealed");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "That password is incorrect."
          : "Could not reveal your key. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sov-card sov-card-offer" aria-label="Key ownership">
      <h3 className="sov-title">Take ownership of your account</h3>

      {step === "idle" && (
        <>
          <p className="sov-body">
            Right now we hold your key so signing in is easy. You can take a copy
            of your key and use this identity in any nostr app. Your account here
            keeps working as normal.
          </p>
          <Button variant="secondary" size="md" type="button" onClick={() => setStep("confirm")}>
            Take ownership
          </Button>
        </>
      )}

      {step === "confirm" && (
        <>
          <p className="sov-body">
            Your key is shown once. Save it somewhere safe before you close it.
            Anyone with your key controls this identity, so keep it private.
          </p>
          <div className="sov-actions">
            <Button variant="primary" size="md" type="button" onClick={() => setStep("reauth")}>
              I understand, continue
            </Button>
            <Button variant="ghost" size="md" type="button" onClick={reset}>
              Not now
            </Button>
          </div>
        </>
      )}

      {step === "reauth" && (
        <form
          className="sov-reauth"
          onSubmit={(e) => {
            e.preventDefault();
            void reveal();
          }}
        >
          <Field className="set-field">
            <Label htmlFor="sov-password">Confirm your password</Label>
            <input
              id="sov-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p className="sov-error" role="alert">
              {error}
            </p>
          )}
          <div className="sov-actions">
            <Button variant="primary" size="md" type="submit" disabled={busy || !password}>
              {busy ? "Revealing…" : "Reveal my key"}
            </Button>
            <Button variant="ghost" size="md" type="button" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === "revealed" && nsec && (
        <div className="sov-reveal">
          <p className="sov-body">Here is your key. It is shown only once.</p>
          <div className="sov-key-row">
            <code className="sov-key">{nsec}</code>
            <CopyButton value={nsec} label="Copy" ariaLabel="Copy your key" />
          </div>
          <label className="sov-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I have saved my key somewhere safe</span>
          </label>
          <Button
            variant="primary"
            size="md"
            type="button"
            disabled={!acknowledged}
            onClick={() => {
              reset();
              session.refresh?.();
            }}
          >
            Done
          </Button>
        </div>
      )}
    </section>
  );
}
