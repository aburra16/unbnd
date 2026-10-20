// Failing tests for Story 104, per ADR 0093 §4–5: the planner over the
// librarian's live records, the only-the-year corrected template, the dry run
// and the apply run, and the seed path's shared year (AC 1–7).
//
// Fixture records are built with the real schema builders, so they have the
// exact wire shape of the hub's records.
//
// The module does not exist yet; loaded via the opaque specifier (_load.ts).
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookDelisting,
  bookLabels,
  buildBookRecordsHeaderAddress,
  fromBookRecordEvent,
  labelsOf,
  withBookLabels,
  fromWireEvent,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { mapSearchDocToBookRecord } from "../src/openlibrary";
import { loadSeederModule } from "./_load";

type YearVerdict =
  | { readonly kind: "credible" }
  | { readonly kind: "corrected"; readonly year: number }
  | { readonly kind: "kept"; readonly floor: number }
  | { readonly kind: "unresolved"; readonly floor: number };
type WorkEvidence = { readonly editionYears: readonly number[]; readonly authorKey?: string };
type AuthorEvidence = { readonly name?: string; readonly birthYear?: number };
type YearNote = {
  readonly slug: string;
  readonly title: string;
  readonly authorName: string;
  readonly year: number;
};
type YearCorrection = YearNote & { readonly to: number; readonly event: SignedNostrEvent };
type YearPlan = {
  readonly corrections: readonly YearCorrection[];
  readonly kept: readonly YearNote[];
  readonly unresolved: readonly YearNote[];
  readonly noEvidence: readonly YearNote[];
  readonly refused: readonly YearNote[];
};
type PublishResult = { readonly ok: boolean; readonly reason?: string };
type RunDeps = {
  readonly events: readonly SignedNostrEvent[];
  readonly librarian: string;
  readonly fetchWorks: (ids: readonly string[]) => Promise<Map<string, WorkEvidence>>;
  readonly fetchAuthors: (keys: readonly string[]) => Promise<Map<string, AuthorEvidence>>;
  readonly currentYear: number;
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly publish?: (template: NostrEventTemplate) => Promise<PublishResult>;
  readonly latest?: (slug: string) => Promise<SignedNostrEvent | undefined>;
};
type CorrectionsModule = {
  judgeRecordYear: (
    record: BookRecord,
    work: WorkEvidence | undefined,
    authors: ReadonlyMap<string, AuthorEvidence>,
    currentYear: number,
  ) => YearVerdict | undefined;
  withJudgedYear: (record: BookRecord, verdict: YearVerdict | undefined) => BookRecord;
  planYearCorrections: (
    events: readonly SignedNostrEvent[],
    librarian: string,
    works: ReadonlyMap<string, WorkEvidence>,
    authors: ReadonlyMap<string, AuthorEvidence>,
    currentYear: number,
  ) => YearPlan;
  correctedRecordTemplate: (
    event: SignedNostrEvent,
    year: number,
    createdAt: number,
  ) => NostrEventTemplate;
  formatPlan: (plan: YearPlan) => string[];
  runYearCorrection: (
    deps: RunDeps,
  ) => Promise<{
    readonly plan: YearPlan;
    readonly published: number;
    readonly failed: number;
    readonly stale: number;
  }>;
};

const load = () => loadSeederModule<CorrectionsModule>("year-corrections");

const LIBRARIAN = asHexPubkey("6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b");
const BOOKS = buildBookRecordsHeaderAddress(LIBRARIAN);
const NOW = 2026;
const T0 = 1_760_000_000;

let seq = 0;
function signedLike(template: NostrEventTemplate): SignedNostrEvent {
  seq++;
  return {
    ...template,
    id: seq.toString(16).padStart(64, "0"),
    pubkey: LIBRARIAN,
    sig: "0".repeat(128),
  };
}

