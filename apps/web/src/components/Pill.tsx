import "./Pill.css";

type GenrePillProps = {
  label: string;
  color?: string;
  /** Raw count of readers who applied this tag. */
  count?: number;
  /**
   * A community-only tag sitting inside an otherwise trusted-consensus section
   * (ADR 0025). Carries a subtle token-only treatment so it reads as less
   * settled than the trusted chips around it. No badge, no icon.
   */
  community?: boolean;
};

export function GenrePill({ label, color, count, community }: GenrePillProps) {
  const style = color
    ? {
        background: `${color}14`,
        color,
      }
    : undefined;
  const cls = community ? "pill pill-genre pill-community" : "pill pill-genre";
  return (
    <span className={cls} style={style}>
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="pill-conf">{count}</span>
      )}
    </span>
  );
}
