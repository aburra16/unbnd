// Failing tests (red) for Story 64 — OL autofill + cover preview on the submit
// form, per ADR 0063 §3–§4. These exercise the unimplemented Submit.tsx
// behavior: a debounced (500ms) `api.ol.lookup` on a valid ISBN, the
// never-clobber fill rule (fill iff empty ∧ ¬dirty), the honest affordances, the
// load-bearing submit-still-works guard (both sovereign + custodial), and the
// cover-preview onError → gradient fallback.
//
// `api.ol.lookup` does not exist on the real client yet; the whole `../../src/
// lib/api` module is mocked here (the existing submit.test.tsx pattern), so the
// red is purely behavioral: today's Submit.tsx never calls `ol.lookup`, never
// debounces on ISBN, never renders the affordance/preview, and the five fields
// are uncontrolled — so every assertion below fails against the current code,
// not against the compiler.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Submit } from "../../src/routes/Submit";
import type { UseSession } from "../../src/hooks/useSession";
import type { PublicUser } from "../../src/lib/api";

// Drive the dedup gate with a stub that proceeds immediately (mirrors submit.test).
vi.mock("../../src/components/DuplicateCheck", () => ({
  DuplicateCheck: ({ onProceed }: { onProceed: (p: { title: string }) => void }) => (
    <button type="button" onClick={() => onProceed({ title: "" })}>
      proceed-stub
    </button>
  ),
}));

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const createCustodial = vi.fn();
const template = vi.fn();
const create = vi.fn();
const olLookup = vi.fn();

vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: {
      createCustodial: (...a: unknown[]) => createCustodial(...a),
      template: (...a: unknown[]) => template(...a),
      create: (...a: unknown[]) => create(...a),
    },
    ol: { lookup: (...a: unknown[]) => olLookup(...a) },
    profile: { get: vi.fn(async () => ({ profile: { npub: "npub1me" } })) },
    auth: { logout: vi.fn(async () => {}) },
  },
}));

const custodial: PublicUser = { id: "u", email: "a@b.com", displayName: "n", npub: "npub1me" };
const sovereign: PublicUser = { id: "u", email: null, displayName: "n", npub: "npub1me" };

const ISBN13 = "9780140328721";
const FOUND = {
  found: true,
  title: "Fantastic Mr Fox",
  authorName: "Roald Dahl",
  coverUrl: "https://covers.openlibrary.org/b/isbn/9780140328721-L.jpg",
  pageCount: 96,
  publishYear: 1970,
};

beforeEach(() => {
  sessionMock.mockReset();
  createCustodial.mockReset().mockResolvedValue({ ok: true });
  template.mockReset().mockResolvedValue({ template: { kind: 39999, created_at: 0, tags: [], content: "" } });
  create.mockReset().mockResolvedValue({ ok: true });
  olLookup.mockReset().mockResolvedValue(FOUND);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderSubmit(user = custodial) {
  sessionMock.mockReturnValue({ status: "signed-in", user, refresh: vi.fn() });
  render(
    <MemoryRouter>
      <Submit />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /proceed-stub/i }));
}

const isbnInput = () => screen.getByLabelText(/ISBN-13/i);
const titleInput = () => screen.getByLabelText(/^title/i);
const authorInput = () => screen.getByLabelText(/author name/i);
const coverInput = () => screen.getByLabelText(/cover image URL/i);
const yearInput = () => screen.getByLabelText(/publication year/i);
const pagesInput = () => screen.getByLabelText(/page count/i);

