import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { DuplicateCheck } from "../components/DuplicateCheck";
import { GenrePillSelector } from "../components/GenrePillSelector";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { AccountPrompt } from "../components/AccountPrompt";
import { useSession } from "../hooks/useSession";
import { coverGradient } from "../lib/view-model";
import { Button, Container, Field, Label, Link } from "@unbnd/ui";
import { api, ApiError, type SignedEvent, type SubmissionInput } from "../lib/api";
import "./Submit.css";

// Story 64 / ADR 0063: the five autofillable fields lifted to controlled state so
// an OL ISBN lookup can fill them. Each input keeps its `name=`, so `onSubmit`'s
// `FormData` read (both the sovereign + custodial paths) is unchanged.
type AutofillField = "title" | "author" | "cover" | "year" | "pages";
type Fields = Record<AutofillField, string>;
const EMPTY_FIELDS: Fields = { title: "", author: "", cover: "", year: "", pages: "" };

const OL_DEBOUNCE_MS = 500;

/** The same ISBN rule as DuplicateCheck / the API endpoint: 13 or 10 digits/X. */
function normalizeIsbn(s: string): string | null {
  const cleaned = s.replace(/[^0-9Xx]/g, "").toUpperCase();
  return cleaned.length === 13 || cleaned.length === 10 ? cleaned : null;
}

type AutofillStatus = "idle" | "loading" | "found" | "not-found";

type Nip07 = {
  signEvent: (t: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}

const genreOptions = [
  { slug: "literary-fiction", label: "Literary fiction" },
  { slug: "science-fiction", label: "Science fiction" },
  { slug: "fantasy", label: "Fantasy" },
  { slug: "mystery", label: "Mystery" },
  { slug: "thriller", label: "Thriller" },
  { slug: "horror", label: "Horror" },
  { slug: "romance", label: "Romance" },
  { slug: "historical", label: "Historical" },
  { slug: "young-adult", label: "Young adult" },
  { slug: "biography", label: "Biography" },
  { slug: "history", label: "History" },
  { slug: "science", label: "Science" },
  { slug: "philosophy", label: "Philosophy" },
  { slug: "essays", label: "Essays" },
];

const languages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "other", label: "Other" },
];

