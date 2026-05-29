// The logged-in user's own profile (ADR 0012). Real identity header (avatar /
// name / npub from kind-0 when available); activity is honest empty states —
// no fabricated data. Real activity is a later story.
import { Navigate } from "react-router-dom";
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
        <h2 className="me-activity-title">Activity</h2>
        <p className="me-empty">
          Nothing here yet. Rate or classify a book and it will show up on your
          profile.
        </p>
      </section>
      <Footer />
    </div>
  );
}
