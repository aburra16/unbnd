// Failing tests (red) for Story 32 / ADR 0033 §6 — the inline author-edit surface
// on BookDetail. It is revealed ONLY to the session user who is the Verified author
// of THIS book (their npub is in `claimants` with `verified:true` and matches the
// session identity). It exposes EXACTLY three fields (blurb, cover URL, where to
// buy), prefilled with the current effective values; on save it calls the api
// client (sovereign template→sign→submit / custodial submitCustodial), showing
// idle / saving / saved / error IN PLACE. A bad URL surfaces an inline message with
// no submit. Author-provided fields are labeled as attributed in the UI.
//
// A bare claimant, a non-claimant, and a signed-out viewer see NO edit surface.
//
// The book read returns `{ book, claimants, authorProvided }`; the mock is typed to
// that shape so a missing field fails. Boundary mocks only. Role-scoped queries.
// No Date.now in asserted output.
//
// Red until BookDetail mounts the verified-only edit surface + api.authorEdits.*.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BookTags, PublicBook } from "../../src/lib/api";
import type { UseSession } from "../../src/hooks/useSession";

// ── api boundary ──
const booksGet = vi.fn();
const tagsBook = vi.fn();
const authorEditsTemplate = vi.fn();
const authorEditsSubmit = vi.fn();
const authorEditsSubmitCustodial = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
  api: {
    auth: { me: vi.fn().mockRejectedValue(new Error("signed out")) },
    books: { get: (...a: unknown[]) => booksGet(...a) },
    tags: { book: (...a: unknown[]) => tagsBook(...a), list: vi.fn().mockResolvedValue({ tags: [] }) },
    claims: { template: vi.fn(), submit: vi.fn(), submitCustodial: vi.fn() },
    authorEdits: {
      template: (...a: unknown[]) => authorEditsTemplate(...a),
      submit: (...a: unknown[]) => authorEditsSubmit(...a),
      submitCustodial: (...a: unknown[]) => authorEditsSubmitCustodial(...a),
    },
    shelves: { mine: vi.fn().mockResolvedValue({ shelves: [] }) },
  },
}));

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

vi.mock("../../src/hooks/useTrustView", () => ({
  useTrustView: () => ({
    status: "ready" as const,
    view: "house" as const,
    setView: vi.fn(),
    personalize: vi.fn(),
    error: null,
    npub: undefined,
  }),
}));

vi.mock("../../src/hooks/useBookRatings", () => ({
  useBookRatings: () => ({
    house: { count: 0, average: null, ratings: [], weighted: null },
    yours: null,
    yourRating: null,
    status: "ready",
    applyWrite: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, fallback: string) => fallback,
}));

import { BookDetail } from "../../src/routes/BookDetail";

const ORBITAL: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  blurb: "The current effective blurb.",
  format: "reference",
};
const TAGS: BookTags = { genres: [], styles: [], signals: [], weighted: false };

// The Verified author's identity, present in claimants with verified:true.
const VERIFIED_NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const OTHER_NPUB = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsxq3xnz";

const verifiedSelf = { id: "u1", email: null, displayName: "Author", npub: VERIFIED_NPUB };
const verifiedSelfCustodial = { id: "u2", email: "a@b.com", displayName: "Author", npub: VERIFIED_NPUB };
const otherUser = { id: "u3", email: null, displayName: "Reader", npub: OTHER_NPUB };

