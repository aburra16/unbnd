// FAILING TESTS — Story 92 / ADR 0083 (the contextual entry points).
// One quiet mark, seven placements; each routes one click to its anchor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GuideLink } from "../../src/components/GuideLink";
import { PoVBar } from "../../src/components/PoVBar";
import { HypeGapIndicator } from "../../src/components/HypeGapIndicator";
import { TasteMatchChip } from "../../src/components/TasteMatchChip";
import { TagControl } from "../../src/components/TagControl";
import { DemoteControl } from "../../src/components/DemoteControl";
import type { BookTags } from "../../src/lib/api";

const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));
const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: { tasteMatch: vi.fn(async () => ({ signedIn: true, match: { percentage: 87, commonBooks: 24 } })) },
    tags: { list: vi.fn(async () => ({ tags: [] })), template: vi.fn(), submit: vi.fn(), submitCustodial: vi.fn(), reveal: vi.fn() },
    submissions: { demote: vi.fn(async () => ({ status: "queued" })) },
  },
}));

beforeEach(() => {
  trustMock.mockReturnValue({ status: "ready", view: "house", setView: vi.fn(), personalize: vi.fn(), error: null, npub: "npub1x" });
  sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

const at = (el: HTMLElement | null, href: string) => {
  expect(el).not.toBeNull();
  expect(el).toHaveAttribute("href", href);
};

function findGuideLink(container: HTMLElement) {
  return container.querySelector("a.guide-what") as HTMLElement | null;
}

describe("GuideLink — the one quiet mark", () => {
  it("renders a muted link to the anchor with an explanatory aria-label", () => {
    const { container } = render(
      <MemoryRouter>
        <GuideLink to="/guide/ratings-you-can-trust#taste-match" label="Taste match" />
      </MemoryRouter>,
    );
    const a = findGuideLink(container);
    at(a, "/guide/ratings-you-can-trust#taste-match");
    expect(a).toHaveAccessibleName(/taste match.*guide/i);
  });
});

describe("the placements", () => {
  it("PoVBar (ready) carries the house-view door, signed out included", () => {
    const { container } = render(<MemoryRouter><PoVBar /></MemoryRouter>);
    at(findGuideLink(container), "/guide/ratings-you-can-trust#unbnd-house-view");
  });

  it("HypeGapIndicator carries the hype-gap door", () => {
    const { container } = render(
      <MemoryRouter><HypeGapIndicator rawAverage={3.0} trustedAverage={4.0} trustedCount={3} /></MemoryRouter>,
    );
    at(findGuideLink(container), "/guide/ratings-you-can-trust#hidden-gem-and-overhyped");
  });

  it("TasteMatchChip shows the door only with withGuideLink (the profile placement)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: { npub: "npub1me" }, refresh: vi.fn() });
    const withLink = render(
      <MemoryRouter><TasteMatchChip target="npub1x" withGuideLink /></MemoryRouter>,
    );
    await screen.findByText(/87% match/);
    at(findGuideLink(withLink.container), "/guide/ratings-you-can-trust#taste-match");
    withLink.unmount();
    const without = render(<MemoryRouter><TasteMatchChip target="npub1x" /></MemoryRouter>);
    await screen.findByText(/87% match/);
    expect(findGuideLink(without.container)).toBeNull();
  });

  it("TagControl carries the contested door when a chip is contested, and the reviewed door on the signals area", () => {
    const tags: BookTags = {
      genres: [{ slug: "g", name: "G", type: "genre", applies: 1, disputes: 2, trusted: true, contested: true }],
      styles: [],
      signals: [{ slug: "ai-generated", name: "AI generated", type: "signal", applies: 2, disputes: 0, trusted: true, revealed: true }],
    };
    const { container } = render(
      <MemoryRouter><TagControl bookSlug="b" tags={tags} /></MemoryRouter>,
    );
    const links = Array.from(container.querySelectorAll("a.guide-what")).map((a) => a.getAttribute("href"));
    expect(links).toContain("/guide/rating-reviewing-tagging#contested");
    expect(links).toContain("/guide/rating-reviewing-tagging#reviewed-signals");
  });

  it("TagControl shows NO contested door when nothing is contested", () => {
    const tags: BookTags = {
      genres: [{ slug: "g", name: "G", type: "genre", applies: 3, disputes: 0, trusted: true }],
      styles: [], signals: [],
    };
    const { container } = render(<MemoryRouter><TagControl bookSlug="b" tags={tags} /></MemoryRouter>);
    const links = Array.from(container.querySelectorAll("a.guide-what")).map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/guide/rating-reviewing-tagging#contested");
  });

  it("DemoteControl's requested state carries the removal door", async () => {
    const { container, getByRole, findByText } = render(
      <MemoryRouter><DemoteControl bookSlug="b" source="community" canCurate /></MemoryRouter>,
    );
    getByRole("button", { name: /remove from catalog/i }).click();
    (await findByText(/^Remove$/)).click();
    await findByText(/removal requested/i);
    at(findGuideLink(container), "/guide/for-curators#removing-a-book-from-the-catalog");
  });
});
