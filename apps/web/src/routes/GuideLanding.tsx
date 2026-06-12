// The guide landing (Story 84 / ADR 0081 §2). Until #85 lands the narrative,
// it carries the title and the contents of published sections only; #85
// replaces the spare opening with the start-here narrative.
import { Link } from "react-router-dom";
import { useGuide } from "../guide/GuideContext";
import { formatBody } from "../guide/format";
import { GuideBlocks } from "../guide/GuideBlocks";
import "./Guide.css";
import { GuideTree } from "../guide/GuideTree";
import { PageShell } from "../components/PageShell";

export function GuideLanding() {
  const guide = useGuide();
  return (
    <PageShell>
      <div className="guide-section">
        <GuideTree sections={guide.published} />
        <div className="guide-measure">
        <h1 className="guide-title">The Reader's Guide</h1>
        {guide.landing !== undefined && (
          <GuideBlocks blocks={formatBody(guide.landing)} />
        )}
        {guide.published.length > 0 && (
          <nav className="guide-toc" aria-label="Guide contents">
            {guide.published.map((s) => (
              <div key={s.slug} className="guide-toc-section">
                <Link to={`/guide/${s.slug}`} className="guide-toc-title">
                  {s.title}
                </Link>
                <span className="guide-toc-entries">
                  {s.entries.map((e, i) => (
                    <span key={e.anchor}>
                      {i > 0 && " · "}
                      <Link to={`/guide/${s.slug}#${e.anchor}`} className="guide-toc-entry">
                        {e.name}
                      </Link>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </nav>
        )}
      </div>
      </div>
    </PageShell>
  );
}
