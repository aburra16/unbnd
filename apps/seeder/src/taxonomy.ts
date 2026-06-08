// Starter tag taxonomy the librarian publishes (ADR 0009): the recognized
// genres, styles, and quality signals. Sensitive (accusatory) signals are
// defined here but won't surface in the UI until the Layer-2 trust+role gate.
import type { TagSensitivity, TagType } from "@unbnd/schemas";

export type TaxonomyEntry = {
  readonly slug: string;
  readonly type: TagType;
  readonly name: string;
  readonly sensitivity: TagSensitivity;
};

// Genre slugs MUST match the SUBJECTS slugs in index.ts (the seed asserts these).
export const STARTER_TAXONOMY: readonly TaxonomyEntry[] = [
  { slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" },
  { slug: "science-fiction", type: "genre", name: "Science fiction", sensitivity: "normal" },
  { slug: "mystery", type: "genre", name: "Mystery", sensitivity: "normal" },
  { slug: "romance", type: "genre", name: "Romance", sensitivity: "normal" },
  { slug: "fantasy", type: "genre", name: "Fantasy", sensitivity: "normal" },
  { slug: "thriller", type: "genre", name: "Thriller", sensitivity: "normal" },
  { slug: "biography", type: "genre", name: "Biography", sensitivity: "normal" },
  { slug: "history", type: "genre", name: "History", sensitivity: "normal" },
  // Story 75 / ADR 0073 — the expansion to 16 genres.
  { slug: "horror", type: "genre", name: "Horror", sensitivity: "normal" },
  { slug: "poetry", type: "genre", name: "Poetry", sensitivity: "normal" },
  { slug: "young-adult", type: "genre", name: "Young adult", sensitivity: "normal" },
  { slug: "graphic-novels", type: "genre", name: "Graphic novels", sensitivity: "normal" },
  { slug: "philosophy", type: "genre", name: "Philosophy", sensitivity: "normal" },
  { slug: "science", type: "genre", name: "Science", sensitivity: "normal" },
  { slug: "self-help", type: "genre", name: "Self-help", sensitivity: "normal" },
  { slug: "memoir", type: "genre", name: "Memoir", sensitivity: "normal" },

  { slug: "short-novel", type: "style", name: "Short novel", sensitivity: "normal" },
  { slug: "experimental", type: "style", name: "Experimental", sensitivity: "normal" },
  { slug: "illustrated", type: "style", name: "Illustrated", sensitivity: "normal" },

  { slug: "well-edited", type: "signal", name: "Well edited", sensitivity: "normal" },
  { slug: "needs-copy-edit", type: "signal", name: "Needs copy edit", sensitivity: "normal" },
  { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
  { slug: "possibly-ai-generated", type: "signal", name: "Possibly AI generated", sensitivity: "accusatory" },
];