function record(
  workId: string,
  title: string,
  authorName: string,
  publishYear: number | undefined,
  extra: Partial<BookRecord> = {},
): BookRecord {
  return {
    slug: `ol-${workId.toLowerCase()}`,
    title,
    authorName,
    openLibraryId: workId,
    coverUrl: `https://covers.openlibrary.org/b/id/${workId.length}-L.jpg`,
    ...(publishYear !== undefined ? { publishYear } : {}),
    subjects: ["Fiction", "Thrillers"],
    format: "reference",
    source: "openlibrary",
    parentHeader: BOOKS,
    ...extra,
  };
}
const eventOf = (r: BookRecord, createdAt = T0): SignedNostrEvent =>
  signedLike(toWireTemplate(toBookRecordEvent(r), createdAt));
const recordOf = (e: { kind: number; tags: string[][]; content: string }): BookRecord =>
  fromBookRecordEvent(fromWireEvent(e) as never);
const tagValue = (e: { tags: string[][] }, name: string) => e.tags.find((t) => t[0] === name)?.[1];

// The hub's records and Open Library's evidence for them (2026-10-20).
const STEP = record("OL5734023W", "Step on a Crack", "James Patterson", 1658, {
  isbn13: "9780316013949",
  blurb: "A former First Lady dies at a state funeral.",
  language: "eng",
  pageCount: 389,
});
const LAKE = record("OL5734040W", "The Lake House", "James Patterson", 1662);
const WOTW = record("OL52114W", "The War of the Worlds", "H. G. Wells", 0);
const MAST = record("OL1059693W", "Two years before the mast", "Richard Henry Dana", 1000);
const GULLIVER = record("OL20600W", "Gulliver's Travels", "Jonathan Swift", 1726);
const HAMLET = record("OL362427W", "Hamlet", "William Shakespeare", 1603);
const ODYSSEY = record("OL61982W", "Ὀδύσσεια", "Όμηρος", 1488);
const JACKS_BABY = record("OL2669046W", "Jack's Baby", "Emma Darcy", 1996);
const OLD_YELLER = record("OL64366W", "Old Yeller", "Fred Gipson", 1920);
const MERGED = record("OL644386W", "I promessi sposi", "Alessandro Manzoni", 1800);

const WORKS = new Map<string, WorkEvidence>([
  ["OL5734023W", { editionYears: [1658, 1947, 2007, 2008], authorKey: "OL39307A" }],
  ["OL5734040W", { editionYears: [1662, 2003, 2004], authorKey: "OL39307A" }],
  ["OL52114W", { editionYears: [0, 1898, 1906], authorKey: "OL13066A" }],
  ["OL1059693W", { editionYears: [1000, 1840, 1841], authorKey: "OL18295A" }],
  ["OL20600W", { editionYears: [1726, 1727, 1730], authorKey: "OL2627025A" }],
  ["OL362427W", { editionYears: [1603, 1604, 1605], authorKey: "OL9388A" }],
  ["OL61982W", { editionYears: [1488, 1535, 1538], authorKey: "OL6874044A" }],
  ["OL2669046W", { editionYears: [1996, 1997, 2011], authorKey: "OL228487A" }],
  ["OL64366W", { editionYears: [], authorKey: "OL20646A" }],
]);
const AUTHORS = new Map<string, AuthorEvidence>([
  ["OL39307A", { name: "James Patterson", birthYear: 1947 }],
  ["OL13066A", { name: "H. G. Wells", birthYear: 1866 }],
  ["OL18295A", { name: "Richard Henry Dana", birthYear: 1815 }],
  ["OL2627025A", { name: "Jonathan Swift", birthYear: 1667 }],
  ["OL9388A", { name: "William Shakespeare", birthYear: 1564 }],
  ["OL6874044A", { name: "Ὅμηρος", birthYear: 1900 }], // re-spelled since seeding
  ["OL228487A", { name: "Emma Darcy", birthYear: 1983 }], // a wrong birth date
  ["OL20646A", { name: "Fred Gipson", birthYear: 1908 }],
]);

