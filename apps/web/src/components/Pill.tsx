import "./Pill.css";

type GenrePillProps = {
  label: string;
  color?: string;
  confidence?: number;
};

export function GenrePill({ label, color, confidence }: GenrePillProps) {
  const style = color
    ? {
        background: `${color}14`,
        color,
      }
    : undefined;
  return (
    <span className="pill pill-genre" style={style}>
      {label}
      {typeof confidence === "number" && (
        <span className="pill-conf">{Math.round(confidence * 100)}%</span>
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
