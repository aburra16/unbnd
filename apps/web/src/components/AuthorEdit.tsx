// Verified-author edit surface (Story 32 / ADR 0033 §6). Revealed ONLY to the
// session user who is the Verified author of THIS book (the BookDetail gate hands
// it down; it renders nothing on its own when not applicable). It exposes EXACTLY
// three fields — blurb, cover image URL, where to buy — prefilled with the current
// effective values, and nothing else (no title / author / ISBN / page count /
// year). Cover and purchase URLs are validated as well-formed http(s) before any
// publish (Story 22 parity): a bad value surfaces an inline message and does NOT
// submit. On save it walks the shipped two-tier write — sovereign:
// template→NIP-07 sign→submit; custodial: submitCustodial — with no new crypto,
// showing idle / saving / saved / error IN PLACE.
import { useState } from "react";
import { api, ApiError, type PublicBook, type SignedEvent } from "../lib/api";
import "./AuthorEdit.css";

type Nip07 = {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

/** A well-formed http(s) URL (Story 22 parity). Empty is allowed (clears). */
function isHttpUrl(value: string): boolean {
  if (value.trim() === "") return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const BAD_URL = "Enter a web address that starts with http or https.";

export function AuthorEdit({
  bookSlug,
  book,
  isSovereign,
  onSaved,
}: {
  bookSlug: string;
  book: PublicBook;
  isSovereign: boolean;
  onSaved?: (book: PublicBook) => void;
}) {
  const [blurb, setBlurb] = useState(book.blurb ?? "");
  const [coverUrl, setCoverUrl] = useState(book.coverUrl ?? "");
  const [purchaseUrl, setPurchaseUrl] = useState(book.purchaseUrl ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [urlError, setUrlError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSave() {
    setUrlError(null);
    setErrorMsg(null);
    if (!isHttpUrl(coverUrl) || !isHttpUrl(purchaseUrl)) {
      setUrlError(BAD_URL);
      return;
    }
    setStatus("saving");
    // A null field clears the author value (reverts to canonical at read time).
    const input = {
      bookSlug,
      blurb: blurb.trim() === "" ? null : blurb,
      coverUrl: coverUrl.trim() === "" ? null : coverUrl,
      purchaseUrl: purchaseUrl.trim() === "" ? null : purchaseUrl,
    };
    try {
      let result: { ok: true; book: PublicBook };
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setErrorMsg("No Nostr extension found.");
          setStatus("error");
          return;
        }
        const { template } = await api.authorEdits.template(input);
        const signed = await nostr.signEvent(template);
        result = await api.authorEdits.submit(signed);
      } else {
        result = await api.authorEdits.submitCustodial(input);
      }
      onSaved?.(result.book);
      setStatus("saved");
    } catch (err) {
      if (err instanceof ApiError && err.code === "reauth_required") {
        setErrorMsg("Please sign in again to save your changes.");
      } else {
        setErrorMsg("Could not save your changes. Try again.");
      }
      setStatus("error");
    }
  }

  return (
    <section className="author-edit" aria-label="Your book details">
      <h2 className="author-edit-heading">Your book details</h2>
      <label className="author-edit-field">
        <span>Blurb</span>
        <textarea
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          rows={4}
        />
      </label>
      <label className="author-edit-field">
        <span>Cover image URL</span>
        <input
          type="text"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
        />
      </label>
      <label className="author-edit-field">
        <span>Where to buy</span>
        <input
          type="text"
          value={purchaseUrl}
          onChange={(e) => setPurchaseUrl(e.target.value)}
        />
      </label>
      {urlError && (
        <p className="author-edit-error" role="alert">
          {urlError}
        </p>
      )}
      <div className="author-edit-actions">
        <button
          type="button"
          className="author-edit-save"
          disabled={status === "saving"}
          onClick={onSave}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="author-edit-ok" role="status">
            Saved
          </span>
        )}
      </div>
      {status === "error" && errorMsg && (
        <p className="author-edit-error" role="alert">
          {errorMsg}
        </p>
      )}
    </section>
  );
}
