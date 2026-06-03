import { Link } from "react-router-dom";
import { SEMANTIC_COLORS } from "@unbnd/ui";
import { AuthShell } from "../components/AuthShell";
import "../components/AuthForm.css";

export function AuthWelcome() {
  return (
    <AuthShell
      title="You're in"
      subtitle="Two short steps and your recommendations will start to tune to your taste."
      logoFill={SEMANTIC_COLORS.signalPositive}
    >
      <div className="auth-welcome-stats">
        <div className="auth-welcome-stat">
          <strong>0 / 10</strong>
          <span>Curators followed</span>
        </div>
        <div className="auth-welcome-stat">
          <strong>0</strong>
          <span>Books rated</span>
        </div>
      </div>
      <div className="auth-welcome-cta">
        <Link
          to="/curators"
          className="auth-submit"
          style={{ textAlign: "center", textDecoration: "none" }}
        >
          Find curators to follow
        </Link>
        <Link
          to="/"
          className="auth-btn-secondary"
          style={{ textAlign: "center" }}
        >
          Browse books on your own
        </Link>
      </div>
      <p
        className="auth-welcome-note"
        style={{
          color: "var(--u-muted)",
          textAlign: "center",
          marginTop: 16,
        }}
      >
        Once you follow ten curators, recommendations will switch from the
        Unbnd house view to your own.
      </p>
    </AuthShell>
  );
}