// ---------------------------------------------------------------------------
// Debounced lookup + autofill of empty fields (AC: ISBN → debounced lookup →
// pre-fill empty cover/pages/year and title/author when returned).
// ---------------------------------------------------------------------------
describe("Submit autofill — debounced lookup fills empty fields", () => {
  it("calls api.ol.lookup once, ~500ms after a valid ISBN is entered", async () => {
    vi.useFakeTimers();
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    expect(olLookup).not.toHaveBeenCalled(); // not yet — still within the debounce window
    await vi.advanceTimersByTimeAsync(550);
    expect(olLookup).toHaveBeenCalledTimes(1);
    expect(olLookup).toHaveBeenCalledWith(ISBN13);
  });

  it("fills the empty title/author/cover/year/pages from the lookup result", async () => {
    vi.useFakeTimers();
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    // advanceTimersByTimeAsync flushes the debounce timer AND the lookup
    // microtask, so the autofilled state is settled by the time it returns.
    await vi.advanceTimersByTimeAsync(550);
    expect(titleInput()).toHaveValue("Fantastic Mr Fox");
    expect(authorInput()).toHaveValue("Roald Dahl");
    expect(coverInput()).toHaveValue(FOUND.coverUrl);
    expect(yearInput()).toHaveValue(1970);
    expect(pagesInput()).toHaveValue(96);
  });

  it("debounces rapid keystrokes into a single lookup with the final ISBN", async () => {
    vi.useFakeTimers();
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: "978" } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(isbnInput(), { target: { value: "978014032" } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    expect(olLookup).toHaveBeenCalledTimes(1);
    expect(olLookup).toHaveBeenCalledWith(ISBN13);
  });

  it("shows the honest 'Filled from Open Library' affordance after a found lookup", async () => {
    vi.useFakeTimers();
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    expect(
      screen.getByText(/Filled from Open Library\. Edit anything\./i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Never-clobber (AC: a field the user typed is not overwritten; an autofilled,
// untouched field CAN be re-filled; a user edit locks the field).
// ---------------------------------------------------------------------------
describe("Submit autofill — never clobbers user input", () => {
  it("does not overwrite a field the user already typed into", async () => {
    vi.useFakeTimers();
    renderSubmit();
    // The user types the author by hand FIRST.
    fireEvent.change(authorInput(), { target: { value: "My Own Author" } });
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    // Title was empty → filled; author was dirty → left untouched.
    expect(titleInput()).toHaveValue("Fantastic Mr Fox");
    expect(authorInput()).toHaveValue("My Own Author");
  });

  it("locks a field once the user edits it, even after a prior autofill", async () => {
    vi.useFakeTimers();
    olLookup.mockResolvedValueOnce(FOUND).mockResolvedValueOnce({
      ...FOUND,
      title: "A Different Edition",
    });
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    expect(titleInput()).toHaveValue("Fantastic Mr Fox");
    // User edits the (autofilled) title → it becomes dirty/locked.
    fireEvent.change(titleInput(), { target: { value: "User Final Title" } });
    // A second lookup (different ISBN) returns a new title.
    fireEvent.change(isbnInput(), { target: { value: "9780321765723" } });
    await vi.advanceTimersByTimeAsync(550);
    expect(olLookup).toHaveBeenCalledTimes(2);
    // The user's edit is NOT clobbered by the second autofill.
    expect(titleInput()).toHaveValue("User Final Title");
  });
});

// ---------------------------------------------------------------------------
// Fail-safe (AC: a lookup that fails / returns nothing leaves the form usable;
// an honest "no match" affordance is shown).
// ---------------------------------------------------------------------------
describe("Submit autofill — fail-safe", () => {
  it("shows the honest no-match line and writes nothing when found:false", async () => {
    vi.useFakeTimers();
    olLookup.mockResolvedValue({ found: false });
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    expect(
      screen.getByText(/No match on Open Library\. Add the details by hand\./i),
    ).toBeInTheDocument();
    expect(titleInput()).toHaveValue("");
    expect(coverInput()).toHaveValue("");
  });

  it("leaves the form fully usable when the lookup rejects", async () => {
    vi.useFakeTimers();
    olLookup.mockRejectedValue(new Error("network"));
    renderSubmit();
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    // The lookup was attempted (the debounce wiring exists)…
    expect(olLookup).toHaveBeenCalledWith(ISBN13);
    // …and the rejection did not crash the form: the user can still type.
    fireEvent.change(titleInput(), { target: { value: "Typed By Hand" } });
    expect(titleInput()).toHaveValue("Typed By Hand");
  });
});

// ---------------------------------------------------------------------------
// Submit-still-works migration guard (AC / Risk): after autofill, submitting
// sends the autofilled values for BOTH the sovereign (template → create) and
// custodial (createCustodial) paths — the controlled fields kept their name=.
// ---------------------------------------------------------------------------
describe("Submit autofill — submit carries the autofilled values (uncontrolled→controlled guard)", () => {
  it("custodial: createCustodial receives the autofilled fields", async () => {
    vi.useFakeTimers();
    renderSubmit(custodial);
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    expect(titleInput()).toHaveValue("Fantastic Mr Fox");
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: /^submit book$/i }));
    await waitFor(() =>
      expect(createCustodial).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Fantastic Mr Fox",
          authorName: "Roald Dahl",
          coverUrl: FOUND.coverUrl,
          publishYear: 1970,
          pageCount: 96,
        }),
      ),
    );
  });

  it("sovereign: the signing template receives the autofilled fields", async () => {
    vi.useFakeTimers();
    // Provide a NIP-07 stub so the sovereign branch can sign.
    (window as unknown as { nostr: unknown }).nostr = {
      signEvent: vi.fn(async (t: unknown) => ({
        ...(t as object),
        id: "id",
        pubkey: "pk",
        sig: "sig",
      })),
    };
    renderSubmit(sovereign);
    fireEvent.change(isbnInput(), { target: { value: ISBN13 } });
    await vi.advanceTimersByTimeAsync(550);
    expect(titleInput()).toHaveValue("Fantastic Mr Fox");
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: /^submit book$/i }));
    await waitFor(() =>
      expect(template).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Fantastic Mr Fox",
          authorName: "Roald Dahl",
          coverUrl: FOUND.coverUrl,
          publishYear: 1970,
          pageCount: 96,
        }),
      ),
    );
    delete (window as unknown as { nostr?: unknown }).nostr;
  });
});

