import "./ProfileStats.css";

type Stat = {
  label: string;
  value: number;
};

type Props = {
  stats: Stat[];
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export function ProfileStats({ stats }: Props) {
  return (
    <section className="pst" aria-label="Profile stats">
      {stats.map((s) => (
        <div className="pst-cell" key={s.label}>
          <div className="pst-num">{fmt(s.value)}</div>
          <div className="pst-label">{s.label}</div>
        </div>
      ))}
    </section>
  );
}
