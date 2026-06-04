// Resumable checkpoint: a newline-delimited file of completed keys. ADR 0008,
// epoch-namespaced by ADR 0051. Each persisted line is `e<epoch>:<key>`; a
// handle for a given epoch loads and reports only that epoch's keys, so a
// bumped CHECKPOINT_EPOCH treats prior-epoch completions as not-done (the
// backfill re-publishes each record once) while the prior epoch's lines stay
// intact (audit trail / rollback). The has/add/size surface takes the bare
// key; the epoch prefix is handled internally.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type Checkpoint = {
  has(key: string): boolean;
  /** Mark a key done and persist it (no-op if already recorded). */
  add(key: string): void;
  size(): number;
};

/**
 * Load (or create) the checkpoint file at `path` and return a live handle
 * scoped to `epoch` (default 1). Only keys recorded under the same epoch are
 * visible; keys from other epochs are preserved in the file but ignored.
 */
export function loadCheckpoint(path: string, epoch = 1): Checkpoint {
  const prefix = `e${epoch}:`;
  const done = new Set<string>();
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const entry = line.trim();
      if (!entry) continue;
      if (entry.startsWith(prefix)) {
        done.add(entry.slice(prefix.length));
      } else if (epoch === 1 && !/^e\d+:/.test(entry)) {
        // Legacy (pre-epoch) line: read it as epoch 1 for backward compat.
        done.add(entry);
      }
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }

  return {
    has: (key) => done.has(key),
    add: (key) => {
      if (done.has(key)) return;
      done.add(key);
      appendFileSync(path, `${prefix}${key}\n`);
    },
    size: () => done.size,
  };
}
