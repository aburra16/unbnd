// The logged-in user's own profile (ADR 0012; polished in ADR 0019). Real
// identity header (avatar / name / npub from kind-0 when available); shelves
// render as cover/title/author cards; activity counts are honest — an absent
// count is hidden, never a fabricated 0. No fabricated activity feed.
import { useEffect, useState } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import {
  api,
  type ProfileStatsResponse,
  type PublicBook,
  type Shelf,
  type SubmittedBook,
} from "../lib/api";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Avatar } from "../components/Avatar";
import { BookGrid } from "../components/BookGrid";
import { ProfileStats } from "../components/ProfileStats";
import { CopyButton } from "../components/CopyButton";
import { toCardBook, shortNpub } from "../lib/view-model";
import { useSession } from "../hooks/useSession";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import "./ProfileMe.css";

// Build the stat cells from only the PRESENT fields (ADR 0019 AC-8). An absent
// field contributes no cell (the stat is hidden); a present 0 renders 0. null
// stats (the whole read failed) yields no cells at all.
function statCells(
  stats: ProfileStatsResponse | null,
): { label: string; value: number; capped: boolean }[] {
  if (!stats) return [];
  const isCapped = (key: "booksRated" | "reviews" | "tagsApplied") =>
    stats.capped?.includes(key) ?? false;
  const cells: { label: string; value: number; capped: boolean }[] = [];
  if (stats.booksRated !== undefined)
    cells.push({ label: "Books rated", value: stats.booksRated, capped: isCapped("booksRated") });
  if (stats.reviews !== undefined)
    cells.push({ label: "Reviews", value: stats.reviews, capped: isCapped("reviews") });
  if (stats.tagsApplied !== undefined)
    cells.push({ label: "Tags applied", value: stats.tagsApplied, capped: isCapped("tagsApplied") });
  return cells;
}

export function ProfileMe() {
  const session = useSession();
  const location = useLocation();
  const npub = session.status === "signed-in" ? session.user.npub : undefined;
  const meta = useProfileMeta(npub);
  const [submissions, setSubmissions] = useState<SubmittedBook[] | null>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [stats, setStats] = useState<ProfileStatsResponse | null>(null);
  // Story 31 / ADR 0032: the user's own claimed catalog books. Absent when empty.
  const [claimedBooks, setClaimedBooks] = useState<PublicBook[]>([]);

  useEffect(() => {
    if (session.status !== "signed-in") return;
    let cancelled = false;
    const ownNpub = session.user.npub;
    api.submissions
      .mine()
      .then((r) => !cancelled && setSubmissions(r.submissions))
      .catch(() => !cancelled && setSubmissions([]));
    api.shelves
      .mine()
      .then((r) => !cancelled && setShelves(r.shelves))
      .catch(() => !cancelled && setShelves([]));
    api.profile
      .meStats()
      .then((r) => !cancelled && setStats(r.stats))
      .catch(() => !cancelled && setStats(null));
    // Read by the OWN npub (the path/own rule, ADR 0020).
    api.profile
      .claimedBooks(ownNpub)
      .then((r) => !cancelled && setClaimedBooks(r.books))
      .catch(() => !cancelled && setClaimedBooks([]));
    return () => {
      cancelled = true;
    };
  }, [session.status]);

  // Deep link to the shelves section (AC-4). Scroll on hash change AND after the
  // async shelves load settles the section height; only when the hash matches.
  useEffect(() => {
    if (location.hash !== "#shelves") return;
    document.getElementById("shelves")?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash, shelves]);

  if (session.status === "loading") {
    return (
      <div className="page">
        <Nav />
        <p className="route-status" role="status">
          Loading…
        </p>
        <Footer />
      </div>
    );
  }
  if (session.status === "signed-out") {
    return <Navigate to="/auth" replace />;
  }

  const { user } = session;
  const name = displayNameOf(meta, user.displayName);

  return (
    <div className="page">
      <Nav />
      <header className="me-head">
        <Avatar label={name} seed={user.npub} picture={meta?.picture} size={72} />
        <div className="me-id">
          <h1 className="me-name">{name}</h1>
          {meta?.nip05 && <p className="me-nip05">{meta.nip05}</p>}
          {/* Tier-differentiated nostr disclosure (Story 29 / ADR 0030 §3).
              Custodial: no npub in the header; a quiet link to where it lives.
              Sovereign: a labeled, copyable middle-truncated chip, no explainer
              (the teaching lives only in Settings — Amendment §4). */}
          {user.email === null ? (
            <p className="me-npub">
              <span className="me-npub-label">npub</span>
              <code className="me-npub-chip">{shortNpub(user.npub)}</code>
              <CopyButton value={user.npub} />
            </p>
          ) : (
            <Link className="me-nostr-link" to="/settings">
              Advanced settings
            </Link>
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

      {statCells(stats).length > 0 && <ProfileStats stats={statCells(stats)} />}

      {claimedBooks.length > 0 && (
        <section className="me-activity">
          <h2 className="me-activity-title">Books by this author</h2>
          <BookGrid books={claimedBooks.map(toCardBook)} />
        </section>
      )}

      <section className="me-activity" id="shelves">
        <h2 className="me-activity-title">Your shelves</h2>
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
          <p className="me-empty">
            You have not added any books to a shelf yet.
          </p>
        )}
      </section>

      <section className="me-activity">
        <h2 className="me-activity-title">Your submissions</h2>
        {submissions && submissions.length > 0 ? (
          <ul className="me-subs">
            {submissions.map((s) => (
              <li className="me-sub" key={s.slug}>
                <span className="me-sub-title">{s.title}</span>
                <span className="me-sub-meta">
                  {s.authorName}
                  {s.publishYear ? ` · ${s.publishYear}` : ""} · pending review
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="me-empty">
            No submissions yet. <a href="/submit">Add a book</a> and it will show
            up here.
          </p>
        )}
      </section>
      <Footer />
    </div>
  );
}
