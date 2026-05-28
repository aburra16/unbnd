// Password + email validation per ADR 0003.

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 4096;
export const EMAIL_MAX = 254;
export const DISPLAY_NAME_MAX = 100;

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const ok: ValidationResult = { ok: true };
const fail = (message: string): ValidationResult => ({ ok: false, message });

/** Validates length is within [PASSWORD_MIN, PASSWORD_MAX]. No composition rules. */
export function validatePassword(password: string): ValidationResult {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return fail(`Password must be at least ${PASSWORD_MIN} characters.`);
  }
  if (password.length > PASSWORD_MAX) {
    return fail(`Password must be at most ${PASSWORD_MAX} characters.`);
  }
  return ok;
}

// Pragmatic single-@ check with non-empty local part and a dotted domain.
// Full RFC 5322 validation is not the goal; the real gate is email
// verification, a later story.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates a syntactically plausible email of length <= EMAIL_MAX. */
export function validateEmail(email: string): ValidationResult {
  if (typeof email !== "string" || email.length === 0) {
    return fail("Email is required.");
  }
  if (email.length > EMAIL_MAX) {
    return fail(`Email must be at most ${EMAIL_MAX} characters.`);
  }
  if (!EMAIL_RE.test(email)) {
    return fail("Enter a valid email address.");
  }
  return ok;
}

/** Lowercases and trims an email for consistent storage / lookup. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Validates a display name of length [1, DISPLAY_NAME_MAX]. */
export function validateDisplayName(name: string): ValidationResult {
  if (typeof name !== "string" || name.trim().length === 0) {
    return fail("Display name is required.");
  }
  if (name.length > DISPLAY_NAME_MAX) {
    return fail(`Display name must be at most ${DISPLAY_NAME_MAX} characters.`);
  }
  return ok;
}