const HUB = [STEP, LAKE, WOTW, MAST, GULLIVER, HAMLET, ODYSSEY, JACKS_BABY, OLD_YELLER, MERGED].map(
  (r) => eventOf(r),
);

describe("planYearCorrections — what changes (AC 1)", () => {
  it("corrects the four impossible, lone years to Open Library's earliest possible edition", async () => {
    const { planYearCorrections } = await load();
    const plan = planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW);
    const got = plan.corrections.map((c) => [c.slug, c.year, c.to]);
    expect(got).toEqual(
      expect.arrayContaining([
        ["ol-ol5734023w", 1658, 2007],
        ["ol-ol5734040w", 1662, 2003],
        ["ol-ol52114w", 0, 1898],
        ["ol-ol1059693w", 1000, 1840],
      ]),
    );
    expect(plan.corrections).toHaveLength(4);
  });

  it("carries the title, author and original event for each correction", async () => {
    const { planYearCorrections } = await load();
    const plan = planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW);
    const step = plan.corrections.find((c) => c.slug === "ol-ol5734023w")!;
    expect(step.title).toBe("Step on a Crack");
    expect(step.authorName).toBe("James Patterson");
    expect(step.event).toBe(HUB[0]);
  });
});

describe("planYearCorrections — what stays (AC 2–4)", () => {
  it("never plans a change for Gulliver's Travels, Hamlet or the Odyssey", async () => {
    const { planYearCorrections } = await load();
    const plan = planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW);
    const touched = [
      ...plan.corrections,
      ...plan.kept,
      ...plan.unresolved,
      ...plan.refused,
    ].map((n) => n.slug);
    expect(touched).not.toContain("ol-ol20600w");
    expect(touched).not.toContain("ol-ol362427w");
    expect(touched).not.toContain("ol-ol61982w");
  });

  it("keeps and reports a year with company (Jack's Baby 1996)", async () => {
    const { planYearCorrections } = await load();
    const plan = planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan.kept.map((n) => [n.slug, n.year])).toEqual([["ol-ol2669046w", 1996]]);
  });

  it("reports an impossible year with no possible edition as unresolved (Old Yeller 1920)", async () => {
    const { planYearCorrections } = await load();
    const plan = planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan.unresolved.map((n) => [n.slug, n.year])).toEqual([["ol-ol64366w", 1920]]);
  });

  it("reports a record Open Library returned no evidence for, and leaves it", async () => {
    const { planYearCorrections } = await load();
    const plan = planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan.noEvidence.map((n) => n.slug)).toEqual(["ol-ol644386w"]);
  });

  it("considers only live Open Library records with a year", async () => {
    const { planYearCorrections } = await load();
    const community = eventOf(
      record("OL5734023W", "Step on a Crack", "James Patterson", 1658, {
        slug: "community-step",
        source: "community",
      }),
    );
    const noYear = eventOf(record("OL5734040W", "The Lake House", "James Patterson", undefined));
    const noOl = eventOf({ ...record("OL52114W", "The War of the Worlds", "H. G. Wells", 0), openLibraryId: undefined });
    const delisted = signedLike(
      toWireTemplate(buildBookDelisting({ slug: "ol-ol1059693w", parentHeader: BOOKS }), T0),
    );
    const plan = planYearCorrections([community, noYear, noOl, delisted], LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan).toEqual({ corrections: [], kept: [], unresolved: [], noEvidence: [], refused: [] });
  });

  it("judges only the newest event per slug", async () => {
    const { planYearCorrections } = await load();
    const older = eventOf(STEP, T0);
    const newer = eventOf({ ...STEP, publishYear: 2007 }, T0 + 60);
    const plan = planYearCorrections([newer, older], LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan.corrections).toEqual([]);
  });
});

