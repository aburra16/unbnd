import { LogoMark } from "./LogoMark";
import "./Footer.css";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-left">
        <LogoMark size={16} fill="#8B8698" opacityScheme="soft" />
        <p className="footer-domain">unbnd.ink</p>
        <span className="footer-tagline">books unbound</span>
      </div>
      <div className="footer-links">
        <a href="/about">About</a>
        <a href="/submit">Submit</a>
        <a href="/profile/mira-calloway">Profile</a>
      </div>
    </footer>
  );
}
