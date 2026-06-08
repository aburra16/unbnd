// The one shared copy affordance (Story 29 / ADR 0030 §1, F1-A). A real
// <button> so it is keyboard-focusable and Enter/Space-activatable for free.
// It copies the FULL value passed in (callers may display a truncated chip; the
// full string is always what reaches the clipboard). The copied state is
// announced via a sibling role="status" region so the accessible name stays
// stable. A rejected promise or an absent navigator.clipboard never throws — it
// shows a transient "Copy failed" instead. No timestamp is rendered, so the
// asserted output is the label text alone.
import { useEffect, useRef, useState } from "react";
import { Button } from "@unbnd/ui";
import "./CopyButton.css";

const REVERT_MS = 1500;

export function CopyButton({
  value,
  label = "Copy",
  // Accessible name. Defaults to the original npub caller's label for back-compat
  // (Story 29); pass an explicit one for other copy targets (e.g. the nsec).
  ariaLabel = "Copy your npub",
}: {
  value: string;
  label?: string;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function onCopy() {
    if (timer.current) clearTimeout(timer.current);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "failed");
    timer.current = setTimeout(() => setState("idle"), REVERT_MS);
  }

  // The transient feedback ("Copied" / "Copy failed") lives in a single
  // role="status" node so it is both visible AND announced once — never
  // duplicated. The button keeps a stable visible label and accessible name.
  const status =
    state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "";

  return (
    <span className="copy-btn-wrap">
      <Button
        variant="secondary"
        size="sm"
        className="copy-btn"
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          void onCopy();
        }}
      >
        {label}
      </Button>
      <span className="copy-btn-status" role="status" aria-live="polite">
        {status}
      </span>
    </span>
  );
}
