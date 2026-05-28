import { useState } from "react";
import type { CuratorDot } from "../data/genre-fixtures";
import "./GenreControls.css";

const sortOptions = [
  { value: "trust-rating", label: "Trust-weighted rating" },
  { value: "recent", label: "Most recent" },
  { value: "pub-year", label: "Publication year" },
  { value: "most-reviewed", label: "Most reviewed" },
];

type Props = {
  topCurators: CuratorDot[];
  totalCurators?: number;
};

export function GenreControls({ topCurators, totalCurators }: Props) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const stackable = topCurators.slice(0, 3);
  const extra = (totalCurators ?? topCurators.length) - stackable.length;
  return (
    <div className="gctrl">
      <div className="gctrl-left">
        <label className="gctrl-sort">
          <span className="gctrl-sort-label">Sort</span>
          <select defaultValue="trust-rating">
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="gctrl-curators" aria-label="Top curators in this genre">
          <div className="gctrl-stack">
            {stackable.map((c) => (
              <span
                key={c.initials}
                className="gctrl-dot"
                style={{ background: c.bg, color: c.ink }}
                title={`${c.initials} · ${c.trustTier}`}
                aria-hidden="true"
              >
                {c.initials}
              </span>
            ))}
          </div>
          <span className="gctrl-cur-label">
            {extra > 0 ? `+${extra} curators active here` : "active curators"}
          </span>
        </div>
      </div>
      <div
        className="gctrl-view"
        role="tablist"
        aria-label="Layout"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "grid"}
          className={`gctrl-vbtn ${view === "grid" ? "gctrl-vbtn-active" : ""}`}
          onClick={() => setView("grid")}
        >
          Grid
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "list"}
          className={`gctrl-vbtn ${view === "list" ? "gctrl-vbtn-active" : ""}`}
          onClick={() => setView("list")}
        >
          List
        </button>
      </div>
    </div>
  );
}
