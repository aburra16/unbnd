// Story 30 / ADR 0031 §4 — the web Promote affordance + pending/in-catalog
// states + trust signals + (optional) "submitted by" credit on the community
// submissions surface. Role-scoped queries, mocked api/useSession/useTrustView,
// NO network.
//
// Contract pinned (the observable UX from the ADR):
//   - signed-out OR below-gate → NO Promote affordance (server still enforces).
//   - above-gate → a Promote control.
//   - after promote → a pending "Promotion queued" state.
//   - trust signals render: a curator count/identities + the weighted average,
//     OR the honest "no trusted signal yet" when signals is null.
//
// RED until CommunitySubmissions renders the gated Promote action + states +
// signals (and `api.submissions` exposes `promote` + the gate/signal shape).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommunitySubmissions } from "../../src/routes/CommunitySubmissions";

const listMock = vi.fn();
const promoteMock = vi.fn();
const meMock = vi.fn();

vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: {
      list: (...a: unknown[]) => listMock(...a),
      promote: (...a: unknown[]) => promoteMock(...a),
    },
    auth: { me: (...a: unknown[]) => meMock(...a) },
    profile: { get: vi.fn(async () => ({ profile: {} })) },
  },
}));

// useSession drives the gate-aware render. We stub it per-test.
const useSessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => useSessionMock(),
}));

const SUBMITTER_NPUB = "npub1submtr0000000000000000000000000000000000000000000000000000";
const CURATOR_NPUB = "npub1curator00000000000000000000000000000000000000000000000000";

// A submission as the gate-aware list returns it: a `canPromote` flag for the
// session user, a `promotionStatus`, and the trust `signals` (or null).
type Sig = {
  trustedAverage: number | null;
  curatorRatingCount: number;
  curatorTagCount: number;
  curators: string[];
} | null;

function submission(over: Record<string, unknown> = {}) {
  return {
    slug: "ol-some-book",
    title: "A Submitted Book",
    authorName: "Some Author",
    createdAt: 1_700_000_000,
    submitter: SUBMITTER_NPUB,
    canPromote: false,
    promotionStatus: null as null | string,
    signals: null as Sig,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CommunitySubmissions />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listMock.mockReset();
  promoteMock.mockReset().mockResolvedValue({ status: "queued" });
  meMock.mockReset();
  useSessionMock.mockReset().mockReturnValue({ status: "signed-out", refresh: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

describe("CommunitySubmissions — gated Promote affordance (AC-3)", () => {
  it("signed-out: shows NO Promote control", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue({ submissions: [submission({ canPromote: false })] });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("signed-in but below the gate: shows NO Promote control", async () => {
    useSessionMock.mockReturnValue({
      status: "signed-in",
      user: { npub: CURATOR_NPUB, displayName: "Reader", id: "u", email: null },
      refresh: vi.fn(),
    });
    listMock.mockResolvedValue({ submissions: [submission({ canPromote: false })] });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("above the gate: shows a Promote control", async () => {
    useSessionMock.mockReturnValue({
      status: "signed-in",
      user: { npub: CURATOR_NPUB, displayName: "Curator", id: "u", email: null },
      refresh: vi.fn(),
    });
    listMock.mockResolvedValue({ submissions: [submission({ canPromote: true })] });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByRole("button", { name: /promote/i })).toBeInTheDocument();
  });
});

describe("CommunitySubmissions — promote flow + pending state (AC-3, AC-7)", () => {
  it("clicking Promote calls api.submissions.promote(slug) and shows 'Promotion queued'", async () => {
    useSessionMock.mockReturnValue({
      status: "signed-in",
      user: { npub: CURATOR_NPUB, displayName: "Curator", id: "u", email: null },
      refresh: vi.fn(),
    });
    listMock.mockResolvedValue({ submissions: [submission({ canPromote: true })] });
    renderPage();
    await screen.findByText("A Submitted Book");

    fireEvent.click(screen.getByRole("button", { name: /promote/i }));
    expect(promoteMock).toHaveBeenCalledWith("ol-some-book");
    await waitFor(() => expect(screen.getByText(/promotion queued/i)).toBeInTheDocument());
  });

  it("an already-promoted submission renders an in-catalog state, not a Promote control", async () => {
    useSessionMock.mockReturnValue({
      status: "signed-in",
      user: { npub: CURATOR_NPUB, displayName: "Curator", id: "u", email: null },
      refresh: vi.fn(),
    });
    listMock.mockResolvedValue({
      submissions: [submission({ canPromote: true, promotionStatus: "done" })],
    });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/in catalog/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });
});

describe("CommunitySubmissions — trust signals render (AC-2, AC-6)", () => {
  it("renders the curator count and trust-weighted average when signals are present", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue({
      submissions: [
        submission({
          signals: {
            trustedAverage: 4.5,
            curatorRatingCount: 3,
            curatorTagCount: 1,
            curators: [CURATOR_NPUB],
          },
        }),
      ],
    });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/3/)).toBeInTheDocument(); // curator count
    expect(screen.getByText(/4\.5/)).toBeInTheDocument(); // weighted average
  });

  it("renders the honest 'no trusted signal yet' state when signals is null", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue({ submissions: [submission({ signals: null })] });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/no trusted signal yet/i)).toBeInTheDocument();
  });
});

describe("CommunitySubmissions — submitted-by credit (provenance, optional)", () => {
  it("still credits the submitter ('added by') alongside the new gate/signal surface", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue({ submissions: [submission({ submitter: SUBMITTER_NPUB })] });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/added by/i)).toBeInTheDocument();
  });
});
