// The logged-in user's own profile (ADR 0012). Real identity header (avatar /
// name / npub from kind-0 when available); activity is honest empty states —
// no fabricated data. Real activity is a later story.
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, type Shelf, type SubmittedBook } from "../lib/api";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Avatar } from "../components/Avatar";
import { ProfileStats } from "../components/ProfileStats";
import { useSession } from "../hooks/useSession";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import "./ProfileMe.css";

export function ProfileMe() {
  const session = useSession();
  const npub = session.status === "signed-in" ? session.user.npub : undefined;
  const meta = useProfileMeta(npub);
  const [submissions, setSubmissions] = useState<SubmittedBook[] | null>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);

  useEffect(() => {
    if (session.status !== "signed-in") return;
    let cancelled = false;
    api.submissions
      .mine()
      .then((r) => !cancelled && setSubmissions(r.submissions))
      .catch(() => !cancelled && setSubmissions([]));
    api.shelves
      .mine()
      .then((r) => !cancelled && setShelves(r.shelves))
      .catch(() => !cancelled && setShelves([]));
    return () => {
      cancelled = true;
    };
  }, [session.status]);

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
          <p className="me-npub" title={user.npub}>
            {user.npub}
          </p>
          {meta?.about && <p className="me-about">{meta.about}</p>}
        </div>
      </header>

      <ProfileStats
        stats={[
          { label: "Books rated", value: 0 },
          { label: "Reviews", value: 0 },
          { label: "Tags applied", value: 0 },
        ]}
      />

      <section className="me-activity">
        <h2 className="me-activity-title">Your shelves</h2>
        {shelves && shelves.length > 0 ? (
          <ul className="me-shelves">
            {shelves.map((s) => (
              <li className="me-shelf" key={s.slug}>
                <div className="me-shelf-head">
                  <span className="me-shelf-name">{s.name}</span>
                  <span className="me-shelf-count">{s.count}</span>
                </div>
                <ul className="me-shelf-books">
                  {s.books.map((b) => (
                    <li className="me-shelf-book" key={b.bookSlug}>
                      <a href={`/book/${b.bookSlug}`}>{b.bookSlug}</a>
                    </li>
                  ))}
                </ul>
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
