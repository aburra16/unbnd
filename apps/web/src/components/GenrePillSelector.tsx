import "./GenrePillSelector.css";

type Option = {
  slug: string;
  label: string;
};

type Props = {
  options: Option[];
  selected: string[];
  onToggle: (slug: string) => void;
  max?: number;
};

export function GenrePillSelector({
  options,
  selected,
  onToggle,
  max = 3,
}: Props) {
  return (
    <div className="gps">
      {options.map((o) => {
        const isOn = selected.includes(o.slug);
        const disabled = !isOn && selected.length >= max;
        return (
          <button
            key={o.slug}
            type="button"
            className={`gps-pill ${isOn ? "gps-on" : ""} ${disabled ? "gps-off" : ""}`}
            disabled={disabled}
            onClick={() => onToggle(o.slug)}
            aria-pressed={isOn}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
