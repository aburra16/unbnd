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
 * Returns a signable kind-39998 template: d-tag = slug, a `["json", …]` tag
 * carrying `{ word: { slug, name, title, wordTypes: ["word","conceptHeader"] },
 * conceptHeader: { slug, name, title } }`, empty content.
 */
export function buildConceptHeaderTemplate(
  _input: ConceptHeaderInput,
): NostrEventTemplate {
  throw new Error("buildConceptHeaderTemplate not implemented");
}
