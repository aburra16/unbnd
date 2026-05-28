import { Link } from "react-router-dom";
import "./AuthMethodCard.css";

type Props = {
  to?: string;
  iconBg: string;
  iconInk: string;
  icon: React.ReactNode;
  name: string;
  description: string;
  comingSoon?: boolean;
};

export function AuthMethodCard({
  to,
  iconBg,
  iconInk,
  icon,
  name,
  description,
  comingSoon = false,
}: Props) {
  const inner = (
    <>
      <span
        className="amc-icon"
        style={{ background: iconBg, color: iconInk }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="amc-text">
        <span className="amc-name">{name}</span>
        <span className="amc-desc">{description}</span>
      </span>
      {comingSoon && <span className="amc-coming">Coming soon</span>}
    </>
  );

  if (comingSoon || !to) {
    return (
      <div
        className={`amc ${comingSoon ? "amc-disabled" : ""}`}
        aria-disabled="true"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={to} className="amc">
      {inner}
    </Link>
  );
}

export function EmailGlyph() {
  return <span className="amc-glyph amc-glyph-at">@</span>;
}

export function NostrBolt() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

export function GLetter() {
  return <span className="amc-glyph">G</span>;
}

export function AppleLetter() {
  return <span className="amc-glyph">A</span>;
}
