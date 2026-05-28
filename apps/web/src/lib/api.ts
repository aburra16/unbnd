// Thin fetch wrapper for the apps/api auth endpoints, per ADR 0003.
// In dev the Vite proxy routes /auth/* to localhost:8787, so base is "".
// Stub bodies throw until the Implementer wires them.

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  npub: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  auth: {
    signup(_input: {
      email: string;
      password: string;
      displayName: string;
    }): Promise<{ user: PublicUser }> {
      throw new Error("api.auth.signup not implemented");
    },
    login(_input: {
      email: string;
      password: string;
    }): Promise<{ user: PublicUser }> {
      throw new Error("api.auth.login not implemented");
    },
    logout(): Promise<void> {
      throw new Error("api.auth.logout not implemented");
    },
    me(): Promise<{ user: PublicUser }> {
      throw new Error("api.auth.me not implemented");
    },
  },
};
