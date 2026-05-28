// Session hook backed by /auth/me, per ADR 0003.
import { useCallback, useEffect, useState } from "react";
import { api, type PublicUser } from "../lib/api";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-in"; user: PublicUser }
  | { status: "signed-out" };

export type UseSession = SessionState & {
  refresh: () => void;
};

export function useSession(): UseSession {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const refresh = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    api.auth
      .me()
      .then((res) => {
        if (!cancelled) setState({ status: "signed-in", user: res.user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signed-out" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { ...state, refresh };
}
