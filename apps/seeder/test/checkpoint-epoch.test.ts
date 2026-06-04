// Failing tests for Story 52 (book blurbs from Open Library), per ADR 0051.
// The backfill mechanism (ADR Decision 3, Option A): an epoch-namespaced
// checkpoint plus a per-record content fingerprint, so a re-seed:
//   - re-publishes every record once under a bumped CHECKPOINT_EPOCH
//     (a previously-completed slug is no longer "done");
//   - re-publishes nothing on a second run with identical content
//     (the fingerprint key book:<slug>:<fp> is already present);
//   - re-publishes only records whose content actually changed.
//
// These extend the existing checkpoint behavior. They target the ADR's chosen
// key shape: an in-file `e<epoch>:` prefix and a `book:<slug>:<fp>` key.
//
// `loadCheckpoint` exists today with a 1-arg signature; the ADR threads an
// `epoch` into it. We import the real function and view it through an
// epoch-aware type alias so `tsc` stays clean while the runtime behavior is
// still missing — i.e. these fail at the assertion level (red), not as a
// compile wall. The `fingerprint` module does not exist yet and is loaded via
// an opaque specifier (see _load.ts) for the same reason.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCheckpoint as loadCheckpointRaw } from "../src/checkpoint";
import { loadSeederModule } from "./_load";

type Checkpoint = { has(key: string): boolean; add(key: string): void; size(): number };
// The ADR's epoch-aware shape: loadCheckpoint(path, epoch).
const loadCheckpoint = loadCheckpointRaw as unknown as (
  path: string,
  epoch?: number,
) => Checkpoint;

const dirs: string[] = [];
function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), "seed-cp-epoch-"));
  dirs.push(dir);
  return join(dir, "checkpoint");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("checkpoint epoch namespacing (the backfill)", () => {
  it("treats a previously-completed slug as not-done under a bumped epoch (re-publishes once)", () => {
    const path = tmpFile();

    // Epoch 1: the slug was completed during the original seed.
    const e1 = loadCheckpoint(path, 1);
    e1.add("book:ol-ol45804w");
    expect(e1.has("book:ol-ol45804w")).toBe(true);

    // Epoch 2 (the blurb backfill): the same slug is NOT yet done, so the seed
    // loop's skip guard no longer suppresses the re-publish.
    const e2 = loadCheckpoint(path, 2);
    expect(e2.has("book:ol-ol45804w")).toBe(false);

    // After it re-publishes once under epoch 2, it is recorded as done...
    e2.add("book:ol-ol45804w");
    expect(e2.has("book:ol-ol45804w")).toBe(true);

    // ...and the original epoch-1 record is left intact (audit trail / rollback).
    const e1again = loadCheckpoint(path, 1);
    expect(e1again.has("book:ol-ol45804w")).toBe(true);
  });

  it("persists epoch-scoped keys across reload within the same epoch", () => {
    const path = tmpFile();
    const a = loadCheckpoint(path, 2);
    a.add("book:ol-x");
    const b = loadCheckpoint(path, 2);
    expect(b.has("book:ol-x")).toBe(true);
  });

  it("isolates keys per epoch (epoch 2 does not see an epoch-3 key and vice versa)", () => {
    const path = tmpFile();
    const e2 = loadCheckpoint(path, 2);
    e2.add("tag:genre:fantasy");
    const e3 = loadCheckpoint(path, 3);
    expect(e3.has("tag:genre:fantasy")).toBe(false);
  });
});

describe("checkpoint content-fingerprint keys (surgical re-publish)", () => {
  it("skips a record whose fingerprint is already recorded (truly unchanged → no re-publish)", () => {
    const cp = loadCheckpoint(tmpFile(), 2);
    const slug = "ol-ol45804w";
    const fp = "abc123def456";
    cp.add(`book:${slug}:${fp}`);
    // A second run computes the same fp → key present → skip.
    expect(cp.has(`book:${slug}:${fp}`)).toBe(true);
  });

  it("re-publishes a record whose content (e.g. its blurb) changed (different fp → key absent)", () => {
    const cp = loadCheckpoint(tmpFile(), 2);
    const slug = "ol-ol45804w";
    const oldFp = "oldfingerprint";
    const newFp = "newfingerprint";
    cp.add(`book:${slug}:${oldFp}`);
    // The blurb changed, so the recomputed fingerprint differs and the new key
    // is not present → the record re-publishes (same slug d-tag replaces).
    expect(cp.has(`book:${slug}:${newFp}`)).toBe(false);
  });
});

// The fingerprint helper itself: stable for identical content, sensitive to a
// changed blurb. Loaded via the opaque specifier so a missing module is an
// assertion-level red.
describe("fingerprint helper", () => {
  type FpModule = { fingerprint: (record: Record<string, unknown>) => string };
  const load = () => loadSeederModule<FpModule>("fingerprint");

  const baseRecord = {
    slug: "ol-ol45804w",
    title: "The Great Gatsby",
    authorName: "F. Scott Fitzgerald",
    coverUrl: "https://covers.openlibrary.org/b/id/1234-L.jpg",
    publishYear: 1925,
    subjects: ["fiction", "classic"],
  };

  it("is stable for identical content (same fp on a second run)", async () => {
    const { fingerprint } = await load();
    const a = fingerprint({ ...baseRecord });
    const b = fingerprint({ ...baseRecord });
    expect(a).toBe(b);
  });

  it("changes when the blurb changes (so the changed record re-publishes)", async () => {
    const { fingerprint } = await load();
    const without = fingerprint({ ...baseRecord });
    const withBlurb = fingerprint({ ...baseRecord, blurb: "A new back-cover blurb." });
    expect(withBlurb).not.toBe(without);
  });
});
