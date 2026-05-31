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
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { useSession } from "../hooks/useSession";
import { useProfileMeta, invalidateProfileMeta } from "../hooks/useProfileMeta";
import "./Settings.css";

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

  if (session.status === "loading") {
    return (
      <div className="page">
        <Nav />
        <p className="route-status" role="status">
          Loading…
        </p>
        <Footer />
      </div>
    );
  }
  if (session.status === "signed-out") {
    return <Navigate to="/auth" replace />;
  }

  const { user } = session;
  // The field shows the in-progress edit once touched, else the current value.
  const field = value ?? meta?.substack ?? "";
  const isSovereign = user.email === null;

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
    <div className="page">
      <Nav />
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
        <div className="set-field">
          <label htmlFor="set-substack">Substack</label>
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
        </div>

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
          <button
            type="submit"
            className="set-save"
            disabled={status === "saving"}
          >
            Save
          </button>
          <button
            type="button"
            className="set-clear"
            disabled={status === "saving"}
            onClick={() => {
              setValue("");
              void save("");
            }}
          >
            Clear
          </button>
        </div>
      </form>
      <Footer />
    </div>
  );
}
