import { Link } from "react-router-dom";
import { Icon } from "@unbnd/ui";
import { useSession } from "../hooks/useSession";
import { AccountMenu } from "./AccountMenu";
import { SearchBox } from "./SearchBox";
import "./Nav.css";

export function Nav() {
  const session = useSession();

  return (
    <nav className="nav">
      <Link className="nav-logo" to="/">
        <Icon name="logo" size={26} />
        <span className="nav-wordmark">unbnd</span>
      </Link>
      <div className="nav-right">
        <div className="nav-search">
          <SearchBox compact placeholder="Search books" />
        </div>
        <Link className="nav-link" to="/browse">
          Browse
        </Link>
        <Link className="nav-link" to="/submit">
          Submit a book
        </Link>
        {session.status === "signed-in" ? (
          <AccountMenu user={session.user} onSignedOut={session.refresh} />
        ) : session.status === "signed-out" ? (
          <Link className="nav-signin" to="/auth">
            Sign in
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
