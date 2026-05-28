import { Link } from "react-router-dom";
import { LogoMark } from "./LogoMark";
import "./Nav.css";

export function Nav() {
  return (
    <nav className="nav">
      <Link className="nav-logo" to="/">
        <LogoMark size={26} />
        <span className="nav-wordmark">unbnd</span>
      </Link>
      <div className="nav-right">
        <Link className="nav-link" to="/browse">
          Browse
        </Link>
        <Link className="nav-link" to="/submit">
          Submit a book
        </Link>
        <Link className="nav-signin" to="/auth">
          Sign in
        </Link>
      </div>
    </nav>
  );
}
