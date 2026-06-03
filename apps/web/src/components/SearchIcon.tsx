import { SEMANTIC_COLORS } from "@unbnd/ui";

type Props = {
  size?: number;
  stroke?: string;
};

export function SearchIcon({ size = 16, stroke = SEMANTIC_COLORS.muted }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
