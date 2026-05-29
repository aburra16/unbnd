// Meilisearch adapter — the ONLY file in the codebase that knows about Meili
// (ADR 0013). Raw HTTP, no SDK. Everything else depends on the neutral
// SearchProvider interface + ./types, so a Vespa adapter is a drop-in. The
// architecture guard test enforces that Meili specifics never leak past here.
import type { Config } from "../config";
import type {
  ProviderHealth,
  ProviderName,
  SearchProvider,
} from "./SearchProvider";
import type {
  SearchDocument,
  SearchQuery,
  SearchResult,
  SearchHit,
} from "./types";

const INDEX = "books";

// Searchable attributes in importance order, and the attributes we allow as
// filters. These are the index-tuning knobs; the Vespa equivalent is the same
// idea expressed in that adapter's configureIndex.
const SEARCHABLE_ATTRIBUTES = [
  "title",
  "authorName",
  "subjects",
  "tags",
  "isbn13",
  "blurb",
];
const FILTERABLE_ATTRIBUTES = ["genreSlugs", "format", "language", "publishYear"];

type MeiliHit = SearchDocument & { _rankingScore?: number };

export class MeiliProvider implements SearchProvider {
  readonly name: ProviderName = "meili";
  readonly #config: Config;
  readonly #fetch: typeof fetch;

  constructor(config: Config, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  #url(path: string): string {
    return `${this.#config.searchUrl}${path}`;
  }

  #req(path: string, init?: RequestInit): Promise<Response> {
    return this.#fetch(this.#url(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.#config.searchApiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const res = await this.#req("/health");
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return { ok: false, provider: this.name, error: `meili: status ${res.status}`, latencyMs };
      }
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      return { ok: true, provider: this.name, version: body.status, latencyMs };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      };
    }
  }

  async configureIndex(): Promise<void> {
    // Create the index (no-op task if it already exists), then apply settings.
    await this.#req("/indexes", {
      method: "POST",
      body: JSON.stringify({ uid: INDEX, primaryKey: "id" }),
    }).catch(() => undefined);
    const res = await this.#req(`/indexes/${INDEX}/settings`, {
      method: "PATCH",
      body: JSON.stringify({
        searchableAttributes: SEARCHABLE_ATTRIBUTES,
        filterableAttributes: FILTERABLE_ATTRIBUTES,
      }),
    });
    if (!res.ok) {
      throw new Error(`meili: configureIndex failed (status ${res.status})`);
    }
  }

  async index(docs: readonly SearchDocument[]): Promise<void> {
    if (docs.length === 0) return;
    const res = await this.#req(`/indexes/${INDEX}/documents`, {
      method: "POST",
      body: JSON.stringify(docs),
    });
    if (!res.ok) {
      throw new Error(`meili: index failed (status ${res.status})`);
    }
  }

  async deleteAll(): Promise<void> {
    const res = await this.#req(`/indexes/${INDEX}/documents`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`meili: deleteAll failed (status ${res.status})`);
    }
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const filter = buildFilter(query);
    const res = await this.#req(`/indexes/${INDEX}/search`, {
      method: "POST",
      body: JSON.stringify({
        q: query.q,
        limit: query.limit,
        offset: query.offset,
        showRankingScore: true,
        ...(filter.length > 0 ? { filter } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`meili: search failed (status ${res.status})`);
    }
    const body = (await res.json()) as {
      hits?: MeiliHit[];
      estimatedTotalHits?: number;
      limit?: number;
      offset?: number;
    };
    return {
      hits: (body.hits ?? []).map(toHit),
      total: body.estimatedTotalHits ?? (body.hits ?? []).length,
      offset: body.offset ?? query.offset,
      limit: body.limit ?? query.limit,
    };
  }
}

// Meili filter expressions (array form = AND). Quotes guard values with spaces.
function buildFilter(query: SearchQuery): string[] {
  const f = query.filters;
  if (!f) return [];
  const out: string[] = [];
  if (f.genre) out.push(`genreSlugs = ${JSON.stringify(f.genre)}`);
  if (f.format) out.push(`format = ${JSON.stringify(f.format)}`);
  if (f.language) out.push(`language = ${JSON.stringify(f.language)}`);
  return out;
}

function toHit(hit: MeiliHit): SearchHit {
  return {
    slug: hit.id,
    title: hit.title,
    authorName: hit.authorName,
    blurb: hit.blurb,
    coverUrl: hit.coverUrl,
    publishYear: hit.publishYear,
    format: hit.format,
    score: hit._rankingScore,
  };
}
