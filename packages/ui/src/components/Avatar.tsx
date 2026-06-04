// Identity avatar (ADR 0012): renders the kind-0 picture when present, else a
// deterministic initials circle. A dead picture URL falls back to initials.
import { useState } from "react";
import { GENRE_PALETTE } from "../palette";
import "./Avatar.css";

// Derived from the single palette source (ADR 0040 §3). Order preserved, so the
// hash → color mapping is byte-identical to the former inline arrays.
const BGS = GENRE_PALETTE.map((r) => r.bg);
const INKS = GENRE_PALETTE.map((r) => r.ink);

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function initialsOf(label: string): string {
  const cleaned = label.replace(/^npub1/, "");
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  if (parts.length === 1 && !/^npub1/.test(label)) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export type AvatarProps = {
  /** Best display name available (kind-0 name → display name → npub). */
  label: string;
  /** Seed for the deterministic colour — use the npub so it's stable. */
  seed: string;
  picture?: string;
  size?: number;
};

export function Avatar({ label, seed, picture, size = 30 }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const idx = hash(seed) % BGS.length;
  const dim = { width: size, height: size, fontSize: Math.round(size * 0.4) };

  if (picture && !broken) {
    return (
      <img
        className="avatar avatar-img"
        src={picture}
        alt=""
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="avatar avatar-initials"
      style={{ ...dim, background: BGS[idx], color: INKS[idx] }}
      aria-hidden="true"
    >
      {initialsOf(label)}
    </span>
  );
}
