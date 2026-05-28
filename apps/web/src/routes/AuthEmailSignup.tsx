import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { SovereigntyNote } from "../components/SovereigntyNote";
import "../components/AuthForm.css";

export function AuthEmailSignup() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Real implementation: generate secp256k1 keypair, derive an Argon2id
    // key from the password, encrypt the private key, store the encrypted
    // key alongside a server-managed backup key, issue a JWT session, then
    // route to /auth/welcome. UI flow is in place for that wiring.
    setTimeout(() => navigate("/auth/welcome"), 200);
  }

  return (
    <AuthShell
      title="Sign in with email"
      subtitle="Unbnd will create a Nostr keypair behind the scenes. You can read or export it at any point."
      footer={
        <>
          Prefer a Nostr extension?{" "}
          <Link to="/auth/nostr">Sign in with Nostr instead.</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="auth-field">
          <label htmlFor="auth-name">Display name</label>
          <input
            id="auth-name"
            type="text"
            autoComplete="name"
            placeholder="Mira Calloway"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="auth-pw">Password</label>
          <input
            id="auth-pw"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            minLength={10}
            required
          />
          <span className="auth-field-hint">
            Your password encrypts the private key that signs your activity.
          </span>
        </div>
        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <SovereigntyNote tone="amber">
        Unbnd holds a separate encrypted backup of your key so you can recover
        after a password reset. If you want the key to live only with you,
        sign in with Nostr instead.
      </SovereigntyNote>
    </AuthShell>
  );
}
