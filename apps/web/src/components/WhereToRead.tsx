import type { WhereToRead as Link } from "../data/book-fixtures";
import "./WhereToRead.css";

type Props = {
  links: Link[];
};

export function WhereToRead({ links }: Props) {
  return (
    <section className="wtr">
      <h2 className="wtr-title">Where to read</h2>
      <ul className="wtr-list">
        {links.map((l) => (
          <li key={l.label}>
            <a
              className="wtr-link"
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="wtr-label">{l.label}</span>
              <span className="wtr-source">{l.source}</span>
              <span className="wtr-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="wtr-note">Unbnd does not sell books. Links go to outside sites.</p>
    </section>
  );
}
