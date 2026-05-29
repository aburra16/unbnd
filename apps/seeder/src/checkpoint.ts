// Resumable checkpoint: a newline-delimited file of completed slugs. ADR 0008.
// IMPLEMENTATION PENDING — stub throws so the suite fails for the right reason.

export type Checkpoint = {
  has(slug: string): boolean;
  /** Mark a slug done and persist it. */
  add(slug: string): void;
  size(): number;
};

/** Load (or create) the checkpoint file at `path` and return a live handle. */
export function loadCheckpoint(_path: string): Checkpoint {
  throw new Error("loadCheckpoint not implemented");
}
