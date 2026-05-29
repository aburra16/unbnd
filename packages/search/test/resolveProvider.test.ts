import { describe, expect, it } from "vitest";
import { resolveProvider, MeiliProvider } from "../src/index";

describe("resolveProvider", () => {
  it("returns a MeiliProvider for provider=meili", () => {
    const p = resolveProvider({ provider: "meili", url: "http://x:7700", apiKey: "k" });
    expect(p).toBeInstanceOf(MeiliProvider);
    expect(p.name).toBe("meili");
  });

  it("throws for the not-yet-implemented vespa provider", () => {
    expect(() => resolveProvider({ provider: "vespa", url: "http://x", apiKey: "k" })).toThrow(/vespa/i);
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      resolveProvider({ provider: "elastic" as never, url: "http://x", apiKey: "k" }),
    ).toThrow(/unknown provider/i);
  });
});
