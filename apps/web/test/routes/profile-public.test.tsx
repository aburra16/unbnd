// Failing tests (red) for Story 20 AC-1, AC-2, AC-3, AC-5, AC-6, AC-7 (web side)
// — the rewritten PUBLIC profile route /profile/:npub. Mirrors
// profile-me-polish.test.tsx (the /profile/me render) — the public view is the
// by-npub twin of it.
//
// ADR 0020 Decision 3: Profile.tsx is rewritten to read the TARGET from the
// public endpoints — identity via useProfileMeta(npub) (the public /api/profile/:id),
// shelves via api.profile.shelves(npub), counts via api.profile.stats(npub) — and
// renders the Story-19 treatment: Avatar + name/nip05/about (AC-1) or initials+npub
// fallback (AC-2); BookGrid of enriched PublicBooks (AC-3); present-only stat cells;
// a "Writes on Substack" link when meta.substack is set (AC-7); the existing
// NotFound when the npub is unresolvable (AC-6). The Mira fixture is gone (AC-5):
// Profile.tsx no longer imports profile-fixtures and renders no Mira data.
//
// The route param is renamed handle → npub, and api.profile.shelves / api.profile.stats
// do not exist yet, so this file is red until the rewrite lands.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Profile } from "../../src/routes/Profile";

const TARGET_NPUB =
  "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";

// useProfileMeta(npub) resolves the TARGET's identity from the public endpoint.
// Per-test we vary what it returns. displayNameOf is the real fallback chain.
const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

const shelvesMock = vi.fn();
const statsMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    // Nav -> useSession reads auth.me; reject so it settles to signed-out
    // without crashing on an undefined method (mirrors routes.smoke.test.tsx).
    auth: { me: vi.fn().mockRejectedValue(new Error("signed out")) },
    profile: {
      get: (...a: unknown[]) => Promise.resolve({ profile: { npub: a[0] } }),
      shelves: (...a: unknown[]) => shelvesMock(...a),
      stats: (...a: unknown[]) => statsMock(...a),
    },
  },
}));

const enrichedShelves = {
  shelves: [
    {
      slug: "want-to-read",
      name: "Want to Read",
      count: 2,
      books: [
        { slug: "ol-ol21177w", title: "Orbital", authorName: "Samantha Harvey", format: "reference", coverUrl: "https://covers/orbital.jpg" },
        { slug: "north-woods", title: "North Woods", authorName: "Daniel Mason", format: "reference" },
      ],
    },
  ],
};

beforeEach(() => {
  profileMetaMock.mockReset().mockReturnValue(null);
  shelvesMock.mockReset().mockResolvedValue({ shelves: [] });
  statsMock.mockReset().mockResolvedValue({ stats: {} });
});
afterEach(() => vi.clearAllMocks());

