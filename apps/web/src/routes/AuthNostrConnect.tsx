import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { npubEncode } from "applesauce-core/helpers";
import { AuthShell } from "../components/AuthShell";
import { SovereigntyNote } from "../components/SovereigntyNote";
import { api, ApiError } from "../lib/api";
import "../components/AuthForm.css";

type State = "detecting" | "no-extension" | "ready" | "connecting" | "error";

const NIP42_KIND = 22242;
const HEX64 = /^[0-9a-f]{64}$/;

// NIP-07 extension surface we rely on. Hex pubkey in, signed event out.
type Nip07 = {
  getPublicKey: () => Promise<string>;
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<{
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  }>;
};

function displayNpub(pubkeyHex: string): string {
  try {
    return npubEncode(pubkeyHex);
  } catch {
    return pubkeyHex;
  }
}

export function AuthNostrConnect() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("detecting");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
      if (cancelled) return;
      if (!nostr || typeof nostr.getPublicKey !== "function") {
        setState("no-extension");
        return;
      }
      try {
        const pk = await nostr.getPublicKey();
        if (cancelled) return;
        if (!pk || !HEX64.test(pk)) {
          setState("no-extension");
          return;
        }
        setPubkey(pk);
        setState("ready");
      } catch {
        if (cancelled) return;
        setState("no-extension");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function onConfirm() {
    const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
    if (!nostr || !pubkey) return;
    setState("connecting");
    setErrorMsg(null);
    try {
      // 1. Ask the server for a single-use challenge bound to this pubkey.
      const { challenge } = await api.auth.nostr.challenge(pubkey);
      // 2. Have the extension sign a NIP-42 event carrying the challenge.
      //    The private key never leaves the extension.
      const signed = await nostr.signEvent({
        kind: NIP42_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["challenge", challenge]],
        content: "",
      });
      // 3. Server verifies the signature, consumes the challenge, issues a session.
      await api.auth.nostr.verify(signed);
      navigate("/auth/welcome");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not complete the signature. Try again.";
      setErrorMsg(message);
      setState("error");
    }
  }

  return (
    <AuthShell
      title="Sign in with Nostr"
      subtitle="Unbnd reads your public key from a NIP-07 browser extension. Your private key never leaves the extension."
      logoFill="#7845FF"
      footer={
        <>
          No extension yet?{" "}
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noreferrer noopener"
          >
            Install Alby
          </a>{" "}
          or use{" "}
          <Link to="/auth/email">email signup instead.</Link>
        </>
      }
    >
      {state === "detecting" && (
        <div className="auth-pubkey">
          <span className="auth-pubkey-label">Checking for an extension</span>
          Looking for window.nostr…
        </div>
      )}

      {state === "no-extension" && (
        <>
          <div className="auth-pubkey">
            <span className="auth-pubkey-label">No extension detected</span>
            Install a NIP-07 extension such as Alby, nos2x, or Flamingo, then
            reload this page.
          </div>
          <Link to="/auth" className="auth-btn-secondary" style={{ textAlign: "center" }}>
            Back to method selection
          </Link>
        </>
      )}

      {(state === "ready" || state === "connecting" || state === "error") &&
        pubkey && (
          <>
            <div className="auth-pubkey">
              <span className="auth-pubkey-label">
                Public key from your extension
              </span>
              {displayNpub(pubkey)}
            </div>
            {state === "error" && errorMsg && (
              <p className="auth-field-error" role="alert">
                {errorMsg}
              </p>
            )}
            <div className="auth-btn-row">
              <Link
                to="/auth"
                className="auth-btn-secondary"
                style={{ textAlign: "center" }}
              >
                Cancel
              </Link>
              <button
                type="button"
                className="auth-submit"
                onClick={onConfirm}
                disabled={state === "connecting"}
              >
                {state === "connecting"
                  ? "Signing challenge…"
                  : state === "error"
                    ? "Try again"
                    : "Continue with this key"}
              </button>
            </div>
          </>
        )}

      <SovereigntyNote tone="sovereign">
        Sovereign sign in. Unbnd cannot sign events on your behalf. Lose access
        to the extension and you lose access to the account, so back up the
        nsec.
      </SovereigntyNote>
    </AuthShell>
  );
}
