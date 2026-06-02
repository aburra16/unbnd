// FAILING TESTS (red) — Story 33 / ADR 0034 §4 (amended 2026-06-02). The
// OPERATOR trigger lives in the worker, NOT on the API: a `reveal` subcommand /
// CLI that parses `--book <slug> --tag <slug> [--withdraw]` into the right
// `state`, then upserts the `reveals` row via `enqueueReveal`. There is NO API
// route, no session, no librarianPubkey equality check, no `403 not_librarian`
// here — those were properties of the removed API route.
//
// Two seams:
//  (a) parseRevealArgs(argv) — pure: reveal vs --withdraw → the right state +
//      book/tag slug threading; missing --book/--tag → an error.
//  (b) enqueueReveal(bookSlug, tagSlug, state, requestedBy) — UPSERT on
//      UNIQUE(book_slug, tag_slug): a fresh (book,tag) inserts a pending row;
//      a re-trigger / reveal→withdraw→reveal flip upserts the SAME row (latest
//      intent wins) — idempotent. Tested against a FAKE upsert seam.
//
// RED until apps/promoter/src/reveal/cli.ts exports parseRevealArgs +
// runRevealCommand, and the DB-backed enqueueReveal upsert seam exists.
import { describe, expect, it, vi } from "vitest";
import { asHexPubkey } from "@unbnd/schemas";
import { parseRevealArgs, runRevealCommand } from "../src/reveal/cli";

const LIB = asHexPubkey("1".repeat(63) + "a");

describe("parseRevealArgs — CLI dispatch (AC-4)", () => {
  it("`--book b1 --tag ai-generated` → a reveal intent (state revealed)", () => {
    const parsed = parseRevealArgs(["--book", "b1", "--tag", "ai-generated"]);
    expect(parsed).toEqual({ bookSlug: "b1", tagSlug: "ai-generated", state: "revealed" });
  });

  it("`--withdraw` flips the intent to state withdrawn", () => {
    const parsed = parseRevealArgs(["--book", "b1", "--tag", "ai-generated", "--withdraw"]);
    expect(parsed).toEqual({ bookSlug: "b1", tagSlug: "ai-generated", state: "withdrawn" });
  });

  it("threads the exact book/tag slugs through (no smuggling/defaulting)", () => {
    const parsed = parseRevealArgs(["--book", "ol-ol45804w", "--tag", "possibly-ai-generated"]);
    expect(parsed.bookSlug).toBe("ol-ol45804w");
    expect(parsed.tagSlug).toBe("possibly-ai-generated");
  });

  it("throws when --book is missing", () => {
    expect(() => parseRevealArgs(["--tag", "ai-generated"])).toThrow();
  });

  it("throws when --tag is missing", () => {
    expect(() => parseRevealArgs(["--book", "b1"])).toThrow();
  });
});

describe("runRevealCommand — upserts the reveals row via enqueueReveal (AC-4)", () => {
  it("a reveal command upserts a pending row with state revealed and requested_by = the librarian hex", async () => {
    const enqueueReveal = vi.fn(async () => ({ status: "queued" as const }));
    await runRevealCommand(["--book", "b1", "--tag", "ai-generated"], {
      enqueueReveal,
      requestedBy: LIB,
    });
    expect(enqueueReveal).toHaveBeenCalledTimes(1);
    expect(enqueueReveal).toHaveBeenCalledWith("b1", "ai-generated", "revealed", LIB);
  });

  it("a --withdraw command upserts the SAME (book,tag) row with state withdrawn", async () => {
    const enqueueReveal = vi.fn(async () => ({ status: "queued" as const }));
    await runRevealCommand(["--book", "b1", "--tag", "ai-generated", "--withdraw"], {
      enqueueReveal,
      requestedBy: LIB,
    });
    expect(enqueueReveal).toHaveBeenCalledWith("b1", "ai-generated", "withdrawn", LIB);
  });
});

describe("enqueueReveal upsert — idempotent on UNIQUE(book_slug, tag_slug) (AC-4)", () => {
  // A fake upsert seam keyed on (book,tag): the latest intent wins, the row
  // count never grows on a re-trigger / flip (mirrors the Postgres ON CONFLICT
  // (book_slug, tag_slug) DO UPDATE upsert the implementer wires).
  function fakeUpsertStore() {
    const rows = new Map<string, { state: string; requestedBy: string; status: string }>();
    const enqueueReveal = vi.fn(
      async (bookSlug: string, tagSlug: string, state: "revealed" | "withdrawn", requestedBy: string) => {
        const key = `${bookSlug}|${tagSlug}`;
        const existed = rows.has(key);
        rows.set(key, { state, requestedBy, status: "pending" });
        return { status: existed ? ("updated" as const) : ("queued" as const) };
      },
    );
    return { rows, enqueueReveal };
  }

  it("reveal → withdraw → reveal on the same (book,tag) keeps ONE row, latest intent winning", async () => {
    const { rows, enqueueReveal } = fakeUpsertStore();
    await runRevealCommand(["--book", "b1", "--tag", "ai-generated"], { enqueueReveal, requestedBy: LIB });
    await runRevealCommand(["--book", "b1", "--tag", "ai-generated", "--withdraw"], { enqueueReveal, requestedBy: LIB });
    await runRevealCommand(["--book", "b1", "--tag", "ai-generated"], { enqueueReveal, requestedBy: LIB });

    expect(enqueueReveal).toHaveBeenCalledTimes(3);
    // One row for (b1, ai-generated) — the upsert never duplicates.
    expect(rows.size).toBe(1);
    // Latest intent wins → revealed, pending again.
    expect(rows.get("b1|ai-generated")).toEqual({ state: "revealed", requestedBy: LIB, status: "pending" });
  });

  it("two distinct (book,tag) pairs are two separate rows", async () => {
    const { rows, enqueueReveal } = fakeUpsertStore();
    await runRevealCommand(["--book", "b1", "--tag", "ai-generated"], { enqueueReveal, requestedBy: LIB });
    await runRevealCommand(["--book", "b1", "--tag", "possibly-ai-generated"], { enqueueReveal, requestedBy: LIB });
    expect(rows.size).toBe(2);
  });
});
