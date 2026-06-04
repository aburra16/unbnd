// Signed-in account control (ADR 0012; nav added in ADR 0019): avatar button →
// dropdown with the identity, "Your profile", "Your shelves" (deep link), and
// Sign out. Closes on outside-click / Escape.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PublicUser } from "../lib/api";
import { useProfileMeta, displayNameOf } from "../hooks/useProfileMeta";
import { Avatar } from "./Avatar";
import { Button, IconButton } from "@unbnd/ui";
import "./AccountMenu.css";

type Props = {
  user: PublicUser;
  onSignedOut: () => void;
};

function shortNpub(npub: string): string {
  return npub.length <= 16 ? npub : `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

export function AccountMenu({ user, onSignedOut }: Props) {
  const meta = useProfileMeta(user.npub);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = displayNameOf(meta, user.displayName);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    try {
      await api.auth.logout();
    } catch {
      // logout is best-effort; clear the UI regardless.
    } finally {
      setOpen(false);
      setBusy(false);
      onSignedOut();
    }
  }

  return (
    <div className="acct" ref={ref}>
      <IconButton
        variant="bare"
        shape="circle"
        className="acct-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name} — account menu`}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar label={name} seed={user.npub} picture={meta?.picture} size={30} />
      </IconButton>
      {open && (
        <div className="acct-menu" role="menu">
          <Link className="acct-id" to="/profile/me" role="menuitem" onClick={() => setOpen(false)}>
            <Avatar label={name} seed={user.npub} picture={meta?.picture} size={36} />
            <span className="acct-id-text">
              <span className="acct-name">{name}</span>
              <span className="acct-npub">{shortNpub(user.npub)}</span>
            </span>
          </Link>
          <Link className="acct-item" to="/profile/me" role="menuitem" onClick={() => setOpen(false)}>
            Your profile
          </Link>
          <Link className="acct-item" to="/profile/me#shelves" role="menuitem" onClick={() => setOpen(false)}>
            Your shelves
          </Link>
          <Link className="acct-item" to="/settings" role="menuitem" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <Button
            variant="ghost"
            block
            className="acct-signout"
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
          >
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      )}
    </div>
  );
}
