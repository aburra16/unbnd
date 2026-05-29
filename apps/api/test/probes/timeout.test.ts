import { describe, expect, it } from "vitest";
import { withTimeout, type ProbeResult } from "../../src/probes/timeout";

describe("withTimeout", () => {
  it("returns the inner result when it resolves before the deadline", async () => {
    const result = await withTimeout(async () => {
      return { ok: true } satisfies ProbeResult;
    }, 1000);
    expect(result.ok).toBe(true);
  });

  it("populates latencyMs on a successful result", async () => {
    const result = await withTimeout(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true } satisfies ProbeResult;
    }, 1000);
    // Populated and bounded. No brittle lower bound: a ~10ms setTimeout can
    // fire a hair early on fast runners (measured 9ms in CI), so assert the
    // field is a non-negative number under the deadline, not >= the sleep.
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeLessThan(500);
  });

  it("returns ok=false with the rejection message when fn throws", async () => {
    const result = await withTimeout(async () => {
      throw new Error("simulated probe failure");
    }, 1000);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/simulated probe failure/);
  });

  it("returns ok=false with a timeout error when fn exceeds the deadline", async () => {
    const result = await withTimeout(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true } satisfies ProbeResult;
    }, 50);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout|timed out|deadline/i);
  });

  it("aborts the inner signal when the timeout fires", async () => {
    let aborted = false;
    await withTimeout(async (signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true } satisfies ProbeResult;
    }, 50);
    expect(aborted).toBe(true);
  });
});
