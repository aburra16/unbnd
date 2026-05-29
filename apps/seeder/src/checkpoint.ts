// Resumable checkpoint: a newline-delimited file of completed slugs. ADR 0008.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type Checkpoint = {
  has(slug: string): boolean;
  /** Mark a slug done and persist it (no-op if already recorded). */
  add(slug: string): void;
  size(): number;
};

/** Load (or create) the checkpoint file at `path` and return a live handle. */
export function loadCheckpoint(path: string): Checkpoint {
  const done = new Set<string>();
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const slug = line.trim();
      if (slug) done.add(slug);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }

  return {
    has: (slug) => done.has(slug),
    add: (slug) => {
      if (done.has(slug)) return;
      done.add(slug);
      appendFileSync(path, `${slug}\n`);
    },
    size: () => done.size,
  };
}
