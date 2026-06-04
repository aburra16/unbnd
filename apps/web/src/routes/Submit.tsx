import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { DuplicateCheck } from "../components/DuplicateCheck";
import { GenrePillSelector } from "../components/GenrePillSelector";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { useSession } from "../hooks/useSession";
import { Button, Container, Field, Label, Link } from "@unbnd/ui";
import { api, ApiError, type SignedEvent, type SubmissionInput } from "../lib/api";
import "./Submit.css";

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
              <input id="sub-title-in" name="title" type="text" required defaultValue={adding.title} />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-author">
                Author name <span className="sub-req">required</span>
              </Label>
              <input id="sub-author" name="author" type="text" required />
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
              <input id="sub-isbn13" name="isbn13" type="text" placeholder="9780000000000" />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-isbn10">ISBN-10</Label>
              <input id="sub-isbn10" name="isbn10" type="text" placeholder="0000000000" />
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
              />
            </Field>
            <Field className="sub-field">
              <Label className="u-label--inline" htmlFor="sub-pages">Page count</Label>
              <input id="sub-pages" name="pages" type="number" min={1} placeholder="320" />
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
              />
              <span className="sub-hint">
                A direct link to a JPEG or PNG. Use the publisher's image when
                possible.
              </span>
            </Field>
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
          description="Marks this submission as a self-claim of authorship. It signals you wrote the book; it is not a vetted credential."
        />

        <div className="sub-submit-area">
          {status === "error" && error && (
            <p className="sub-error" role="alert">{error}</p>
          )}
          {!signedIn && session.status !== "loading" && (
            <p className="sub-submit-note">
              <RouterLink to="/auth">Sign in</RouterLink> to submit a book.
            </p>
          )}
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
