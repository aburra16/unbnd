// Story 68 / ADR 0067 — a "Curate" nav entry to /submissions, shown only for a
// signed-in curator (api.profile.meCurator.isCurator).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { api } from "../lib/api";

export function CurateNavLink() {
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const [isCurator, setIsCurator] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setIsCurator(false);
      return;
    }
    let cancelled = false;
    // Wrapped so any failure (network, or an absent method in a partial test
    // mock) is caught rather than thrown — a nav enhancement must never crash Nav.
    Promise.resolve()
      .then(() => api.profile.meCurator())
      .then((r) => !cancelled && setIsCurator(r.isCurator))
      .catch(() => !cancelled && setIsCurator(false));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn || !isCurator) return null;
  return (
    <Link className="nav-link" to="/submissions">
      Curate
    </Link>
  );
}
