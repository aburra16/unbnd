import { Link } from "react-router-dom";
import { LogoMark } from "./LogoMark";
import { useSession } from "../hooks/useSession";
import "./Nav.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Nav() {
  const session = useSession();

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
        {session.status === "signed-in" ? (
          <Link
            className="nav-avatar"
            to={`/profile/${session.user.id}`}
            aria-label={`${session.user.displayName} — profile`}
            title={session.user.displayName}
          >
            {initials(session.user.displayName)}
          </Link>
        ) : session.status === "signed-out" ? (
          <Link className="nav-signin" to="/auth">
            Sign in
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
