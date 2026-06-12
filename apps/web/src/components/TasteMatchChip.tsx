// Story 65 / ADR 0064 — the Taste Match chip on a public profile. Observer-
// relative: it shows how closely the SIGNED-IN viewer agrees with the profile's
// owner on the books they have both rated. Hidden when signed out and when
// viewing your own profile. Below the overlap threshold it shows an honest
// "Not enough overlap yet" rather than a number. v1 raw agreement.
import { useEffect, useState } from "react";
import { Pill } from "@unbnd/ui";
import { useSession } from "../hooks/useSession";
import { api, type TasteMatchResult } from "../lib/api";
import "./TasteMatchChip.css";

export function TasteMatchChip({
  target,
  withGuideLink,
}: {
  target: string;
  /** Story 92 / ADR 0083: the profile placement's guide door. STUB (red). */
  withGuideLink?: boolean;
}) {
  void withGuideLink;
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const isSelf = session.status === "signed-in" && session.user.npub === target;
  const [result, setResult] = useState<TasteMatchResult | null>(null);

  useEffect(() => {
    if (!signedIn || isSelf) {
      setResult(null);
      return;
    }
    let cancelled = false;
    api.profile
      .tasteMatch(target)
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setResult(null));
    return () => {
      cancelled = true;
    };
  }, [target, signedIn, isSelf]);

  // Signed out or own profile → nothing. (No query is made in either case.)
  if (!signedIn || isSelf) return null;
  if (!result || !result.signedIn || result.self) return null;

  if (!result.thresholdMet) {
    return <p className="taste-match-empty">Not enough overlap yet</p>;
  }

  const books = result.commonBooks === 1 ? "book" : "books";
  return (
    <Pill
      variant="genre"
      className="taste-match-chip"
      label={`${result.percentage}% match · ${result.commonBooks} ${books} in common`}
    />
  );
}