describe("correctedRecordTemplate — only the year changes (AC 6)", () => {
  const jsonOf = (e: { tags: string[][] }) => JSON.parse(e.tags.find((x) => x[0] === "json")![1]!);
  const editPayload = (
    e: NostrEventTemplate,
    edit: (p: Record<string, any>) => void,
  ): SignedNostrEvent =>
    signedLike({
      ...e,
      tags: e.tags.map((t) => {
        if (t[0] !== "json") return t;
        const payload = JSON.parse(t[1]!);
        edit(payload);
        return ["json", JSON.stringify(payload)];
      }),
    });
  /** Every tag but the year, in order, with the json tag's payload year blanked. */
  const allButYear = (e: { tags: string[][] }) =>
    e.tags.map((t) => {
      if (t[0] === "year") return ["year"];
      if (t[0] !== "json") return t;
      const p = JSON.parse(t[1]!);
      return ["json", JSON.stringify({ ...p, bookSubmission: { ...p.bookSubmission, publishYear: null } })];
    });

  it("changes the year tag and the payload's publishYear and nothing else", async () => {
    const { correctedRecordTemplate } = await load();
    const original = HUB[0]!;
    const t = correctedRecordTemplate(original, 2007, T0 + 100);

    expect(t.kind).toBe(39999);
    expect(t.created_at).toBe(T0 + 100);
    expect(t.content).toBe(original.content);
    expect(tagValue(t, "d")).toBe("ol-ol5734023w");
    expect(tagValue(t, "year")).toBe("2007");
    expect(allButYear(t)).toEqual(allButYear(original));
    expect(jsonOf(t)).toEqual({
      ...jsonOf(original),
      bookSubmission: { ...jsonOf(original).bookSubmission, publishYear: 2007 },
    });
    expect(recordOf(t)).toEqual({ ...recordOf(original), publishYear: 2007 });
  });

  it("keeps a relabelled record's genre labels and first-added date in place (story 105)", async () => {
    const { correctedRecordTemplate } = await load();
    const base = toWireTemplate(toBookRecordEvent(STEP), T0);
    const labels = bookLabels({ genres: ["thriller", "mystery"], format: STEP.format, language: STEP.language });
    const relabelled = signedLike({
      ...base,
      tags: withBookLabels([...base.tags, ["added", String(T0 - 5000)]], labels),
    });

    const t = correctedRecordTemplate(relabelled, 2007, T0 + 100);

    expect(allButYear(t)).toEqual(allButYear(relabelled));
    expect(tagValue(t, "added")).toBe(String(T0 - 5000));
    expect(labelsOf(t.tags)).toEqual({ genres: ["mystery", "thriller"], format: "reference", language: "eng" });
    expect(tagValue(t, "year")).toBe("2007");
    expect(jsonOf(t).bookSubmission.publishYear).toBe(2007);
  });

  it("corrects a record published before labels, and adds none", async () => {
    const { correctedRecordTemplate } = await load();
    const base = toWireTemplate(toBookRecordEvent(STEP), T0);
    const unlabelled = signedLike({ ...base, tags: withBookLabels(base.tags, []) });
    expect(unlabelled.tags.some((x) => x[0] === "L" || x[0] === "l")).toBe(false);

    const t = correctedRecordTemplate(unlabelled, 2007, T0 + 100);

    expect(allButYear(t)).toEqual(allButYear(unlabelled));
    expect(t.tags.some((x) => x[0] === "L" || x[0] === "l")).toBe(false);
    expect(tagValue(t, "year")).toBe("2007");
  });

  it("carries a tag it does not know in place", async () => {
    const { correctedRecordTemplate } = await load();
    const base = toWireTemplate(toBookRecordEvent(STEP), T0);
    const odd = signedLike({ ...base, tags: [...base.tags.slice(0, 3), ["unknown-tag", "x"], ...base.tags.slice(3)] });
    const t = correctedRecordTemplate(odd, 2007, T0 + 100);
    expect(allButYear(t)).toEqual(allButYear(odd));
  });

  it("keeps payload fields the schema does not model, unchanged", async () => {
    const { correctedRecordTemplate } = await load();
    const odd = editPayload(toWireTemplate(toBookRecordEvent(STEP), T0), (p) => {
      p.bookSubmission.extra = "kept by someone";
      p.word.wordTypes.push("classic");
    });
    const t = correctedRecordTemplate(odd, 2007, T0 + 100);
    expect(jsonOf(t).bookSubmission.extra).toBe("kept by someone");
    expect(jsonOf(t).word.wordTypes).toEqual(["word", "bookSubmission", "classic"]);
    expect(allButYear(t)).toEqual(allButYear(odd));
  });

  it("adds nothing to an old payload (no explicit submittedBy: null)", async () => {
    const { correctedRecordTemplate } = await load();
    const old = editPayload(toWireTemplate(toBookRecordEvent(STEP), T0), (p) => delete p.bookSubmission.submittedBy);
    const t = correctedRecordTemplate(old, 2007, T0 + 100);
    expect("submittedBy" in jsonOf(t).bookSubmission).toBe(false);
  });

  it("stamps a time after the live record even if the clock is behind it", async () => {
    const { correctedRecordTemplate } = await load();
    const live = eventOf(STEP, T0 + 1000);
    expect(correctedRecordTemplate(live, 2007, T0).created_at).toBe(T0 + 1001);
  });

  it("refuses a record whose tags and payload disagree (the schema would not write it)", async () => {
    const { correctedRecordTemplate } = await load();
    const base = toWireTemplate(toBookRecordEvent(STEP), T0);
    const odd = signedLike({
      ...base,
      tags: base.tags.map((t) => (t[0] === "title" ? ["title", "Step On A Crack"] : t)),
    });
    expect(() => correctedRecordTemplate(odd, 2007, T0 + 100)).toThrow();
  });

  it("refuses a record with a payload year and no year tag", async () => {
    const { correctedRecordTemplate } = await load();
    const base = toWireTemplate(toBookRecordEvent(STEP), T0);
    const odd = signedLike({ ...base, tags: base.tags.filter((t) => t[0] !== "year") });
    expect(() => correctedRecordTemplate(odd, 2007, T0 + 100)).toThrow();
  });

  it("the planner reports such a record as refused instead of correcting it", async () => {
    const { planYearCorrections } = await load();
    const base = toWireTemplate(toBookRecordEvent(STEP), T0);
    const odd = signedLike({
      ...base,
      tags: base.tags.map((t) => (t[0] === "title" ? ["title", "Step On A Crack"] : t)),
    });
    const plan = planYearCorrections([odd], LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan.corrections).toEqual([]);
    expect(plan.refused.map((n) => n.slug)).toEqual(["ol-ol5734023w"]);
  });
});

