import "./Pill.css";

type GenrePillProps = {
  label: string;
  color?: string;
  /** Raw count of readers who applied this tag. No trust weighting yet. */
  count?: number;
};

export function GenrePill({ label, color, count }: GenrePillProps) {
  const style = color
    ? {
        background: `${color}14`,
        color,
      }
    : undefined;
  return (
    <span className="pill pill-genre" style={style}>
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="pill-conf">{count}</span>
      )}
    </span>
  );
}

type SignalPillProps = {
  label: string;
  tone: "positive" | "negative" | "sovereign" | "amber";
};

export function SignalPill({ label, tone }: SignalPillProps) {
  return <span className={`pill pill-${tone}`}>{label}</span>;
}

type TrustBadgeProps = {
  label: string;
};

export function TrustBadge({ label }: TrustBadgeProps) {
  return <span className="pill pill-trust">{label}</span>;
}
