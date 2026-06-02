// Failing tests (red) for Story 31 / ADR 0032 §4 — the BookDetail claim action.
// Signed-in (sovereign OR custodial) → a "Claim this book" affordance; invoking
// it walks the existing per-tier write (sovereign: template→NIP-07 sign→submit;
// custodial: submitCustodial) and shows idle/in-flight/success/error IN PLACE
// (no toast). Signed-out → no claim affordance, a sign-in prompt instead.
//
// The book read now returns `{ book, claimants }`; the mock is typed to that shape
// so a missing `claimants` field would fail (the additive contract).
//
// Boundary mocks only (api / useSession / useTrustView / useBookRatings /
// useProfileMeta). Role-scoped queries. No Date.now in asserted output.
// Red until BookDetail threads `claimants` + wires the claim action via
// api.claims.*.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BookTags, PublicBook } from "../../src/lib/api";
import type { UseSession } from "../../src/hooks/useSession";

// ── api boundary ──
const booksGet = vi.fn();
const tagsBook = vi.fn();
const claimsTemplate = vi.fn();
const claimsSubmit = vi.fn();
const claimsSubmitCustodial = vi.fn();
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
    // TagControl (mounted by BookDetail) reads the taxonomy via api.tags.list;
    // stub it so its effect resolves and never throws an unhandled error.
    tags: { book: (...a: unknown[]) => tagsBook(...a), list: vi.fn().mockResolvedValue({ tags: [] }) },
    claims: {
      template: (...a: unknown[]) => claimsTemplate(...a),
      submit: (...a: unknown[]) => claimsSubmit(...a),
      submitCustodial: (...a: unknown[]) => claimsSubmitCustodial(...a),
    },
    // MIGRATED for Story 32 / ADR 0033 §6: BookDetail mounts the verified-only
    // author-edit surface, which reads api.authorEdits.*. Stub the methods so the
    // import resolves; the surface is hidden here (no claimant has verified:true
    // matching the session), so none are invoked.
    authorEdits: { template: vi.fn(), submit: vi.fn(), submitCustodial: vi.fn() },
    // BookDetail mounts ShelfControl (signed-in) which reads api.shelves.mine;
    // stub it so its effect resolves and never throws an unhandled error.
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

// AuthorBadge resolves names; stub the identity hook so the badge can render.
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, fallback: string) => fallback,
}));

import { BookDetail } from "../../src/routes/BookDetail";

const ORBITAL: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  format: "reference",
};
const TAGS: BookTags = { genres: [], styles: [], signals: [], weighted: false };

const sovereign = { id: "u1", email: null, displayName: "Reader", npub: "npub1sov" };
const custodial = { id: "u2", email: "a@b.com", displayName: "Reader", npub: "npub1cust" };

beforeEach(() => {
  // MIGRATED for Story 32 / ADR 0033 §5: the book read returns
  // `{ book, claimants, authorProvided }` (additive). The claim-action assertions
  // are unchanged; authorProvided is empty (no verified author / no overlay).
  booksGet.mockReset().mockResolvedValue({ book: ORBITAL, claimants: [], authorProvided: [] });
  tagsBook.mockReset().mockResolvedValue(TAGS);
  claimsTemplate.mockReset().mockResolvedValue({
    template: { kind: 39999, created_at: 1, tags: [], content: "" },
  });
  claimsSubmit.mockReset().mockResolvedValue({ claimed: true, claimants: [{ npub: "npub1sov" }] });
  claimsSubmitCustodial.mockReset().mockResolvedValue({ claimed: true, claimants: [{ npub: "npub1cust" }] });
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

describe("BookDetail claim action — signed-out (AC-1)", () => {
  it("shows no claim affordance to a signed-out visitor", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    expect(screen.queryByRole("button", { name: /claim this book/i })).not.toBeInTheDocument();
  });
});

describe("BookDetail claim action — sovereign (AC-1/AC-8)", () => {
  it("claims via template→sign→submit and shows success in place (no toast)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    const signEvent = vi.fn(async () => ({
      id: "x", pubkey: "p", created_at: 1, kind: 39999, tags: [], content: "", sig: "s",
    }));
    (window as unknown as { nostr: unknown }).nostr = { signEvent };
    renderBook();
    const btn = await screen.findByRole("button", { name: /claim this book/i });
    fireEvent.click(btn);
    await waitFor(() => expect(claimsTemplate).toHaveBeenCalledWith({ bookSlug: "orbital" }));
    await waitFor(() => expect(claimsSubmit).toHaveBeenCalledTimes(1));
    // Honest success state, rendered in place.
    expect(await screen.findByText(/you claimed this book/i)).toBeInTheDocument();
    delete (window as unknown as { nostr?: unknown }).nostr;
  });

  it("shows an honest error in place when the claim fails (no fabricated success)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    (window as unknown as { nostr: unknown }).nostr = {
      signEvent: vi.fn(async () => ({
        id: "x", pubkey: "p", created_at: 1, kind: 39999, tags: [], content: "", sig: "s",
      })),
    };
    claimsSubmit.mockRejectedValue(new Error("relay down"));
    renderBook();
    fireEvent.click(await screen.findByRole("button", { name: /claim this book/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/you claimed this book/i)).not.toBeInTheDocument();
    delete (window as unknown as { nostr?: unknown }).nostr;
  });
});

describe("BookDetail claim action — custodial (AC-8)", () => {
  it("claims via the server-signed path (no NIP-07), success in place", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    renderBook();
    fireEvent.click(await screen.findByRole("button", { name: /claim this book/i }));
    await waitFor(() => expect(claimsSubmitCustodial).toHaveBeenCalledWith({ bookSlug: "orbital" }));
    expect(claimsSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/you claimed this book/i)).toBeInTheDocument();
  });
});

describe("BookDetail — claimants drive the AuthorBadge (AC-2)", () => {
  it("renders an Author badge when the book read returns a claimant", async () => {
    booksGet.mockResolvedValue({ book: ORBITAL, claimants: [{ npub: "npub1sov" }] });
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderBook();
    await screen.findByRole("heading", { name: "Orbital" });
    expect(await screen.findByText(/claimed by/i)).toBeInTheDocument();
    // "claimed ≠ verified": the badge never says "verified".
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });
});