beforeEach(() => {
  // Default book read: the session user IS the verified author, with an applied
  // author-provided blurb. authorProvided is part of the additive contract.
  booksGet.mockReset().mockResolvedValue({
    book: ORBITAL,
    claimants: [{ npub: VERIFIED_NPUB, verified: true }],
    authorProvided: ["blurb"],
  });
  tagsBook.mockReset().mockResolvedValue(TAGS);
  authorEditsTemplate.mockReset().mockResolvedValue({
    template: { kind: 39999, created_at: 1, tags: [], content: "" },
  });
  authorEditsSubmit.mockReset().mockResolvedValue({ ok: true, book: ORBITAL });
  authorEditsSubmitCustodial.mockReset().mockResolvedValue({ ok: true, book: ORBITAL });
  sessionMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

function renderBook() {
  return render(
    <MemoryRouter initialEntries={["/book/orbital"]}>
      <Routes>
        <Route path="/book/:slug" element={<BookDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// The edit surface is identified by its heading ("Your book details", ADR §8).
function editSurface() {
  return screen.queryByRole("region", { name: /your book details/i });
}

describe("BookDetail author edit — revealed only to the verified author (AC-5)", () => {
  it("shows the inline edit surface with exactly the three fields to the verified author", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: verifiedSelf, refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    const surface = await screen.findByRole("region", { name: /your book details/i });
    const scoped = within(surface);
    // Exactly the three editable fields, prefilled.
    expect(scoped.getByLabelText(/blurb/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/cover image url/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/where to buy/i)).toBeInTheDocument();
    // And nothing else editable: no title / author / ISBN / page count / year inputs.
    expect(scoped.queryByLabelText(/title/i)).not.toBeInTheDocument();
    expect(scoped.queryByLabelText(/author name/i)).not.toBeInTheDocument();
    expect(scoped.queryByLabelText(/isbn/i)).not.toBeInTheDocument();
    expect(scoped.queryByLabelText(/page count/i)).not.toBeInTheDocument();
    expect(scoped.queryByLabelText(/year/i)).not.toBeInTheDocument();
  });

  it("hides the edit surface from a NON-verified claimant", async () => {
    booksGet.mockResolvedValue({
      book: ORBITAL,
      claimants: [{ npub: VERIFIED_NPUB, verified: false }],
      authorProvided: [],
    });
    sessionMock.mockReturnValue({ status: "signed-in", user: verifiedSelf, refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    expect(editSurface()).not.toBeInTheDocument();
  });

  it("hides the edit surface from a verified author who is NOT the session user", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: otherUser, refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    expect(editSurface()).not.toBeInTheDocument();
  });

  it("hides the edit surface from a signed-out viewer", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    expect(editSurface()).not.toBeInTheDocument();
  });
});

describe("BookDetail author edit — save flow (AC-5)", () => {
  it("sovereign verified author saves via template→sign→submit, success in place", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: verifiedSelf, refresh: vi.fn() });
    const signEvent = vi.fn(async () => ({
      id: "x", pubkey: "p", created_at: 1, kind: 39999, tags: [], content: "", sig: "s",
    }));
    (window as unknown as { nostr: unknown }).nostr = { signEvent };
    renderBook();
    const surface = await screen.findByRole("region", { name: /your book details/i });
    const scoped = within(surface);
    fireEvent.change(scoped.getByLabelText(/blurb/i), { target: { value: "My updated blurb." } });
    fireEvent.click(scoped.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(authorEditsTemplate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(authorEditsSubmit).toHaveBeenCalledTimes(1));
    expect(await within(surface).findByText(/saved/i)).toBeInTheDocument();
    delete (window as unknown as { nostr?: unknown }).nostr;
  });

  it("custodial verified author saves via the server-signed path (no NIP-07)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: verifiedSelfCustodial, refresh: vi.fn() });
    renderBook();
    const surface = await screen.findByRole("region", { name: /your book details/i });
    const scoped = within(surface);
    fireEvent.change(scoped.getByLabelText(/blurb/i), { target: { value: "My updated blurb." } });
    fireEvent.click(scoped.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(authorEditsSubmitCustodial).toHaveBeenCalledTimes(1));
    expect(authorEditsSubmit).not.toHaveBeenCalled();
  });

  it("a bad cover URL shows an inline message and does NOT submit (Story 22 parity)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: verifiedSelf, refresh: vi.fn() });
    renderBook();
    const surface = await screen.findByRole("region", { name: /your book details/i });
    const scoped = within(surface);
    fireEvent.change(scoped.getByLabelText(/cover image url/i), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(scoped.getByRole("button", { name: /save/i }));
    expect(await within(surface).findByText(/http or https/i)).toBeInTheDocument();
    expect(authorEditsTemplate).not.toHaveBeenCalled();
    expect(authorEditsSubmit).not.toHaveBeenCalled();
    expect(authorEditsSubmitCustodial).not.toHaveBeenCalled();
  });

  it("shows an honest error in place when the save fails (no fabricated success)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: verifiedSelf, refresh: vi.fn() });
    (window as unknown as { nostr: unknown }).nostr = {
      signEvent: vi.fn(async () => ({
        id: "x", pubkey: "p", created_at: 1, kind: 39999, tags: [], content: "", sig: "s",
      })),
    };
    authorEditsSubmit.mockRejectedValue(new Error("relay down"));
    renderBook();
    const surface = await screen.findByRole("region", { name: /your book details/i });
    fireEvent.change(within(surface).getByLabelText(/blurb/i), { target: { value: "Blurb." } });
    fireEvent.click(within(surface).getByRole("button", { name: /save/i }));
    expect(await within(surface).findByRole("alert")).toBeInTheDocument();
    delete (window as unknown as { nostr?: unknown }).nostr;
  });
});

describe("BookDetail author edit — author-provided attribution (AC-6)", () => {
  it("labels an applied author-provided field as attributed in the UI", async () => {
    // authorProvided includes "blurb" → the rendered blurb carries an attribution.
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    expect(await screen.findByText(/from the author/i)).toBeInTheDocument();
  });
});
