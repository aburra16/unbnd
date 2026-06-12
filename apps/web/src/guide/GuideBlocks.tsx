// Render the formatted entry anatomy (Story 84 / ADR 0081 §3).
import { Link } from "react-router-dom";
import type { Block, InlinePart } from "./format";

function Inline({ parts }: { parts: readonly InlinePart[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.kind === "link") return (
          <Link key={i} to={p.href}>
            {p.text}
          </Link>
        );
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

export function GuideBlocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "steps") {
          return (
            <ol key={i} className="guide-steps">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </ol>
          );
        }
        if (b.kind === "heading") {
          return (
            <h2 key={i} className="guide-heading">
              {b.text}
            </h2>
          );
        }
        return (
          <p key={i}>
            <Inline parts={b.parts} />
          </p>
        );
      })}
    </>
  );
}
