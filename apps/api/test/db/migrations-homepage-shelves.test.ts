// Story 35 / ADR 0036 §2 — the `homepage_shelves` cache table migration shape.
//
// A unit test over the embedded migration STRINGS (no live Postgres). It pins
// the contract the ADR fixes: migration `0005_homepage_shelves`, idempotent
// (`IF NOT EXISTS`), the cache columns (observer_hex, kind, position, book_slug,
// computed_at), and `UNIQUE (observer_hex, kind, position)` — the atomic
// replace-per-refresh ordering key. FAILING until the migration is appended.
import { describe, expect, it } from "vitest";
import { migrations } from "../../src/db/migrations";

const homepageShelves = () =>
  migrations.find((m) => m.name === "0005_homepage_shelves");

describe("migrations — 0005_homepage_shelves (ADR 0036 §2)", () => {
  it("appends a migration named 0005_homepage_shelves", () => {
    expect(homepageShelves()).toBeDefined();
  });

  it("is the next migration after 0004_reveals (ordered)", () => {
    const names = migrations.map((m) => m.name);
    const i = names.indexOf("0004_reveals");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(names[i + 1]).toBe("0005_homepage_shelves");
  });

  it("creates the homepage_shelves table idempotently (IF NOT EXISTS)", () => {
    const sql = homepageShelves()!.sql;
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+homepage_shelves/i);
  });

  it("carries the cache columns: observer_hex, kind, position, book_slug, computed_at", () => {
    const sql = homepageShelves()!.sql;
    expect(sql).toMatch(/observer_hex/i);
    expect(sql).toMatch(/\bkind\b/i);
    expect(sql).toMatch(/\bposition\b/i);
    expect(sql).toMatch(/book_slug/i);
    expect(sql).toMatch(/computed_at/i);
  });

  it("enforces UNIQUE (observer_hex, kind, position) — the ordered replace key", () => {
    const sql = homepageShelves()!.sql;
    expect(sql).toMatch(
      /UNIQUE\s*\(\s*observer_hex\s*,\s*kind\s*,\s*position\s*\)/i,
    );
  });
});
