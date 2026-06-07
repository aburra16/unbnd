// Story 68 / ADR 0067 — the "Vouch as curator" control on a profile. Clones the
// FollowButton write pattern: rendered only when signed-in, vouch-eligible
// (api.profile.meCurator.canVouch), and viewing another profile. Toggles
// Vouch / Vouched (withdraw = a dispute); optimistic with revert on failure.
import { useEffect, useState } from "react";
import { Button } from "@unbnd/ui";
import { useSession } from "../hooks/useSession";
import { api, type SignedEvent } from "../lib/api";

type Nostr = { signEvent: (template: unknown) => Promise<SignedEvent> };

export function VouchButton({ target }: { target: string }) {
  const session = useSession();
  const signedIn = session.status === "signed-in";
  const isSelf = session.status === "signed-in" && session.user.npub === target;
  const isSovereign = session.status === "signed-in" && session.user.email === null;

  const [canVouch, setCanVouch] = useState(false);
  const [vouched, setVouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || isSelf) {
      setCanVouch(false);
      return;
    }
    let cancelled = false;
    api.profile
      .meCurator()
      .then((r) => !cancelled && setCanVouch(r.canVouch))
      .catch(() => !cancelled && setCanVouch(false));
    api.profile
      .vouchStatus(target)
      .then((r) => !cancelled && setVouched(r.vouched))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, isSelf, target]);

  if (!signedIn || isSelf || !canVouch) return null;

  const action = vouched ? "withdraw" : "vouch";
  const onClick = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const next = !vouched;
    setVouched(next); // optimistic
    try {
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nostr }).nostr;
        if (!nostr) throw new Error("no nostr extension");
        const { template } = await api.profile.vouchTemplate({ subject: target, action });
        const signed = await nostr.signEvent(template);
        await api.profile.vouch(signed);
      } else {
        await api.profile.vouchCustodial({ subject: target, action });
      }
    } catch {
      setVouched(!next); // revert
      setError("Could not record your vouch. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" type="button" aria-pressed={vouched} onClick={onClick}>
        {vouched ? "Vouched" : "Vouch as curator"}
      </Button>
      {error && (
        <span role="alert" className="vouch-error">
          {error}
        </span>
      )}
    </>
  );
}
