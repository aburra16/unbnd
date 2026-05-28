import "./Pagination.css";

type Props = {
  current: number;
  totalPages: number;
  onChange?: (page: number) => void;
};

function pagesToShow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...set]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
      out.push("…");
    }
  }
  return out;
}

export function Pagination({ current, totalPages, onChange }: Props) {
  const items = pagesToShow(current, totalPages);
  return (
    <nav className="pag" aria-label="Pagination">
      <button
        type="button"
        className="pag-arrow"
        disabled={current <= 1}
        onClick={() => onChange?.(Math.max(1, current - 1))}
        aria-label="Previous page"
      >
        ←
      </button>
      {items.map((item, i) =>
        item === "…" ? (
          <span key={`g-${i}`} className="pag-gap">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pag-num ${item === current ? "pag-num-active" : ""}`}
            onClick={() => onChange?.(item)}
            aria-current={item === current ? "page" : undefined}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="pag-arrow"
        disabled={current >= totalPages}
        onClick={() => onChange?.(Math.min(totalPages, current + 1))}
        aria-label="Next page"
      >
        →
      </button>
    </nav>
  );
}
