// Failing tests (red) for Story 18 AC-1/AC-2/AC-4/AC-5/AC-6/AC-8 (control) —
// the add-to-shelf control on book detail. Mirrors tag-control.test.tsx.
// Targets apps/web/src/components/ShelfControl.tsx and the api.shelves block,
// neither of which exists yet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ShelfControl } from "../../src/components/ShelfControl";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const mineMock = vi.fn();
const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    shelves: {
      mine: (...a: unknown[]) => mineMock(...a),
      template: (...a: unknown[]) => templateMock(...a),
      submit: (...a: unknown[]) => submitMock(...a),
      submitCustodial: (...a: unknown[]) => submitCustodialMock(...a),
    },
  },
}));

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const signEvent = vi.fn();
const sovereignUser = {
  id: "u1",
  email: null,
  displayName: "npub1n0ewa…rk23",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};
const custodialUser = { ...sovereignUser, email: "reader@example.com" };

beforeEach(() => {
  mineMock.mockReset().mockResolvedValue({ shelves: [] });
  templateMock.mockReset();
  submitMock.mockReset();
  submitCustodialMock.mockReset();
  signEvent.mockReset();
  sessionMock.mockReset();
  (window as unknown as { nostr: unknown }).nostr = { signEvent };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
});

function renderControl() {
  return render(
    <MemoryRouter>
      <ShelfControl bookSlug="orbital" />
    </MemoryRouter>,
  );
}

describe("ShelfControl — gating (AC-6)", () => {
  it("prompts sign-in and offers no shelf picker when signed out", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderControl();
    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers the three default shelves when signed in (PRD §5.6)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    renderControl();
    await screen.findByRole("combobox");
    expect(screen.getByRole("option", { name: "Want to Read" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Reading" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Read" })).toBeInTheDocument();
  });
});

describe("ShelfControl — sovereign add (AC-1, AC-6)", () => {
  it("runs template → signEvent → submit when adding to Want to Read", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [], content: "", sig: "s" });
    submitMock.mockResolvedValue({ ok: true });

    renderControl();
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "want-to-read" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(templateMock).toHaveBeenCalledWith(
        expect.objectContaining({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: 1 }),
      ),
    );
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    await waitFor(() => expect(submitMock).toHaveBeenCalled());
  });
});

describe("ShelfControl — sovereign remove (AC-2)", () => {
  it("submits a polarity -1 retract when removing a book already on a shelf", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    mineMock.mockResolvedValue({
      shelves: [
        { slug: "want-to-read", name: "Want to Read", count: 1, books: [{ bookSlug: "orbital", bookAtag: "x" }] },
      ],
    });
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [], content: "", sig: "s" });
    submitMock.mockResolvedValue({ ok: true });

    renderControl();
    fireEvent.click(await screen.findByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(templateMock).toHaveBeenCalledWith(
        expect.objectContaining({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: -1 }),
      ),
    );
  });
});

describe("ShelfControl — custodial add (AC-6)", () => {
  it("server-signs via submitCustodial, never touching the extension", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodialUser, refresh: vi.fn() });
    submitCustodialMock.mockResolvedValue({ ok: true });

    renderControl();
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "reading" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(submitCustodialMock).toHaveBeenCalledWith(
        expect.objectContaining({ bookSlug: "orbital", shelfSlug: "reading", polarity: 1 }),
      ),
    );
    expect(signEvent).not.toHaveBeenCalled();
  });
});

describe("ShelfControl — custom shelf (AC-4)", () => {
  it("sends a slug derived from the typed name plus the display name", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodialUser, refresh: vi.fn() });
    submitCustodialMock.mockResolvedValue({ ok: true });

    renderControl();
    // Choosing "New shelf…" reveals a name input.
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "__new__" } });
    fireEvent.change(await screen.findByLabelText(/name/i), { target: { value: "Beach Reads" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(submitCustodialMock).toHaveBeenCalledWith(
        expect.objectContaining({
          bookSlug: "orbital",
          shelfSlug: "beach-reads",
          shelfName: "Beach Reads",
          polarity: 1,
        }),
      ),
    );
  });
});

describe("ShelfControl — default mutual exclusivity = move (AC-5)", () => {
  it("removes the old default then adds the new default (two writes)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodialUser, refresh: vi.fn() });
    mineMock.mockResolvedValue({
      shelves: [
        { slug: "reading", name: "Reading", count: 1, books: [{ bookSlug: "orbital", bookAtag: "x" }] },
      ],
    });
    submitCustodialMock.mockResolvedValue({ ok: true });

    renderControl();
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "read" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(submitCustodialMock).toHaveBeenCalledTimes(2));
    const calls = submitCustodialMock.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(
      expect.objectContaining({ bookSlug: "orbital", shelfSlug: "reading", polarity: -1 }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ bookSlug: "orbital", shelfSlug: "read", polarity: 1 }),
    );
  });
});
