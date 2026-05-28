import type {
  ProfileActivity as Activity,
  ProfileActivityKind,
} from "../data/profile-fixtures";
import "./ProfileActivity.css";

const dotColor: Record<ProfileActivityKind, string> = {
  rating: "var(--u-amber)",
  review: "var(--u-amber)",
  tag: "var(--genre-literary)",
  "ai-flag": "var(--signal-negative)",
  shelf: "var(--signal-sovereign)",
  follow: "var(--signal-positive)",
};

const kindLabel: Record<ProfileActivityKind, string> = {
  rating: "Rating",
  review: "Review",
  tag: "Tag",
  "ai-flag": "AI flag",
  shelf: "Shelf",
  follow: "Follow",
};

type Props = {
  items: Activity[];
};

export function ProfileActivity({ items }: Props) {
  return (
    <section className="pa">
      <h2 className="pa-title">Recent activity</h2>
      <ul className="pa-list">
        {items.map((it) => (
          <li className="pa-item" key={it.id}>
            <span
              className="pa-dot"
              style={{ background: dotColor[it.kind] }}
              aria-hidden="true"
            />
            <div className="pa-text">
              <span className="pa-kind">{kindLabel[it.kind]}</span>
              <span className="pa-body">{it.text}</span>
              <span className="pa-time">{it.timeLabel}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
