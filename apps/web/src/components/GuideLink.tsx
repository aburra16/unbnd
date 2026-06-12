// The contextual guide door (Story 92 / ADR 0083): one quiet mark, the same
// everywhere, routing one click to the matching guide anchor. Uniformity is
// the quietness: readers learn the mark once.
import { Link } from "react-router-dom";
import "./GuideLink.css";

export function GuideLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="guide-what"
      aria-label={`${label}: the guide explains`}
    >
      ?
    </Link>
  );
}
