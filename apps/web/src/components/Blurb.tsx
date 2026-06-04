import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "@unbnd/ui";
import "./Blurb.css";

type Props = {
  blurb?: string;
  /** Bare Open Library work id (e.g. "OL45804W"). Renders the source link when present. */
  openLibraryId?: string;
};

/**
 * The book-detail blurb (ADR 0052). Clamped to four lines by default with an
 * inline Read more / Read less disclosure shown only when the clamped text
 * overflows, plus an optional Source: Open Library provenance link.
 *
 * Overflow is measured from the rendered layout (`scrollHeight > clientHeight`
 * on the clamped paragraph) rather than guessed from a character count, so it is
 * correct across font metrics and the responsive breakpoint. The measurement
 * runs in a layout effect (pre-paint, no flicker) and re-runs on blurb change
 * and on the paragraph's own resize via a ResizeObserver.
 */
export function Blurb({ blurb, openLibraryId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const paraRef = useRef<HTMLParagraphElement>(null);

  // Measure overflow against the CLAMPED height. The class toggle below keeps the
  // clamp bound to `!expanded`, but the measurement reads the element while it is
  // clamped (first run is collapsed); once expanded, `hasOverflow` stays true so
  // the Read less control stays rendered.
  useLayoutEffect(() => {
    const el = paraRef.current;
    if (!el) return;

    const measure = () => {
      setHasOverflow(el.scrollHeight > el.clientHeight);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [blurb]);

  if (!blurb) return null;

  return (
    <>
      <p
        ref={paraRef}
        className={`bh-blurb${expanded ? "" : " bh-blurb--clamped"}`}
      >
        {blurb}
      </p>
      <div className="bh-blurb-footer">
        {hasOverflow && (
          <Link
            variant="plain-amber"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Read less" : "Read more"}
          </Link>
        )}
        {openLibraryId && (
          <Link
            variant="plain-muted"
            as="a"
            href={`https://openlibrary.org/works/${openLibraryId}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Source: Open Library <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
    </>
  );
}
