import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  validateDisplayName,
  validateEmail,
  validatePassword,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from "../../src/auth/passwords";

describe("validatePassword", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN - 1)).ok).toBe(false);
  });

  it("accepts a password at the minimum length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN)).ok).toBe(true);
  });

  it("accepts a password at the maximum length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MAX)).ok).toBe(true);
  });

  it("rejects a password over the maximum length (anti-DOS)", () => {
    expect(validatePassword("a".repeat(PASSWORD_MAX + 1)).ok).toBe(false);
  });

  it("imposes no composition rules (a long all-lowercase password is fine)", () => {
    expect(validatePassword("abcdefghijklmnop").ok).toBe(true);
  });
});

describe("validateEmail", () => {
  it("accepts a plausible email", () => {
    expect(validateEmail("reader@example.com").ok).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(validateEmail("not-an-email").ok).toBe(false);
  });

  it("rejects an email longer than 254 characters", () => {
    const local = "a".repeat(250);
    expect(validateEmail(`${local}@b.com`).ok).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Reader@Example.COM  ")).toBe("reader@example.com");
  });
});

describe("validateDisplayName", () => {
  it("rejects an empty name", () => {
    expect(validateDisplayName("").ok).toBe(false);
  });

  it("accepts a normal name", () => {
    expect(validateDisplayName("Mira Calloway").ok).toBe(true);
  });

  it("rejects a name over 100 characters", () => {
    expect(validateDisplayName("x".repeat(101)).ok).toBe(false);
  });
});
