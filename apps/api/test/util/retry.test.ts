import { describe, expect, it, vi } from "vitest";
import { retryWithBackoff, isRetryableConnError } from "../../src/util/retry";

const noSleep = () => Promise.resolve();

describe("retryWithBackoff", () => {
  it("returns the result once fn succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await retryWithBackoff(fn, { sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue("ok");
    const r = await retryWithBackoff(fn, { attempts: 5, sleep: noSleep });
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      retryWithBackoff(fn, { attempts: 3, sleep: noSleep }),
    ).rejects.toThrow(/ECONNREFUSED/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("syntax error"));
    await expect(
      retryWithBackoff(fn, {
        attempts: 5,
        sleep: noSleep,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow(/syntax error/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry with attempt + delay", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue("ok");
    await retryWithBackoff(fn, { sleep: noSleep, onRetry, baseDelayMs: 100 });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });
});

describe("isRetryableConnError", () => {
  it("matches connection errors by code or message", () => {
    expect(isRetryableConnError(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isRetryableConnError(new Error("connect ETIMEDOUT 1.2.3.4:5432"))).toBe(true);
    expect(isRetryableConnError(new Error("the database system is starting up"))).toBe(true);
  });

  it("does not match real errors", () => {
    expect(isRetryableConnError(new Error("relation does not exist"))).toBe(false);
    expect(isRetryableConnError(null)).toBe(false);
    expect(isRetryableConnError(undefined)).toBe(false);
  });
});
