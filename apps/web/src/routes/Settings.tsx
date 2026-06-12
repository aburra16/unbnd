// Account settings — the Substack link write (ADR 0022). The first kind-0
// profile write from inside Unbnd. Gated like ProfileMe (loading → status;
// signed-out → /auth). One field, prefilled from the user's current kind-0
// `substack`. Sovereign users sign the server-merged template with NIP-07;
// custodial users let the server sign. Save / Clear, inline http(s) validation,
// honest idle | saving | saved | error states. On success the saved value is
// echoed and the Story-19 profile cache is busted so the link shows on
// /profile/me without a hard reload.
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError, type SignedEvent } from "../lib/api";
import { CopyButton } from "../components/CopyButton";
import { SovereigntyCard } from "../components/SovereigntyCard";
import { Button, Field, Label } from "@unbnd/ui";
import { shortNpub } from "../lib/view-model";
import { useSession } from "../hooks/useSession";
import {
  useProfileMeta,
  invalidateProfileMeta,
  displayNameOf,
} from "../hooks/useProfileMeta";
import "./Settings.css";
import { PageShell } from "../components/PageShell";

type Nip07 = {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

/** Empty (clear) or a well-formed http(s) URL. Matches the server check. */
function isValidSubstack(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true; // empty = clear
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function Settings() {
  const session = useSession();
  const npub = session.status === "signed-in" ? session.user.npub : undefined;
  const meta = useProfileMeta(npub);
  const [value, setValue] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Display-name field (custodial only). Prefilled from the resolved kind-0
  // name, falling back to the session display name.
  const [nameValue, setNameValue] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  if (session.status === "loading") {
    return (
      <PageShell>
        <p className="route-status" role="status">
          Loading…
        </p>
      </PageShell>
    );
  }
  if (session.status === "signed-out") {
    return <Navigate to="/auth" replace />;
  }

  const { user } = session;
  // The field shows the in-progress edit once touched, else the current value.
  const field = value ?? meta?.substack ?? "";
  const isSovereign = user.email === null;
  // The display-name field shows the in-progress edit once touched, else the
  // resolved name (kind-0), falling back to the session display name.
  const nameField = nameValue ?? displayNameOf(meta, user.displayName);

  async function saveName(next: string) {
    setNameError(null);
    const trimmed = next.trim();
    if (trimmed === "") {
      setNameError("Enter a display name.");
      setNameStatus("error");
      return;
    }
    setNameStatus("saving");
    try {
      const { displayName } = await api.profile.setDisplayName(trimmed);
      setNameValue(displayName);
      setNameStatus("saved");
      invalidateProfileMeta(user.npub);
    } catch (err) {
      setNameError(
        err instanceof ApiError
          ? err.message
          : "Could not save your name. Try again.",
      );
      setNameStatus("error");
    }
  }

  async function save(next: string) {
    setErrorMsg(null);
    if (!isValidSubstack(next)) {
      setErrorMsg("Enter a full http or https link, or leave it empty to clear.");
      setStatus("error");
      return;
    }
    const trimmed = next.trim();
    setStatus("saving");
    try {
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setErrorMsg(
            "No Nostr extension found. Install one to update your profile.",
          );
          setStatus("error");
          return;
        }
        const { template } = await api.profile.substackTemplate(trimmed);
        const signed = await nostr.signEvent(template);
        await api.profile.setSubstack(signed);
      } else {
        await api.profile.setSubstackCustodial(trimmed);
      }
      // Optimistic echo + bust the Story-19 cache so /profile/me re-reads.
      setValue(trimmed);
      setStatus("saved");
      invalidateProfileMeta(user.npub);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Could not save your link. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <PageShell>
      <header className="set-head">
        <h1 className="set-title">Settings</h1>
        <p className="set-sub">
          Add the place you publish. It shows on your profile as a link readers
          can follow.
        </p>
      </header>

      <form
        className="set-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(field);
        }}
      >
        <Field className="set-field">
          <Label htmlFor="set-substack">Substack</Label>
          <input
            id="set-substack"
            name="substack"
            type="text"
            inputMode="url"
            placeholder="https://yourname.substack.com"
            value={field}
            onChange={(e) => {
              setValue(e.target.value);
              if (status !== "idle") setStatus("idle");
            }}
          />
          <p className="set-hint">A full link, including https://.</p>
        </Field>

        {status === "error" && errorMsg && (
          <p className="set-error" role="alert">
            {errorMsg}
          </p>
        )}
        {status === "saving" && (
          <p className="set-saving" role="status">
            Saving…
          </p>
        )}
        {status === "saved" && (
          <p className="set-saved" role="status">
            Saved.
          </p>
        )}

        <div className="set-actions">
          <Button
            variant="primary"
            size="md"
            className="set-save"
            type="submit"
            aria-label="Save Substack link"
            disabled={status === "saving"}
          >
            Save
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="set-clear"
            type="button"
            disabled={status === "saving"}
            onClick={() => {
              setValue("");
              void save("");
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {!isSovereign && (
        <form
          className="set-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void saveName(nameField);
          }}
        >
          <Field className="set-field">
            <Label htmlFor="set-display-name">Display name</Label>
            <input
              id="set-display-name"
              name="displayName"
              type="text"
              maxLength={100}
              value={nameField}
              onChange={(e) => {
                setNameValue(e.target.value);
                if (nameStatus !== "idle") setNameStatus("idle");
              }}
            />
            <p className="set-hint">
              The name readers see on your profile and reviews.
            </p>
          </Field>

          {nameStatus === "error" && nameError && (
            <p className="set-error" role="alert">
              {nameError}
            </p>
          )}
          {nameStatus === "saving" && (
            <p className="set-saving" role="status">
              Saving…
            </p>
          )}
          {nameStatus === "saved" && (
            <p className="set-saved" role="status">
              Saved.
            </p>
          )}

          <div className="set-actions">
            <Button
              variant="primary"
              size="md"
              className="set-save"
              type="submit"
              aria-label="Save display name"
              disabled={nameStatus === "saving"}
            >
              Save
            </Button>
          </div>
        </form>
      )}

      {/* Nostr identity — the canonical home for the npub (Story 29 / ADR 0030).
          Read-only: a persistent on-page explainer, the Your-npub label, the
          monospace middle-truncated chip, and the shared CopyButton. Both tiers.
          No write, no state machine, no API call. */}
      <section className="set-form set-nostr">
        <h2 className="set-nostr-title">Nostr identity</h2>
        <p className="set-hint set-nostr-explainer">
          This is your identity on nostr. It travels with you to any nostr app,
          and it is how other people follow and reference you.
        </p>
        <Field className="set-field">
          <span className="set-nostr-label">Your npub</span>
          <div className="set-nostr-row">
            <code className="set-nostr-chip">{shortNpub(user.npub)}</code>
            <CopyButton value={user.npub} />
          </div>
        </Field>
        {/* Sovereignty upgrade (Story 76 / ADR 0074): take ownership of your key. */}
        <SovereigntyCard user={user} />
      </section>
    </PageShell>
  );
}
