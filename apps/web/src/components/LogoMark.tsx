type Props = {
  size?: number;
  fill?: string;
  opacityScheme?: "solid" | "soft";
  title?: string;
};

export function LogoMark({
  size = 26,
  fill = "#C4763C",
  opacityScheme = "solid",
  title = "Unbnd",
}: Props) {
  const cornerOpacity = opacityScheme === "soft" ? 0.85 : 1;
  const circleOpacity = opacityScheme === "soft" ? 0.7 : 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <path
        d="M4 46 Q4 4 46 4 L46 46 Z"
        fill={fill}
        fillOpacity={cornerOpacity}
      />
      <circle cx="72" cy="26" r="18" fill={fill} fillOpacity={circleOpacity} />
      <circle cx="26" cy="72" r="18" fill={fill} fillOpacity={circleOpacity} />
      <path
        d="M54 54 L54 96 Q96 96 96 54 Z"
        fill={fill}
        fillOpacity={cornerOpacity}
      />
    </svg>
  );
}
