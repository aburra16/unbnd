import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TagControl } from "../../src/components/TagControl";
import type { BookTags } from "../../src/lib/api";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const listMock = vi.fn();
const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    tags: {
      list: (...a: unknown[]) => listMock(...a),
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

const EMPTY: BookTags = { genres: [], styles: [], signals: [] };

beforeEach(() => {
  listMock.mockReset().mockResolvedValue({
    tags: [
      { slug: "mystery", type: "genre", name: "Mystery", sensitivity: "normal" },
      { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
      { slug: "short-novel", type: "style", name: "Short novel", sensitivity: "normal" },
    ],
  });
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

function renderControl(tags: BookTags = EMPTY) {
  return render(
    <MemoryRouter>
      <TagControl bookSlug="orbital" tags={tags} />
    </MemoryRouter>,
  );
}

describe("TagControl — gating", () => {
  it("prompts account creation and offers no picker when signed out (Story 73)", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderControl();
    expect(
      await screen.findByText(/create a free account to suggest a genre or style\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/auth");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("never offers accusatory tags in the picker", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    renderControl();
    await screen.findByRole("combobox");
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByRole("option", { name: /AI generated/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mystery" })).toBeInTheDocument();
  });
});

describe("TagControl — sovereign", () => {
  it("runs template → signEvent → submit on apply", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [], content: "", sig: "s" });
    submitMock.mockResolvedValue({ ok: true });

    renderControl();
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "mystery" } });
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));

    await waitFor(() => expect(templateMock).toHaveBeenCalledWith({ bookSlug: "orbital", tagSlug: "mystery", tagType: "genre", polarity: 1 }));
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    await waitFor(() => expect(submitMock).toHaveBeenCalled());
  });
});

describe("TagControl — custodial", () => {
  it("server-signs via submitCustodial on dispute (no extension)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodialUser, refresh: vi.fn() });
    submitCustodialMock.mockResolvedValue({ ok: true });

    renderControl();
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "short-novel" } });
    fireEvent.click(screen.getByRole("button", { name: /dispute/i }));

    await waitFor(() =>
      expect(submitCustodialMock).toHaveBeenCalledWith({ bookSlug: "orbital", tagSlug: "short-novel", tagType: "style", polarity: -1 }),
    );
    expect(signEvent).not.toHaveBeenCalled();
  });
});
