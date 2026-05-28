// Password + email validation per ADR 0003. Stubs throw until implemented.

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 4096;

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/** Validates length is within [PASSWORD_MIN, PASSWORD_MAX]. No composition rules. */
export function validatePassword(_password: string): ValidationResult {
  throw new Error("validatePassword not implemented");
}

/** Validates a syntactically plausible email of length <= 254. */
export function validateEmail(_email: string): ValidationResult {
  throw new Error("validateEmail not implemented");
}

/** Lowercases and trims an email for consistent storage / lookup. */
export function normalizeEmail(_email: string): string {
  throw new Error("normalizeEmail not implemented");
}

/** Validates a display name of length [1, 100]. */
export function validateDisplayName(_name: string): ValidationResult {
  throw new Error("validateDisplayName not implemented");
}
