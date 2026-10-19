// Build a kind-39998 concept-header event template (word-wrapper
// `conceptHeader`), since @unbnd/schemas only has header *address* builders.
// ADR 0008 / BIBLE.md word-wrapper convention.
import type { NostrEventTemplate } from "@unbnd/schemas";

export type ConceptHeaderInput = {
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly createdAt: number;
};

/**
 * A signable kind-39998 template: d-tag = slug, a `["json", …]` tag carrying
 * `{ word: { slug, name, title, wordTypes: ["word","conceptHeader"] },
 * conceptHeader: { slug, name, title } }`, empty content.
 */
export function buildConceptHeaderTemplate(
  input: ConceptHeaderInput,
): NostrEventTemplate {
  const { slug, name, title, createdAt } = input;
  const payload = {
    word: { slug, name, title, wordTypes: ["word", "conceptHeader"] },
    conceptHeader: { slug, name, title },
  };
  return {
    kind: 39998,
    created_at: createdAt,
    content: "",
    tags: [
      ["d", slug],
      ["json", JSON.stringify(payload)],
    ],
  };
}

// STUBS (red): Story 97 / ADR 0087.
export type LinkTemplate = {
  readonly id: string;
  readonly relay: string;
  readonly placeholder: string;
  readonly field: string;
};

export function buildBooksHeaderTemplate(_input: {
  readonly librarian: string;
  readonly createdAt: number;
  readonly links: readonly LinkTemplate[];
}): NostrEventTemplate {
  throw new Error("not implemented");
}

export function seededHeaderTemplates(_librarian: string, _createdAt: number): NostrEventTemplate[] {
  throw new Error("not implemented");
}
