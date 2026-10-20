// A book record's facets as NIP-32 labels (Story 105 / ADR 0094): genre, format
// and language, so a relay filter on `#l` can narrow a search over records.
// Genres are the applied consensus; format and language come from the record.

export const BOOK_GENRE_NAMESPACE = "ink.unbnd.genre";
export const BOOK_FORMAT_NAMESPACE = "ink.unbnd.format";
/** Open Library's language codes are MARC codes: the ISO 639-2 bibliographic set. */
export const BOOK_LANGUAGE_NAMESPACE = "ISO-639-2";
export const BOOK_LABEL_NAMESPACES = [BOOK_GENRE_NAMESPACE, BOOK_FORMAT_NAMESPACE, BOOK_LANGUAGE_NAMESPACE] as const;

export type BookFacets = {
  readonly genres: readonly string[];
  readonly format?: string;
  readonly language?: string;
};

type Tags = ReadonlyArray<readonly string[]>;
const OURS = new Set<string>(BOOK_LABEL_NAMESPACES);

/** The label tags for a book's facets, in a fixed order with values sorted. */
export function bookLabels(facets: BookFacets): string[][] {
  const out: string[][] = [];
  const add = (ns: string, values: readonly string[]) => {
    const unique = [...new Set(values.filter((v) => v !== ""))].sort();
    if (unique.length === 0) return;
    out.push(["L", ns]);
    for (const v of unique) out.push(["l", v, ns]);
  };
  add(BOOK_GENRE_NAMESPACE, facets.genres);
  add(BOOK_FORMAT_NAMESPACE, facets.format ? [facets.format] : []);
  add(BOOK_LANGUAGE_NAMESPACE, facets.language ? [facets.language] : []);
  return out;
}

function isOurs(t: readonly string[]): boolean {
  return (t[0] === "L" && OURS.has(t[1] ?? "")) || (t[0] === "l" && OURS.has(t[2] ?? ""));
}

/** `tags` with this module's namespaces replaced by `labels`; every other tag stays in place. */
export function withBookLabels(tags: Tags, labels: readonly (readonly string[])[]): string[][] {
  return [...tags.filter((t) => !isOurs(t)).map((t) => [...t]), ...labels.map((t) => [...t])];
}

/** The facets a record's labels carry. */
export function labelsOf(tags: Tags): { genres: string[]; format: string | undefined; language: string | undefined } {
  const values = (ns: string) => tags.filter((t) => t[0] === "l" && t[2] === ns).map((t) => t[1] ?? "");
  return {
    genres: [...new Set(values(BOOK_GENRE_NAMESPACE))].sort(),
    format: values(BOOK_FORMAT_NAMESPACE)[0],
    language: values(BOOK_LANGUAGE_NAMESPACE)[0],
  };
}

/** Whether `tags` already carries exactly `labels`, in any order. */
export function sameBookLabels(tags: Tags, labels: readonly (readonly string[])[]): boolean {
  const key = (ts: Tags) => ts.filter(isOurs).map((t) => t.join("\u0000")).sort().join("\u0001");
  return key(tags) === key(labels);
}
