import "./ActionBar.css";

const actions = [
  { id: "rate", label: "Rate", primary: true },
  { id: "want-to-read", label: "Want to read" },
  { id: "review", label: "Write a review" },
  { id: "tag", label: "Add genre tags" },
  { id: "share", label: "Share" },
];

export function ActionBar() {
  return (
    <div className="actions">
      {actions.map((a) => (
        <button
          key={a.id}
          className={`action ${a.primary ? "action-primary" : ""}`}
          type="button"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
