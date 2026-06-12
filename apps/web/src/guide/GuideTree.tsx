// The docs tree (Story 94 / ADR 0085): one frozen contents tree on every
// guide page. Native <details> disclosure carries the expand/collapse
// semantics; the current section opens on arrival; the active entry link
// carries aria-current="location" and the highlight keys off the attribute.
import { Link } from "react-router-dom";
import type { GuideSection } from "./load";

export function GuideTree({
  sections,
  currentSlug,
  activeAnchor,
}: {
  sections: readonly GuideSection[];
  currentSlug?: string;
  activeAnchor?: string;
}) {
  return (
    <nav className="guide-tree guide-rail" aria-label="Guide contents">
      {sections.map((s) => {
        const current = s.slug === currentSlug;
        return (
          <details key={s.slug} open={current}>
            <summary className={current ? "guide-tree-current" : undefined}>
              {s.title}
            </summary>
            {s.entries.map((e) => {
              const active = current && e.anchor === activeAnchor;
              return (
                <Link
                  key={e.anchor}
                  to={`/guide/${s.slug}#${e.anchor}`}
                  aria-current={active ? "location" : undefined}
                >
                  {e.name}
                </Link>
              );
            })}
          </details>
        );
      })}
    </nav>
  );
}