export function Submit() {
  const session = useSession();
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isAuthor, setIsAuthor] = useState(false);
  // Search-first (ADR 0015): the form stays hidden until the user has searched
  // the catalog and chosen to proceed; `adding` carries the prefill.
  const [adding, setAdding] = useState<{ title: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Story 64 / ADR 0063 §3: the five autofillable fields are controlled (seeded
  // from `adding.title`); a per-field `dirty` set locks a field once the user
  // edits it (autofill writes never set dirty). The ISBN inputs drive the
  // debounced lookup but are not autofill targets.
  const [fields, setFields] = useState<Fields>({ ...EMPTY_FIELDS, title: adding?.title ?? "" });
  const [dirty, setDirty] = useState<Set<AutofillField>>(new Set());
  const [isbn13, setIsbn13] = useState("");
  const [isbn10, setIsbn10] = useState("");
  const [autofill, setAutofill] = useState<AutofillStatus>("idle");
  const [coverBroken, setCoverBroken] = useState(false);
  const lookupSeq = useRef(0);

  // Seed/reset the controlled fields when the user (re)enters the form for a
  // book — keeps the existing `defaultValue={adding.title}` prefill behavior.
  useEffect(() => {
    setFields({ ...EMPTY_FIELDS, title: adding?.title ?? "" });
    setDirty(new Set());
    setIsbn13("");
    setIsbn10("");
    setAutofill("idle");
  }, [adding]);

  // A fresh cover URL gets a fresh load attempt.
  useEffect(() => {
    setCoverBroken(false);
  }, [fields.cover]);

  function editField(key: AutofillField, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setDirty((d) => {
      const next = new Set(d);
      next.add(key);
      return next;
    });
  }

  // The debounced OL lookup (mirrors DuplicateCheck's seq-guarded debounce). On a
  // valid ISBN-13 or ISBN-10, after 500ms of pause, call `api.ol.lookup` once and
  // fill each returned field iff it is empty AND untouched-by-the-user.
  const isbn = normalizeIsbn(isbn13) ?? normalizeIsbn(isbn10);
  useEffect(() => {
    if (!isbn) {
      setAutofill("idle");
      return;
    }
    const mine = ++lookupSeq.current;
    const timer = setTimeout(() => {
      setAutofill("loading");
      api.ol
        .lookup(isbn)
        .then((result) => {
          if (mine !== lookupSeq.current) return;
          if (!result.found) {
            setAutofill("not-found");
            return;
          }
          const incoming: Partial<Fields> = {
            title: result.title,
            author: result.authorName,
            cover: result.coverUrl,
            year: result.publishYear != null ? String(result.publishYear) : undefined,
            pages: result.pageCount != null ? String(result.pageCount) : undefined,
          };
          setFields((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(incoming) as AutofillField[]) {
              const value = incoming[key];
              // Never-clobber: fill iff empty AND not dirtied by the user.
              if (value && prev[key] === "" && !dirty.has(key)) {
                next[key] = value;
              }
            }
            return next;
          });
          setAutofill("found");
        })
        .catch(() => {
          if (mine !== lookupSeq.current) return;
          // A failed lookup leaves the form fully usable; show the no-match line.
          setAutofill("not-found");
        });
    }, OL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isbn, dirty]);

  function toggleGenre(slug: string) {
    setSelectedGenres((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug],
    );
  }

  // Sovereign users sign in the browser; custodial users have the server sign
  // with their session-wrapped key (ADR 0016, reusing the rating/tag path).
  const isSovereign =
    session.status === "signed-in" && session.user.email === null;
  const signedIn = session.status === "signed-in";

  // The cover preview fallback gradient (the BookHeader/BookCard pattern), seeded
  // by the title since a submission has no slug yet — a stable, deterministic seed.
  const coverFallback = coverGradient(fields.title || adding?.title || "submission");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signedIn) {
      setError("Sign in to submit a book.");
      setStatus("error");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const input: SubmissionInput = {
      title: strOrUndef(fd.get("title")) ?? "",
      authorName: strOrUndef(fd.get("author")) ?? "",
      isbn13: strOrUndef(fd.get("isbn13")),
      isbn10: strOrUndef(fd.get("isbn10")),
      blurb: strOrUndef(fd.get("blurb")),
      coverUrl: strOrUndef(fd.get("cover")),
      purchaseUrl: strOrUndef(fd.get("purchase")),
      publishYear: numOrUndef(fd.get("year")),
      pageCount: numOrUndef(fd.get("pages")),
      language: strOrUndef(fd.get("lang")),
      subjects: selectedGenres.length > 0 ? selectedGenres : undefined,
      isAuthor,
    };
    setStatus("submitting");
    setError(null);
    try {
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setError("No Nostr extension found.");
          setStatus("error");
          return;
        }
        const { template } = await api.submissions.template(input);
        const signed = await nostr.signEvent(template);
        await api.submissions.create(signed);
      } else {
        await api.submissions.createCustodial(input);
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit. Try again.");
      setStatus("error");
    }
  }

  return (
    <Container>
      <Nav />
      <header className="sub-head">
        <h1 className="sub-title">Submit a book to Unbnd</h1>
        <p className="sub-sub">
          Anyone can add a book. The submission is signed with your key and
          attributed to you. Other users will rate, tag, and review it from
          here.
        </p>
      </header>

      {!adding && <DuplicateCheck onProceed={setAdding} />}

      {adding && status === "done" && (
        <section className="sub-done" role="status">
          <h2 className="sub-done-title">Submission received</h2>
          <p className="sub-done-note">
            Your book is signed and published as a community submission. It will
            appear in the catalog as it gains trust.{" "}
            <RouterLink to="/profile/me">See your submissions</RouterLink>.
          </p>
        </section>
      )}

      {adding && status !== "done" && (
      <form className="sub-form" onSubmit={onSubmit}>
        <Link
          variant="plain-muted"
          className="sub-back"
          type="button"
          onClick={() => setAdding(null)}
        >
          ← Back to search
        </Link>
        <div className="sub-section">
          <h2 className="sub-section-title">Book details</h2>

          <div className="sub-row">
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-title-in">
                Title <span className="sub-req">required</span>
              </Label>
              <input
                id="sub-title-in"
                name="title"
                type="text"
                required
                value={fields.title}
                onChange={(e) => editField("title", e.target.value)}
              />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-author">
                Author name <span className="sub-req">required</span>
              </Label>
              <input
                id="sub-author"
                name="author"
                type="text"
                required
                value={fields.author}
                onChange={(e) => editField("author", e.target.value)}
              />
            </Field>
          </div>

          <Field className="sub-field">
            <Label className="u-label--inline" htmlFor="sub-blurb">Blurb</Label>
            <textarea
              id="sub-blurb"
              name="blurb"
              rows={4}
              placeholder="A short description of the book, in the author's voice or yours. Two to four sentences is plenty."
            />
          </Field>

          <div className="sub-row">
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-isbn13">ISBN-13</Label>
              <input
                id="sub-isbn13"
                name="isbn13"
                type="text"
                placeholder="9780000000000"
                value={isbn13}
                onChange={(e) => setIsbn13(e.target.value)}
              />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-isbn10">ISBN-10</Label>
              <input
                id="sub-isbn10"
                name="isbn10"
                type="text"
                placeholder="0000000000"
                value={isbn10}
                onChange={(e) => setIsbn10(e.target.value)}
              />
            </Field>
          </div>

          <div className="sub-row">
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-year">Publication year</Label>
              <input
                id="sub-year"
                name="year"
                type="number"
                min={1500}
                max={new Date().getFullYear() + 1}
                placeholder="2025"
                value={fields.year}
                onChange={(e) => editField("year", e.target.value)}
              />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-pages">Page count</Label>
              <input
                id="sub-pages"
                name="pages"
                type="number"
                min={1}
                placeholder="320"
                value={fields.pages}
                onChange={(e) => editField("pages", e.target.value)}
              />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-lang">Language</Label>
              <select id="sub-lang" name="lang" defaultValue="en">
                {languages.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {autofill === "loading" && (
            <p className="sub-autofill-note">Looking up this ISBN…</p>
          )}
          {autofill === "found" && (
            <p className="sub-autofill-note">Filled from Open Library. Edit anything.</p>
          )}
          {autofill === "not-found" && (
            <p className="sub-autofill-note">
              No match on Open Library. Add the details by hand.
            </p>
          )}
        </div>

        <div className="sub-section">
          <h2 className="sub-section-title">Discovery</h2>

          <Field className="sub-field">
            <Label className="u-label--inline">Genres</Label>
            <GenrePillSelector
              options={genreOptions}
              selected={selectedGenres}
              onToggle={toggleGenre}
              max={3}
            />
            <span className="sub-hint">
              Pick up to three. Other readers can add more from the book page.
            </span>
          </Field>

          <div className="sub-row">
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-cover">Cover image URL</Label>
              <input
                id="sub-cover"
                name="cover"
                type="url"
                placeholder="https://covers.openlibrary.org/..."
                value={fields.cover}
                onChange={(e) => editField("cover", e.target.value)}
              />
              <span className="sub-hint">
                A direct link to a JPEG or PNG. Use the publisher's image when
                possible.
              </span>
            </Field>
            <div className="sub-cover-preview">
              {fields.cover && !coverBroken ? (
                <img
                  className="sub-cover-img"
                  src={fields.cover}
                  alt=""
                  loading="lazy"
                  onError={() => setCoverBroken(true)}
                  onLoad={() => setCoverBroken(false)}
                />
              ) : (
                <div
                  className="sub-cover-fallback"
                  style={{ background: `linear-gradient(155deg, ${coverFallback.from}, ${coverFallback.to})` }}
                >
                  <span className="sub-cover-fallback-title" style={{ color: coverFallback.ink }}>
                    {fields.title || adding.title || "Cover preview"}
                  </span>
                </div>
              )}
            </div>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-purchase">Where to read</Label>
              <input
                id="sub-purchase"
                name="purchase"
                type="url"
                placeholder="https://bookshop.org/..."
              />
              <span className="sub-hint">
                Bookshop, the author's site, Open Library, a library catalog.
                Multiple links can be added later.
              </span>
            </Field>
          </div>
        </div>

        <ToggleSwitch
          id="sub-author-toggle"
          checked={isAuthor}
          onChange={setIsAuthor}
          label="I am the author of this book"
          description="Records you as this book's author on the submission. To claim authorship where readers see it, use the claim action on the book page once it is listed."
        />

        <div className="sub-submit-area">
          {status === "error" && error && (
            <p className="sub-error" role="alert">{error}</p>
          )}
          {!signedIn && session.status !== "loading" && <AccountPrompt action="submit" />}
          <Button
            variant="primary"
            size="lg"
            className="sub-submit-btn"
            type="submit"
            disabled={!signedIn || status === "submitting"}
          >
            {status === "submitting" ? "Submitting…" : "Submit book"}
          </Button>
          <p className="sub-submit-note">
            The submission is signed by your key and attributed to your
            profile. See the{" "}
            <RouterLink to="/about/submissions">submission policy</RouterLink> for what
            happens next.
          </p>
        </div>
      </form>
      )}

      <Footer />
    </Container>
  );
}
