// A guide section page (Story 84 / ADR 0081 §2): the entry list, the side
// rail, the entries under their stable authored anchors, next/previous links
// over the published order. Unknown or empty sections land on /guide (the
// landing is the recovery point; never an error page from inside the guide).
import { useEffect } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { Container } from "@unbnd/ui";
import { useGuide } from "../guide/GuideContext";
import { formatBody } from "../guide/format";
import { GuideBlocks } from "../guide/GuideBlocks";
import "./Guide.css";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { GuideTree } from "../guide/GuideTree";
import { useActiveEntry } from "../guide/useActiveEntry";

export function GuideSection() {
  const { section } = useParams();
  const { hash } = useLocation();
  const guide = useGuide();
  const idx = guide.published.findIndex((s) => s.slug === section);
  const current = idx === -1 ? undefined : guide.published[idx];
  const activeAnchor = useActiveEntry(
    current ? current.entries.map((e) => e.anchor) : [],
  );

  // Scroll to the anchored entry after render; a bad anchor stays at the top.
  useEffect(() => {
    if (!hash || !current) return;
    const target = document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView();
  }, [hash, current]);

  if (!current) return <Navigate to="/guide" replace />;

  const prev = idx > 0 ? guide.published[idx - 1] : undefined;
  const next = idx < guide.published.length - 1 ? guide.published[idx + 1] : undefined;

  return (
    <Container>
      <Nav />
      <div className="guide-section">
        <GuideTree
          sections={guide.published}
          currentSlug={current.slug}
          activeAnchor={activeAnchor}
        />
        <div className="guide-measure">
          <p className="guide-crumb">
            <Link to="/guide">The Reader's Guide</Link>
          </p>
          <h1 className="guide-title">{current.title}</h1>
          {current.entries.map((e) => (
            <section key={e.anchor} id={e.anchor} className="guide-entry">
              <h2 className="guide-entry-name">{e.name}</h2>
              <GuideBlocks blocks={formatBody(e.body)} />
              {e.related.length > 0 && (
                <p className="guide-related">
                  Related:{" "}
                  {e.related.map((ref, i) => {
                    const [sec, anchor] = ref.split("#");
                    const target = guide.published
                      .find((s) => s.slug === sec)
                      ?.entries.find((x) => x.anchor === anchor);
                    return (
                      <span key={ref}>
                        {i > 0 && " · "}
                        <Link to={`/guide/${sec}#${anchor}`}>{target?.name ?? anchor}</Link>
                      </span>
                    );
                  })}
                </p>
              )}
            </section>
          ))}
          <div className="guide-walk">
            {prev ? <Link to={`/guide/${prev.slug}`}>{prev.title}</Link> : <span />}
            {next ? <Link to={`/guide/${next.slug}`}>{next.title}</Link> : <span />}
          </div>
        </div>
      </div>
      <Footer />
    </Container>
  );
}
