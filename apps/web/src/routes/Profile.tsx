// Any user's public profile, by npub (ADR 0020). The by-npub twin of
// /profile/me: identity header from the target's kind-0 (or an honest initials +
// npub fallback), their public shelves as an enriched cover/title/author grid,
// and honest activity counts — all read by the path npub, never the viewer's
// session. An unresolvable npub renders NotFound; a valid-but-empty profile
// renders the header + empty states. The Mira fixture is retired.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  api,
  type ProfileStatsResponse,
  type Shelf,
} from "../lib/api";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Avatar } from "../components/Avatar";
import { BookGrid } from "../components/BookGrid";
import { ProfileStats } from "../components/ProfileStats";
import { toCardBook, shortNpub } from "../lib/view-model";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import { NotFound } from "./NotFound";
import "./ProfileMe.css";

// Build the stat cells from only the PRESENT fields (ADR 0019 AC-8, reused for
// the target). An absent field contributes no cell; a present 0 renders 0.
function statCells(
  stats: ProfileStatsResponse | null,
): { label: string; value: number }[] {
  if (!stats) return [];
  const cells: { label: string; value: number }[] = [];
  if (stats.booksRated !== undefined)
    cells.push({ label: "Books rated", value: stats.booksRated });
  if (stats.reviews !== undefined)
    cells.push({ label: "Reviews", value: stats.reviews });
  if (stats.tagsApplied !== undefined)
    cells.push({ label: "Tags applied", value: stats.tagsApplied });
  return cells;
}

function is404(err: unknown): boolean {
  return Boolean(err) && (err as { status?: number }).status === 404;
}

export function Profile() {
  const { npub } = useParams<{ npub: string }>();
  const meta = useProfileMeta(npub);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [stats, setStats] = useState<ProfileStatsResponse | null>(null);
  // NotFound only when the npub is unresolvable — the twins answer 404 (AC-6).
  // A valid-but-empty profile leaves this false and renders the empty states.
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!npub) return;
    let cancelled = false;
    setNotFound(false);
    api.profile
      .shelves(npub)
      .then((r) => !cancelled && setShelves(r.shelves))
      .catch((err) => {
        if (cancelled) return;
        if (is404(err)) setNotFound(true);
        setShelves([]);
      });
    api.profile
      .stats(npub)
      .then((r) => !cancelled && setStats(r.stats))
      .catch((err) => {
        if (cancelled) return;
        if (is404(err)) setNotFound(true);
        setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [npub]);

  if (notFound) return <NotFound />;

  // With no kind-0, fall back to a short npub for the heading so the FULL npub
  // appears once (in the identity line below) — no fabricated name (AC-2).
  const name = displayNameOf(meta, npub ? shortNpub(npub) : "");
  const cells = statCells(stats);

  return (
    <div className="page">
      <Nav />
      <header className="me-head">
        <Avatar label={name} seed={npub ?? ""} picture={meta?.picture} size={72} />
        <div className="me-id">
          <h1 className="me-name">{name}</h1>
          {meta?.nip05 && <p className="me-nip05">{meta.nip05}</p>}
          {npub && (
            <p className="me-npub" title={npub}>
              {npub}
            </p>
          )}
          {meta?.about && <p className="me-about">{meta.about}</p>}
          {meta?.substack && (
            <a
              className="me-substack"
              href={meta.substack}
              target="_blank"
              rel="noopener noreferrer"
            >
              Writes on Substack ↗
            </a>
          )}
        </div>
      </header>

      {cells.length > 0 && <ProfileStats stats={cells} />}

      <section className="me-activity">
        <h2 className="me-activity-title">Shelves</h2>
        {shelves && shelves.length > 0 ? (
          <ul className="me-shelves">
            {shelves.map((s) => (
              <li className="me-shelf" key={s.slug}>
                <div className="me-shelf-head">
                  <span className="me-shelf-name">{s.name}</span>
                  <span className="me-shelf-count">{s.count}</span>
                </div>
                <BookGrid books={s.books.map(toCardBook)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="me-empty">No public shelves yet.</p>
        )}
      </section>
      <Footer />
    </div>
  );
}