describe("only the librarian's own records are candidates (review round 1)", () => {
  it("ignores an event signed by anyone else at a librarian slug", async () => {
    const { planYearCorrections } = await load();
    const foreign = { ...eventOf(STEP), pubkey: "f".repeat(64) };
    const plan = planYearCorrections([foreign], LIBRARIAN, WORKS, AUTHORS, NOW);
    expect(plan.corrections).toEqual([]);
    expect(plan.noEvidence).toEqual([]);
  });
});

describe("formatPlan — the dry-run list Avi checks (AC 5)", () => {
  it("lists each correction with slug, stored year, new year, title and author", async () => {
    const { planYearCorrections, formatPlan } = await load();
    const lines = formatPlan(planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW));
    expect(lines).toContain("correct\tol-ol5734023w\t1658\t2007\tStep on a Crack\tJames Patterson");
    expect(lines).toContain("correct\tol-ol52114w\t0\t1898\tThe War of the Worlds\tH. G. Wells");
  });

  it("then the kept, unresolved, no-evidence and refused records, then the counts", async () => {
    const { planYearCorrections, formatPlan } = await load();
    const lines = formatPlan(planYearCorrections(HUB, LIBRARIAN, WORKS, AUTHORS, NOW));
    expect(lines).toContain("keep\tol-ol2669046w\t1996\t\tJack's Baby\tEmma Darcy");
    expect(lines).toContain("unresolved\tol-ol64366w\t1920\t\tOld Yeller\tFred Gipson");
    expect(lines).toContain("no-evidence\tol-ol644386w\t1800\t\tI promessi sposi\tAlessandro Manzoni");
    const kinds = lines.slice(0, -1).map((l) => l.split("\t")[0]);
    const order = ["correct", "keep", "unresolved", "no-evidence", "refused"];
    expect([...kinds].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(kinds);
    expect(lines.at(-1)).toBe(
      "# corrections=4 kept=1 unresolved=1 no-evidence=1 refused=0",
    );
  });
});

