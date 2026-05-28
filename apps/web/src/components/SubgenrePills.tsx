import { useState } from "react";
import "./SubgenrePills.css";

type Subgenre = { slug: string; label: string };

type Props = {
  subgenres: Subgenre[];
  activeSlug?: string;
};

export function SubgenrePills({ subgenres, activeSlug = "all" }: Props) {
  const [active, setActive] = useState(activeSlug);
  return (
    <div className="subs" role="tablist" aria-label="Subgenres">
      {subgenres.map((s) => {
        const isActive = s.slug === active;
        return (
          <button
            key={s.slug}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`sub ${isActive ? "sub-active" : ""}`}
            onClick={() => setActive(s.slug)}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
