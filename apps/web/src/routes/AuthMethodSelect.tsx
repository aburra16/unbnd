import { Link } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import {
  AuthMethodCard,
  EmailGlyph,
  NostrBolt,
  GLetter,
  AppleLetter,
} from "../components/AuthMethodCard";
import "../components/AuthForm.css";

export function AuthMethodSelect() {
  return (
    <AuthShell
      title="Sign in to Unbnd"
      subtitle="Pick how you want to sign in. Either path gives you a Nostr key you can export."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/auth">Use the same method you signed up with.</Link>
        </>
      }
    >
      <div className="auth-methods">
        <AuthMethodCard
          to="/auth/email"
          iconBg="var(--u-amber-tint-12)"
          iconInk="var(--u-amber)"
          icon={<EmailGlyph />}
          name="Continue with email"
          description="Unbnd manages a Nostr key on your behalf. Export it any time."
        />
        <AuthMethodCard
          to="/auth/nostr"
          iconBg="var(--u-purple-tint-12)"
          iconInk="var(--signal-sovereign)"
          icon={<NostrBolt />}
          name="Sign in with Nostr"
          description="Use a NIP-07 extension. The private key stays in your control."
        />
      </div>

      <div className="auth-divider">
        <span className="auth-divider-line" />
        <span>Coming soon</span>
        <span className="auth-divider-line" />
      </div>

      <div className="auth-methods">
        <AuthMethodCard
          iconBg="var(--u-ink-tint-06)"
          iconInk="var(--u-muted)"
          icon={<GLetter />}
          name="Continue with Google"
          description="OAuth signup. Server-managed key."
          comingSoon
        />
        <AuthMethodCard
          iconBg="var(--u-ink-tint-06)"
          iconInk="var(--u-muted)"
          icon={<AppleLetter />}
          name="Continue with Apple"
          description="OAuth signup. Server-managed key."
          comingSoon
        />
      </div>
    </AuthShell>
  );
}
