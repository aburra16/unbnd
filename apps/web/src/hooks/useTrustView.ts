// Trust perspective + self-serve personalization (ADR 0014, Phase B). Resolves
// whether the signed-in sovereign user has GrapeRank scores, drives the
// House⇄Yours view, and runs the in-app Personalize trigger (NIP-07 signs the
// Brainstorm challenge; ~5–6 min build, polled until scores land).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type SignedEvent } from "../lib/api";
import { useSession } from "./useSession";

export type TrustView = "house" | "yours";
export type TrustStatus =
  | "loading"
  | "house-only" // signed-out / custodial / trust disabled
  | "ready" // sovereign with scores → can toggle Yours
  | "none" // sovereign, no scores yet → can Personalize
  | "building"; // calc running

type Nip07 = {
  signEvent: (t: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

const POLL_MS = 20_000;

export function useTrustView() {
  const session = useSession();
  const sovereign = session.status === "signed-in" && session.user.email === null;
  const npub = session.status === "signed-in" ? session.user.npub : undefined;

  const [status, setStatus] = useState<TrustStatus>("loading");
  const [view, setView] = useState<TrustView>("house");
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (session.status === "loading") return;
    if (!sovereign) {
      setStatus("house-only");
      return;
    }
    let cancelled = false;
    api.trust
      .status()
      .then((s) => {
        if (cancelled) return;
        if (!s.enabled || !s.canPersonalize) setStatus("house-only");
        else setStatus(s.hasScores ? "ready" : "none");
      })
      .catch(() => !cancelled && setStatus("house-only"));
    return () => {
      cancelled = true;
    };
  }, [session.status, sovereign]);

  // Poll while a calc is building.
  useEffect(() => {
    if (status !== "building") return;
    poll.current = setInterval(() => {
      api.trust.status().then((s) => {
        if (s.hasScores) {
          setStatus("ready");
          setView("yours");
        }
      }).catch(() => {});
    }, POLL_MS);
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [status]);

  const personalize = useCallback(async () => {
    setError(null);
    try {
      const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
      if (!nostr) {
        setError("No Nostr extension found.");
        return;
      }
      const { challenge } = await api.trust.challenge();
      const signed = await nostr.signEvent({
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["challenge", challenge], ["t", "brainstorm_login"]],
        content: "",
      });
      await api.trust.personalize(signed);
      setStatus("building");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start personalization.");
    }
  }, []);

  return { status, view, setView, personalize, error, npub };
}
