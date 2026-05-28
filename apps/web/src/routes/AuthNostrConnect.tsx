import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { SovereigntyNote } from "../components/SovereigntyNote";
import "../components/AuthForm.css";

type State = "detecting" | "no-extension" | "ready" | "connecting";

const fixturePubkey =
  "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";

export function AuthNostrConnect() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("detecting");
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const nostr = (window as any).nostr;
      if (cancelled) return;
      if (!nostr || typeof nostr.getPublicKey !== "function") {
        setState("no-extension");
        return;
      }
      try {
        const pk = await nostr.getPublicKey();
        if (cancelled) return;
        setPubkey(pk ?? fixturePubkey);
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
    setState("connecting");
    // Real flow: send a signed challenge to /api/auth/nostr, receive JWT.
    setTimeout(() => navigate("/auth/welcome"), 250);
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

      {(state === "ready" || state === "connecting") && pubkey && (
        <>
          <div className="auth-pubkey">
            <span className="auth-pubkey-label">Public key from your extension</span>
            {pubkey}
          </div>
          <div className="auth-btn-row">
            <Link to="/auth" className="auth-btn-secondary" style={{ textAlign: "center" }}>
              Cancel
            </Link>
            <button
              type="button"
              className="auth-submit"
              onClick={onConfirm}
              disabled={state === "connecting"}
            >
              {state === "connecting" ? "Signing challenge…" : "Continue with this key"}
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
