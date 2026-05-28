import "./ToggleSwitch.css";

type Props = {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
};

export function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  description,
}: Props) {
  return (
    <label className="toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="toggle-input"
      />
      <span
        className={`toggle-track ${checked ? "toggle-on" : ""}`}
        aria-hidden="true"
      >
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
    </label>
  );
}
