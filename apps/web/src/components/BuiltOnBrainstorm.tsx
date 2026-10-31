// "Built on Brainstorm" (Story 113 / ADR 0101): Brainstorm's shared line,
// <built-on-brainstorm>, from ./built-on-brainstorm.js, a copy of Brainstorm's
// file as it is (pinned by its hash in the tests). The element draws the link,
// the mark and the words in its own shadow root and takes its look from
// brainstorm.world. Unbnd gives it its colours and size through the element's
// properties (BuiltOnBrainstorm.css) and sits it in a frame that bounds what
// that look can draw. This is the one place the app draws or loads it.
import "./built-on-brainstorm.js";
import "./BuiltOnBrainstorm.css";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      // React 18 passes `class` to a custom element as it is, and sets
      // `className` as an attribute of that name, which no style matches.
      "built-on-brainstorm": { class?: string };
    }
  }
}

export function BuiltOnBrainstorm({ className }: { className?: string }) {
  return (
    <span className={className ? `built-on ${className}` : "built-on"}>
      <built-on-brainstorm class="built-on-line" />
    </span>
  );
}
