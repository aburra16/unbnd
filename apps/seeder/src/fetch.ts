// The seeder's polite User-Agent (ADR 0008). The paginated subjects-API
// fetch (fetchSubjectWorks) that used to live here was superseded by the
// search-API collect (search.ts) and removed in Story 82.

/** Polite User-Agent for all Open Library requests. Single source of truth. */
export const SEEDER_USER_AGENT = "unbnd-seeder/0.1 (+https://unbnd.ink; catalog import)";
