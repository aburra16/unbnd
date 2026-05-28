import type { GenreAffinity as GA } from "../data/profile-fixtures";
import "./GenreAffinity.css";

type Props = {
  title?: string;
  affinity: GA[];
};

export function GenreAffinity({ title = "Genre affinity", affinity }: Props) {
  const max = Math.max(1, ...affinity.map((a) => a.count));
  return (
    <section className="ga">
      <h2 className="ga-title">{title}</h2>
      <div className="ga-rows">
        {affinity.map((a) => {
          const pct = Math.round((a.count / max) * 100);
          return (
            <div className="ga-row" key={a.slug}>
              <span className="ga-label">{a.label}</span>
              <span className="ga-track">
                <span
                  className="ga-fill"
                  style={{ width: `${pct}%`, background: a.color }}
                />
              </span>
              <span className="ga-count">{a.count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