function renderAt(npub: string) {
  return render(
    <MemoryRouter initialEntries={[`/profile/${npub}`]}>
      <Routes>
        <Route path="/profile/:npub" element={<Profile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Profile /profile/:npub — identity header from kind-0 (AC-1)", () => {
  it("renders the target's name, nip05, and about from their kind-0", async () => {
    profileMetaMock.mockReturnValue({
      npub: TARGET_NPUB,
      name: "satoshi",
      displayName: "Satoshi N",
      nip05: "satoshi@example.com",
      about: "Builds things.",
      picture: "https://x/p.jpg",
    });
    renderAt(TARGET_NPUB);
    expect(await screen.findByRole("heading", { name: "Satoshi N" })).toBeInTheDocument();
    expect(screen.getByText("satoshi@example.com")).toBeInTheDocument();
    expect(screen.getByText("Builds things.")).toBeInTheDocument();
    // No Mira data anywhere.
    expect(screen.queryByText("Mira Calloway")).not.toBeInTheDocument();
  });

  it("resolves identity by the npub path param (not the session user)", async () => {
    renderAt(TARGET_NPUB);
    await waitFor(() => expect(profileMetaMock).toHaveBeenCalledWith(TARGET_NPUB));
  });
});

describe("Profile /profile/:npub — initials + npub fallback (AC-2)", () => {
  it("shows the npub and still renders shelves/counts when the target has no kind-0", async () => {
    profileMetaMock.mockReturnValue(null); // no resolvable kind-0
    shelvesMock.mockResolvedValue(enrichedShelves);
    statsMock.mockResolvedValue({ stats: { booksRated: 3 } });
    renderAt(TARGET_NPUB);
    // npub is shown (initials avatar + npub identity), no fabricated name.
    expect(await screen.findByText(TARGET_NPUB)).toBeInTheDocument();
    expect(screen.queryByText("Mira Calloway")).not.toBeInTheDocument();
    // Page still renders shelves + counts.
    expect(await screen.findByText("Orbital")).toBeInTheDocument();
    expect(screen.getByText("Books rated")).toBeInTheDocument();
  });
});

describe("Profile /profile/:npub — public shelves as a BookGrid (AC-3)", () => {
  it("renders the target's shelf books with title + author, not the raw slug", async () => {
    shelvesMock.mockResolvedValue(enrichedShelves);
    renderAt(TARGET_NPUB);
    expect(await screen.findByText("Orbital")).toBeInTheDocument();
    expect(screen.getByText("Samantha Harvey")).toBeInTheDocument();
    expect(
      screen.getByText("North Woods", { selector: ".book-title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Daniel Mason")).toBeInTheDocument();
    expect(screen.queryByText("ol-ol21177w")).not.toBeInTheDocument();
  });

  it("fetches shelves for the npub path param", async () => {
    shelvesMock.mockResolvedValue(enrichedShelves);
    renderAt(TARGET_NPUB);
    await waitFor(() => expect(shelvesMock).toHaveBeenCalledWith(TARGET_NPUB));
  });

  it("links each shelf book to its detail page", async () => {
    shelvesMock.mockResolvedValue(enrichedShelves);
    renderAt(TARGET_NPUB);
    const orbital = await screen.findByText("Orbital");
    expect(orbital.closest("a")).toHaveAttribute("href", "/book/ol-ol21177w");
  });
});

describe("Profile /profile/:npub — Mira fixture retired (AC-5)", () => {
  it("renders live API data, never the Mira fixture, even with empty reads", async () => {
    profileMetaMock.mockReturnValue({ npub: TARGET_NPUB, name: "Real User" });
    renderAt(TARGET_NPUB);
    expect(await screen.findByRole("heading", { name: "Real User" })).toBeInTheDocument();
    // Mira-fixture artefacts must not appear.
    expect(screen.queryByText("Mira Calloway")).not.toBeInTheDocument();
    expect(screen.queryByText("Top 2% curator")).not.toBeInTheDocument(); // TrustCard gone
    expect(screen.queryByText(/Asheville/i)).not.toBeInTheDocument(); // Mira bio gone
  });
});

describe("Profile /profile/:npub — invalid npub → NotFound, valid-empty renders (AC-6)", () => {
  it("renders the NotFound state when the API twins answer 404 for an unresolvable npub", async () => {
    // The shelves/stats twins answer 404 for an unresolvable segment.
    const notFound = Object.assign(new Error("not found"), { status: 404 });
    shelvesMock.mockRejectedValue(notFound);
    statsMock.mockRejectedValue(notFound);
    profileMetaMock.mockReturnValue(null);
    renderAt("not-a-real-npub");
    // The existing NotFound route (ADR 0020 Decision 3 — render NotFound, not a
    // crash and not the Mira mock). Its heading copy is the contract.
    expect(
      await screen.findByText(/not on the shelf|no such profile/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mira Calloway")).not.toBeInTheDocument();
  });

  it("does NOT render NotFound for a valid npub whose twins return 200-empty (renders the header)", async () => {
    // The discriminator: a valid-but-empty profile renders, only an unresolvable
    // npub is NotFound. This pole fails against the current fixture-driven
    // component (which renders NotFound for the renamed :npub param), proving the
    // rewrite is required — not a spurious pass on the invalid case alone.
    profileMetaMock.mockReturnValue({ npub: TARGET_NPUB, name: "Live User" });
    shelvesMock.mockResolvedValue({ shelves: [] });
    statsMock.mockResolvedValue({ stats: {} });
    renderAt(TARGET_NPUB);
    expect(
      await screen.findByRole("heading", { name: "Live User" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/not on the shelf|no such profile/i),
    ).not.toBeInTheDocument();
  });
});

describe("Profile /profile/:npub — Substack link display (AC-7)", () => {
  it("renders a 'Writes on Substack' link to the target's substack URL", async () => {
    profileMetaMock.mockReturnValue({
      npub: TARGET_NPUB,
      name: "Mira",
      substack: "https://mira.substack.com",
    });
    renderAt(TARGET_NPUB);
    const link = await screen.findByRole("link", { name: /writes on substack/i });
    expect(link).toHaveAttribute("href", "https://mira.substack.com");
  });

  it("renders no Substack link when the field is absent", async () => {
    profileMetaMock.mockReturnValue({ npub: TARGET_NPUB, name: "Mira" });
    renderAt(TARGET_NPUB);
    await screen.findByRole("heading", { name: "Mira" });
    expect(screen.queryByRole("link", { name: /writes on substack/i })).not.toBeInTheDocument();
  });
});
