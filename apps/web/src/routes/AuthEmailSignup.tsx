import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { SovereigntyNote } from "../components/SovereigntyNote";
import { api, ApiError } from "../lib/api";
import "../components/AuthForm.css";

export function AuthEmailSignup() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.auth.signup({ email, password, displayName });
      navigate("/auth/welcome");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.";
      setError(message);
      setSubmitting(false);
    }
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
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <span className="auth-field-hint">
            Your password encrypts the private key that signs your activity.
          </span>
        </div>
        {error && (
          <p className="auth-field-error" role="alert">
            {error}
          </p>
        )}
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
