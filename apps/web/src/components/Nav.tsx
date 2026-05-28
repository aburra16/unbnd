import { LogoMark } from "./LogoMark";
import "./Nav.css";

export function Nav() {
  return (
    <nav className="nav">
      <a className="nav-logo" href="/">
        <LogoMark size={26} />
        <span className="nav-wordmark">unbnd</span>
      </a>
      <div className="nav-right">
        <a className="nav-link" href="/browse">
          Browse
        </a>
        <a className="nav-link" href="/submit">
          Submit a book
        </a>
        <button className="nav-signin" type="button">
          Sign in
        </button>
      </div>
    </nav>
  );
}