describe("runYearCorrection — dry run and apply (AC 5, 6)", () => {
  const deps = (over: Partial<RunDeps> = {}): RunDeps => ({
    events: HUB,
    librarian: LIBRARIAN,
    fetchWorks: vi.fn(async () => WORKS),
    fetchAuthors: vi.fn(async () => AUTHORS),
    currentYear: NOW,
    now: () => T0 + 500,
    log: vi.fn(),
    ...over,
  });

  it("asks Open Library about every candidate's work, then their first authors", async () => {
    const { runYearCorrection } = await load();
    const d = deps();
    await runYearCorrection(d);
    const ids = (d.fetchWorks as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[];
    expect([...ids].sort()).toEqual(
      ["OL5734023W", "OL5734040W", "OL52114W", "OL1059693W", "OL20600W", "OL362427W", "OL61982W", "OL2669046W", "OL64366W", "OL644386W"].sort(),
    );
    const keys = (d.fetchAuthors as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[];
    expect(new Set(keys)).toEqual(new Set([...WORKS.values()].map((w) => w.authorKey)));
  });

  it("a dry run publishes nothing and logs the plan", async () => {
    const { runYearCorrection, formatPlan } = await load();
    const d = deps();
    const r = await runYearCorrection(d);
    expect(r.published).toBe(0);
    const logged = (d.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    for (const line of formatPlan(r.plan)) expect(logged).toContain(line);
  });

  it("apply publishes one corrected record per correction, stamped now", async () => {
    const { runYearCorrection } = await load();
    const publish = vi.fn(async (_t: NostrEventTemplate): Promise<PublishResult> => ({ ok: true }));
    const r = await runYearCorrection(deps({ publish }));
    expect(r).toMatchObject({ published: 4, failed: 0 });
    const sent = publish.mock.calls.map(([t]) => [tagValue(t, "d"), tagValue(t, "year"), t.created_at]);
    expect(sent).toEqual(
      expect.arrayContaining([
        ["ol-ol5734023w", "2007", T0 + 500],
        ["ol-ol5734040w", "2003", T0 + 500],
        ["ol-ol52114w", "1898", T0 + 500],
        ["ol-ol1059693w", "1840", T0 + 500],
      ]),
    );
  });

  it("counts a refused publish as failed", async () => {
    const { runYearCorrection } = await load();
    const publish = vi.fn(async (t: NostrEventTemplate): Promise<PublishResult> =>
      tagValue(t, "d") === "ol-ol52114w" ? { ok: false, reason: "blocked" } : { ok: true },
    );
    const r = await runYearCorrection(deps({ publish }));
    expect(r).toMatchObject({ published: 3, failed: 1 });
  });

  it("skips a record that changed on the relay since it was planned", async () => {
    const { runYearCorrection } = await load();
    const publish = vi.fn(async (_t: NostrEventTemplate): Promise<PublishResult> => ({ ok: true }));
    const delisted = signedLike(
      toWireTemplate(buildBookDelisting({ slug: "ol-ol52114w", parentHeader: BOOKS }), T0 + 300),
    );
    const latest = vi.fn(async (slug: string) =>
      slug === "ol-ol52114w" ? delisted : HUB.find((e) => tagValue(e, "d") === slug),
    );
    const r = await runYearCorrection(deps({ publish, latest }));
    expect(r).toMatchObject({ published: 3, failed: 0, stale: 1 });
    expect(publish.mock.calls.map(([t]) => tagValue(t, "d"))).not.toContain("ol-ol52114w");
  });

  it("counts a record that fails to rebuild at publish time as failed, and goes on", async () => {
    const { runYearCorrection } = await load();
    const publish = vi.fn(async (_t: NostrEventTemplate): Promise<PublishResult> => ({ ok: true }));
    const base = toWireTemplate(toBookRecordEvent(WOTW), T0);
    const changed = signedLike({
      ...base,
      tags: base.tags.map((t) => (t[0] === "title" ? ["title", "The War Of The Worlds"] : t)),
    });
    // The relay serves a changed body under the planned id (a misbehaving relay).
    const latest = async (slug: string) => {
      const planned = HUB.find((e) => tagValue(e, "d") === slug)!;
      return slug === "ol-ol52114w" ? { ...changed, id: planned.id } : planned;
    };
    const r = await runYearCorrection(deps({ publish, latest }));
    expect(r).toMatchObject({ published: 3, failed: 1 });
  });

  it("is idempotent: a second run over the corrected records plans nothing", async () => {
    const { runYearCorrection } = await load();
    const sent: SignedNostrEvent[] = [];
    await runYearCorrection(
      deps({ publish: async (t) => (sent.push(signedLike(t)), { ok: true }) }),
    );
    const bySlug = new Map(HUB.map((e) => [tagValue(e, "d"), e]));
    for (const e of sent) bySlug.set(tagValue(e, "d"), e);
    const publish = vi.fn(async (): Promise<PublishResult> => ({ ok: true }));
    const again = await runYearCorrection(deps({ events: [...bySlug.values()], publish }));
    expect(again.plan.corrections).toEqual([]);
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("the seed writes the same year (AC 7)", () => {
  it("a search doc with Step on a Crack's editions seeds 2007, not 1658", async () => {
    const { judgeRecordYear, withJudgedYear } = await load();
    const doc = {
      key: "/works/OL5734023W",
      title: "Step on a Crack",
      author_name: ["James Patterson"],
      author_key: ["OL39307A"],
      first_publish_year: 1658,
      publish_year: [2008, 1658, 2007, 1947],
      cover_i: 1,
      language: ["eng"],
      edition_count: 40,
    };
    const mapped = mapSearchDocToBookRecord(doc, BOOKS)!;
    const verdict = judgeRecordYear(
      mapped,
      { editionYears: doc.publish_year, authorKey: doc.author_key[0] },
      AUTHORS,
      NOW,
    );
    expect(verdict).toEqual({ kind: "corrected", year: 2007 });
    expect(withJudgedYear(mapped, verdict).publishYear).toBe(2007);
  });

  it("a kept, credible or unresolved verdict leaves Open Library's year in the record", async () => {
    const { withJudgedYear } = await load();
    expect(withJudgedYear(JACKS_BABY, { kind: "kept", floor: 2003 })).toEqual(JACKS_BABY);
    expect(withJudgedYear(GULLIVER, { kind: "credible" })).toEqual(GULLIVER);
    expect(withJudgedYear(OLD_YELLER, { kind: "unresolved", floor: 1928 })).toEqual(OLD_YELLER);
    expect(withJudgedYear(MERGED, undefined)).toEqual(MERGED);
  });

  it("judges no year without one, and none without the work's evidence", async () => {
    const { judgeRecordYear } = await load();
    expect(judgeRecordYear(record("OL1W", "X", "Y", undefined), { editionYears: [] }, AUTHORS, NOW)).toBeUndefined();
    expect(judgeRecordYear(MERGED, undefined, AUTHORS, NOW)).toBeUndefined();
  });

  it("uses the author's birth only when the author record names the record's author", async () => {
    const { judgeRecordYear } = await load();
    // The Odyssey: Open Library's author is now spelled Ὅμηρος, the record says Όμηρος.
    expect(judgeRecordYear(ODYSSEY, WORKS.get("OL61982W"), AUTHORS, NOW)).toEqual({
      kind: "credible",
    });
  });
});
