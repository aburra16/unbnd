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
// Source the row shape from the REAL list-response contract (ADR 0031 §3b
// remediation). The masking gap was that the mock rows were untyped, so they
// could omit `canPromote`/`promotionStatus`/`signals` silently while the server
// never produced them. Typing the factory + the `list` mock against the real
// `SubmittedBook` (the type `api.submissions.list()` returns) pins the mock to the
// server contract: a row missing a server field now fails at the type level, not
// silently rendering nothing.
import type { SubmittedBook } from "../../src/lib/api";

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

// The list row as the REAL enriched `GET /api/submissions` produces it (ADR 0031
// §3b): `SubmittedBook` with the three server-computed Story-30 fields made
// REQUIRED. The shipped `SubmittedBook` carries them optional (additive, so old
// callers keep compiling); but the enriched list ALWAYS produces them, and the
// web renders them per row. Requiring them here is what closes the masking gap —
// a fixture that omits any of the three no longer compiles, so the test can never
// again pass against a list response that silently dropped a server field.
type ListSubmission = SubmittedBook & {
  canPromote: boolean;
  promotionStatus: string | null;
  signals: SubmittedBook["signals"];
};

// The exact shape `api.submissions.list()` resolves to (mock typed to the real
// contract → it cannot drift from the server response).
type ListResponse = { submissions: ListSubmission[] };

function submission(over: Partial<ListSubmission> = {}): ListSubmission {
  return {
    slug: "ol-some-book",
    title: "A Submitted Book",
    authorName: "Some Author",
    createdAt: 1_700_000_000,
    submitter: SUBMITTER_NPUB,
    canPromote: false,
    promotionStatus: null,
    signals: null,
    ...over,
  };
}

// Type-tie the `list` mock's resolution to the real list-response shape.
const resolveList = (r: ListResponse): ListResponse => r;

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
    listMock.mockResolvedValue(resolveList({ submissions: [submission({ canPromote: false })] }));
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
    listMock.mockResolvedValue(resolveList({ submissions: [submission({ canPromote: false })] }));
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
    listMock.mockResolvedValue(resolveList({ submissions: [submission({ canPromote: true })] }));
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
    listMock.mockResolvedValue(resolveList({ submissions: [submission({ canPromote: true })] }));
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
    listMock.mockResolvedValue(
      resolveList({
        submissions: [submission({ canPromote: true, promotionStatus: "done" })],
      }),
    );
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/in catalog/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });
});

describe("CommunitySubmissions — trust signals render (AC-2, AC-6)", () => {
  it("renders the curator count and trust-weighted average when signals are present", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue(
      resolveList({
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
      }),
    );
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/3/)).toBeInTheDocument(); // curator count
    expect(screen.getByText(/4\.5/)).toBeInTheDocument(); // weighted average
  });

  it("renders the honest 'no trusted signal yet' state when signals is null", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue(resolveList({ submissions: [submission({ signals: null })] }));
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/no trusted signal yet/i)).toBeInTheDocument();
  });
});

describe("CommunitySubmissions — submitted-by credit (provenance, optional)", () => {
  it("still credits the submitter ('added by') alongside the new gate/signal surface", async () => {
    useSessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue(resolveList({ submissions: [submission({ submitter: SUBMITTER_NPUB })] }));
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.getByText(/added by/i)).toBeInTheDocument();
  });
});
