import { Link } from "react-router-dom";
import { Icon, SEMANTIC_COLORS } from "@unbnd/ui";
import { useSession } from "../hooks/useSession";
import "./Footer.css";

export function Footer() {
  const session = useSession();
  return (
    <footer className="footer">
      <div className="footer-left">
        <Icon name="logo" size={16} fill={SEMANTIC_COLORS.muted} opacityScheme="soft" />
        <p className="footer-domain">unbnd.ink</p>
        <span className="footer-tagline">books unbound</span>
      </div>
      <div className="footer-links">
        <Link to="/about">About</Link>
        <Link to="/guide">Guide</Link>
        <Link to="/submit">Submit</Link>
        <Link to="/submissions">Submissions</Link>
        {session.status === "signed-in" ? (
          <Link to="/profile/me">Profile</Link>
        ) : (
          <Link to="/auth">Sign in</Link>
        )}
      </div>
    </footer>
  );
}