// ---------------------------------------------------------------------------
// Cover preview + graceful fallback (AC: cover URL → <img> preview; broken/absent
// → gradient fallback, no broken-image).
// ---------------------------------------------------------------------------
// All queries are scoped to the `.sub-cover-preview` block so the Nav's logo
// SVG (role="img") never collides. The block does not exist yet, so these fail
// because the preview is unimplemented — the right reason.
describe("Submit cover preview — renders and falls back gracefully", () => {
  const previewImg = () =>
    document.querySelector(".sub-cover-preview img") as HTMLImageElement | null;
  const fallback = () =>
    document.querySelector(".sub-cover-preview .sub-cover-fallback");

  it("renders an <img> preview in the preview block when a cover URL is present", () => {
    renderSubmit();
    fireEvent.change(coverInput(), { target: { value: FOUND.coverUrl } });
    const img = previewImg();
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", FOUND.coverUrl);
  });

  it("swaps to the gradient fallback when the cover <img> errors (no broken image)", () => {
    renderSubmit();
    fireEvent.change(coverInput(), { target: { value: "https://example.com/missing.jpg" } });
    const img = previewImg();
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    // After onError the preview <img> is gone and the gradient fallback shows.
    expect(previewImg()).toBeNull();
    expect(fallback()).not.toBeNull();
  });

  it("re-attempts the image when the cover URL changes (clears the broken state)", () => {
    renderSubmit();
    fireEvent.change(coverInput(), { target: { value: "https://example.com/missing.jpg" } });
    fireEvent.error(previewImg()!);
    expect(previewImg()).toBeNull();
    // A fresh URL gets a fresh load attempt → the preview <img> returns.
    fireEvent.change(coverInput(), { target: { value: FOUND.coverUrl } });
    expect(previewImg()).toHaveAttribute("src", FOUND.coverUrl);
  });

  it("shows the gradient fallback (not an <img>) when no cover URL is set", () => {
    renderSubmit();
    // No cover typed and no autofill → the placeholder is the gradient block.
    expect(previewImg()).toBeNull();
    expect(fallback()).not.toBeNull();
  });
});
