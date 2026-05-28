// Session hook backed by /auth/me, per ADR 0003. Stub throws until wired.
import type { PublicUser } from "../lib/api";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-in"; user: PublicUser }
  | { status: "signed-out" };

export type UseSession = SessionState & {
  refresh: () => void;
};

export function useSession(): UseSession {
  throw new Error("useSession not implemented");
}
