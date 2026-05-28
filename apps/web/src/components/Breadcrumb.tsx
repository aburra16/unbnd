import { Link } from "react-router-dom";
import "./Breadcrumb.css";

export type Crumb = {
  label: string;
  to?: string;
};

type Props = {
  trail: Crumb[];
};

export function Breadcrumb({ trail }: Props) {
  return (
    <nav className="crumb" aria-label="Breadcrumb">
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span className="crumb-item" key={`${c.label}-${i}`}>
            {c.to && !last ? (
              <Link to={c.to}>{c.label}</Link>
            ) : (
              <span className={last ? "crumb-current" : undefined}>
                {c.label}
              </span>
            )}
            {!last && <span className="crumb-sep">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
