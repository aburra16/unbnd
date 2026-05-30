import "./ProfileStats.css";

type Stat = {
  label: string;
  value: number;
  // A capped cell renders as an honest floor: the numeral plus a trailing "+"
  // (e.g. "10,000+"). Absent/false ⇒ the value is exact, no "+" (ADR 0021).
  capped?: boolean;
};

type Props = {
  stats: Stat[];
};

function fmt(n: number, capped?: boolean) {
  return n.toLocaleString("en-US") + (capped ? "+" : "");
}

export function ProfileStats({ stats }: Props) {
  return (
    <section className="pst" aria-label="Profile stats">
      {stats.map((s) => (
        <div className="pst-cell" key={s.label}>
          <div className="pst-num">{fmt(s.value, s.capped)}</div>
          <div className="pst-label">{s.label}</div>
        </div>
      ))}
    </section>
  );
}
