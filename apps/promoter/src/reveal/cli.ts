// The OPERATOR reveal trigger (Story 33 / ADR 0034 §4, amended 2026-06-02). The
// reveal/withdraw trigger lives in the worker, NOT on the API: a `reveal`
// subcommand that parses `--book <slug> --tag <slug> [--withdraw]` into the
// right state, then upserts the `reveals` row via `enqueueReveal`. No session,
// no librarianPubkey equality check — those were properties of the removed API
// route. The worker (runRevealCycle) then mints the librarian-signed event.
import type { RevealState } from "@unbnd/schemas";

export type ParsedRevealArgs = {
  readonly bookSlug: string;
  readonly tagSlug: string;
  readonly state: RevealState;
};

/** A `--name value` flag's value from argv, or undefined. */
function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  return argv[i + 1];
}

/**
 * Parse `--book <slug> --tag <slug> [--withdraw]`. `--withdraw` flips the intent
 * to state `withdrawn`; otherwise `revealed`. Throws on a missing --book/--tag
 * (no smuggling/defaulting).
 */
export function parseRevealArgs(argv: readonly string[]): ParsedRevealArgs {
  const bookSlug = flag(argv, "--book");
  const tagSlug = flag(argv, "--tag");
  if (!bookSlug) throw new Error("reveal: --book <slug> is required");
  if (!tagSlug) throw new Error("reveal: --tag <slug> is required");
  const state: RevealState = argv.includes("--withdraw") ? "withdrawn" : "revealed";
  return { bookSlug, tagSlug, state };
}

export type EnqueueRevealResult = { readonly status: "queued" | "updated" };

export type RevealCommandDeps = {
  /** Upsert the `reveals` row on UNIQUE(book_slug, tag_slug); latest intent wins. */
  readonly enqueueReveal: (
    bookSlug: string,
    tagSlug: string,
    state: RevealState,
    requestedBy: string,
  ) => Promise<EnqueueRevealResult>;
  /** The librarian hex recorded as the actor (audit/provenance). */
  readonly requestedBy: string;
};

/** Parse the reveal args and upsert the queue row. */
export async function runRevealCommand(
  argv: readonly string[],
  deps: RevealCommandDeps,
): Promise<EnqueueRevealResult> {
  const { bookSlug, tagSlug, state } = parseRevealArgs(argv);
  return deps.enqueueReveal(bookSlug, tagSlug, state, deps.requestedBy);
}
