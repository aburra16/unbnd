import { TrustBadge, SignalPill } from "./Pill";
import type { ProfileRecord } from "../data/profile-fixtures";
import "./ProfileHeader.css";

type Props = {
  profile: ProfileRecord;
};

export function ProfileHeader({ profile }: Props) {
  return (
    <header className="ph">
      <div className="ph-row">
        <div
          className="ph-avatar"
          style={{ background: profile.avatarBg, color: profile.avatarInk }}
          aria-hidden="true"
        >
          {profile.initials}
        </div>
        <div className="ph-body">
          <div className="ph-namerow">
            <h1 className="ph-name">{profile.displayName}</h1>
            <TrustBadge label={profile.trustTier} />
            {profile.isAuthor && (
              <SignalPill label="Author verified" tone="positive" />
            )}
          </div>
          <div className="ph-handle">@{profile.handle}</div>
          <p className="ph-bio">{profile.bio}</p>
          <div className="ph-actions">
            <button className="ph-btn ph-btn-primary" type="button">
              Follow
            </button>
            <button className="ph-btn ph-btn-secondary" type="button">
              Share
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
