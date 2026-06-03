import { Link } from "react-router-dom";
import { SEMANTIC_COLORS } from "@unbnd/ui";
import { LogoMark } from "./LogoMark";
import { useSession } from "../hooks/useSession";
import "./Footer.css";

export function Footer() {
  const session = useSession();
  return (
    <footer className="footer">
      <div className="footer-left">
        <LogoMark size={16} fill={SEMANTIC_COLORS.muted} opacityScheme="soft" />
        <p className="footer-domain">unbnd.ink</p>
        <span className="footer-tagline">books unbound</span>
      </div>
      <div className="footer-links">
        <Link to="/about">About</Link>
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
