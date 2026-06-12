// Scroll-spy for the guide tree (Story 94 / ADR 0085 §4): the topmost entry
// heading in view wins; the URL hash is the initial value. Environments
// without IntersectionObserver (happy-dom in tests) keep the hash value —
// that fallback is the testable contract.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function useActiveEntry(anchors: readonly string[]): string | undefined {
  const { hash } = useLocation();
  const fromHash = hash ? hash.slice(1) : undefined;
  const [active, setActive] = useState<string | undefined>(fromHash);

  useEffect(() => {
    setActive(fromHash ?? anchors[0]);
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (changes) => {
        for (const c of changes) {
          if (c.isIntersecting) visible.add(c.target.id);
          else visible.delete(c.target.id);
        }
        // Topmost in published order wins; nothing in view keeps the last value.
        const top = anchors.find((a) => visible.has(a));
        if (top) setActive(top);
      },
      // The reading band: an entry counts once its heading area enters the
      // upper part of the viewport.
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const a of anchors) {
      const el = document.getElementById(a);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // anchors come from the published manifest, stable per section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromHash, anchors.join(",")]);

  return active;
}
