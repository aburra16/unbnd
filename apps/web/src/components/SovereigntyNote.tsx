import "./SovereigntyNote.css";

type Props = {
  tone: "amber" | "sovereign" | "positive";
  children: React.ReactNode;
};

export function SovereigntyNote({ tone, children }: Props) {
  return (
    <div className={`sov sov-${tone}`}>
      <span className="sov-dot" aria-hidden="true" />
      <p className="sov-text">{children}</p>
    </div>
  );
}
