import { useState } from "react";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { DuplicateCheck } from "../components/DuplicateCheck";
import { GenrePillSelector } from "../components/GenrePillSelector";
import { ToggleSwitch } from "../components/ToggleSwitch";
import "./Submit.css";

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
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [isAuthor, setIsAuthor] = useState(false);

  function toggleGenre(slug: string) {
    setSelectedGenres((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug],
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Real submission: build a kind 39999 DList item with the bookSubmission
    // word-wrapper, sign it (server-side for custodial users, NIP-07 for
    // sovereign), publish to strfry, then redirect to the new book page.
  }

  return (
    <div className="page">
      <Nav />
      <header className="sub-head">
        <h1 className="sub-title">Submit a book to Unbnd</h1>
        <p className="sub-sub">
          Anyone can add a book. The submission is signed with your key and
          attributed to you. Other users will rate, tag, and review it from
          here.
        </p>
      </header>

      <DuplicateCheck />

      <form className="sub-form" onSubmit={onSubmit}>
        <div className="sub-section">
          <h2 className="sub-section-title">Book details</h2>

          <div className="sub-row">
            <div className="sub-field">
              <label htmlFor="sub-title-in">
                Title <span className="sub-req">required</span>
              </label>
              <input id="sub-title-in" type="text" required />
            </div>
            <div className="sub-field">
              <label htmlFor="sub-author">
                Author name <span className="sub-req">required</span>
              </label>
              <input id="sub-author" type="text" required />
            </div>
          </div>

          <div className="sub-field">
            <label htmlFor="sub-blurb">Blurb</label>
            <textarea
              id="sub-blurb"
              rows={4}
              placeholder="A short description of the book, in the author's voice or yours. Two to four sentences is plenty."
            />
          </div>

          <div className="sub-row">
            <div className="sub-field">
              <label htmlFor="sub-isbn13">ISBN-13</label>
              <input id="sub-isbn13" type="text" placeholder="9780000000000" />
            </div>
            <div className="sub-field">
              <label htmlFor="sub-isbn10">ISBN-10</label>
              <input id="sub-isbn10" type="text" placeholder="0000000000" />
            </div>
          </div>

          <div className="sub-row">
            <div className="sub-field">
              <label htmlFor="sub-year">Publication year</label>
              <input
                id="sub-year"
                type="number"
                min={1500}
                max={new Date().getFullYear() + 1}
                placeholder="2025"
              />
            </div>
            <div className="sub-field">
              <label htmlFor="sub-pages">Page count</label>
              <input id="sub-pages" type="number" min={1} placeholder="320" />
            </div>
            <div className="sub-field">
              <label htmlFor="sub-lang">Language</label>
              <select id="sub-lang" defaultValue="en">
                {languages.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="sub-section">
          <h2 className="sub-section-title">Discovery</h2>

          <div className="sub-field">
            <label>Genres</label>
            <GenrePillSelector
              options={genreOptions}
              selected={selectedGenres}
              onToggle={toggleGenre}
              max={3}
            />
            <span className="sub-hint">
              Pick up to three. Other readers can add more from the book page.
            </span>
          </div>

          <div className="sub-row">
            <div className="sub-field">
              <label htmlFor="sub-cover">Cover image URL</label>
              <input
                id="sub-cover"
                type="url"
                placeholder="https://covers.openlibrary.org/..."
              />
              <span className="sub-hint">
                A direct link to a JPEG or PNG. Use the publisher's image when
                possible.
              </span>
            </div>
            <div className="sub-field">
              <label htmlFor="sub-purchase">Where to read</label>
              <input
                id="sub-purchase"
                type="url"
                placeholder="https://bookshop.org/..."
              />
              <span className="sub-hint">
                Bookshop, the author's site, Open Library, a library catalog.
                Multiple links can be added later.
              </span>
            </div>
          </div>
        </div>

        <ToggleSwitch
          id="sub-author-toggle"
          checked={isAuthor}
          onChange={setIsAuthor}
          label="I am the author of this book"
          description="Adds the Author Verified badge and grants edit access to the metadata. The community can flag claims that look suspect."
        />

        <div className="sub-submit-area">
          <button type="submit" className="sub-submit-btn">
            Submit book
          </button>
          <p className="sub-submit-note">
            The submission is signed by your key and attributed to your
            profile. See the{" "}
            <Link to="/about/submissions">submission policy</Link> for what
            happens next.
          </p>
        </div>
      </form>

      <Footer />
    </div>
  );
}
