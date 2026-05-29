import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { SovereigntyNote } from "../components/SovereigntyNote";
import { api, ApiError } from "../lib/api";
import "../components/AuthForm.css";

type Mode = "signin" | "create";

export function AuthEmailSignup() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreate = mode === "create";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isCreate) {
        await api.auth.signup({ email, password, displayName });
        navigate("/auth/welcome");
      } else {
        await api.auth.login({ email, password });
        navigate("/");
      }
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
      title={isCreate ? "Create your Unbnd account" : "Sign in with email"}
      subtitle={
        isCreate
          ? "Unbnd will create a Nostr keypair behind the scenes. You can read or export it at any point."
          : "Welcome back. Sign in with the email and password you signed up with."
      }
      footer={
        isCreate ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="auth-linklike"
              onClick={() => switchMode("signin")}
            >
              Sign in.
            </button>
          </>
        ) : (
          <>
            New to Unbnd?{" "}
            <button
              type="button"
              className="auth-linklike"
              onClick={() => switchMode("create")}
            >
              Create an account.
            </button>{" "}
            Prefer a Nostr extension?{" "}
            <Link to="/auth/nostr">Sign in with Nostr.</Link>
          </>
        )
      }
    >
      <form className="auth-form" onSubmit={onSubmit}>
        {isCreate && (
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
        )}
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
            autoComplete={isCreate ? "new-password" : "current-password"}
            placeholder={isCreate ? "At least 10 characters" : "Your password"}
            minLength={isCreate ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {isCreate && (
            <span className="auth-field-hint">
              Your password encrypts the private key that signs your activity.
            </span>
          )}
        </div>
        {error && (
          <p className="auth-field-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting
            ? isCreate
              ? "Creating account…"
              : "Signing in…"
            : isCreate
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      {isCreate && (
        <SovereigntyNote tone="amber">
          Unbnd holds a separate encrypted backup of your key so you can recover
          after a password reset. If you want the key to live only with you,
          sign in with Nostr instead.
        </SovereigntyNote>
      )}
    </AuthShell>
  );
}
