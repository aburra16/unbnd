// ISBN normalization, shared by the record's NIP-73 identifier and search
// lookups (Story 106 / ADR 0095 §7).

/**
 * An ISBN-13 from what a reader typed (Story 106 / ADR 0095 §7): hyphens and
 * spaces dropped, an ISBN-10 converted with the 978 prefix, and the check digit
 * verified. Anything else is null.
 */
export function isbn13Of(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  const digits13 = (d12: string) => {
    const sum = [...d12].reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
    return d12 + String((10 - (sum % 10)) % 10);
  };
  if (/^\d{13}$/.test(s)) return digits13(s.slice(0, 12)) === s ? s : null;
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, c, i) => acc + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0 ? digits13(`978${s.slice(0, 9)}`) : null;
  }
  return null;
}
