// Failing tests (red) for Story 68 / ADR 0067 — the VouchButton on a profile and
// the Curate nav entry. The button is gated on signed-in + vouch-eligible +
// viewing-another; the Curate link shows only for a signed-in curator. Both are
// stubs today → the positive cases fail red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VouchButton } from "../../src/components/VouchButton";
import { CurateNavLink } from "../../src/components/CurateNavLink";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const meCuratorMock = vi.fn();
const vouchStatusMock = vi.fn();
const vouchTemplateMock = vi.fn();
const vouchMock = vi.fn();
const vouchCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: {
      meCurator: (...a: unknown[]) => meCuratorMock(...a),
      vouchStatus: (...a: unknown[]) => vouchStatusMock(...a),
      vouchTemplate: (...a: unknown[]) => vouchTemplateMock(...a),
      vouch: (...a: unknown[]) => vouchMock(...a),
      vouchCustodial: (...a: unknown[]) => vouchCustodialMock(...a),
    },
  },
}));

const TARGET = "npub1target00000000000000000000000000000000000000000000000000";
const VIEWER = "npub1viewer00000000000000000000000000000000000000000000000000";
const viewer = { id: "u1", email: null, displayName: "Reader", npub: VIEWER };

beforeEach(() => {
  sessionMock.mockReset();
  meCuratorMock.mockReset().mockResolvedValue({ isCurator: false, canVouch: false });
  vouchStatusMock.mockReset().mockResolvedValue({ vouched: false });
});
afterEach(() => vi.clearAllMocks());

const renderVouch = (target = TARGET) =>
  render(
    <MemoryRouter>
      <VouchButton target={target} />
    </MemoryRouter>,
  );

describe("VouchButton — visibility (AC-1)", () => {
  it("signed out → renders nothing, does not query eligibility", () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    const { container } = renderVouch();
    expect(container).toBeEmptyDOMElement();
  });

  it("viewing your OWN profile → renders nothing", () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: { ...viewer, npub: TARGET }, refresh: vi.fn() });
    const { container } = renderVouch(TARGET);
    expect(container).toBeEmptyDOMElement();
  });

  it("eligible viewer on another profile → shows a 'Vouch as curator' control", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: viewer, refresh: vi.fn() });
    meCuratorMock.mockResolvedValue({ isCurator: true, canVouch: true });
    renderVouch();
    expect(await screen.findByRole("button", { name: /vouch as curator/i })).toBeInTheDocument();
  });

  it("already vouched → shows 'Vouched'", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: viewer, refresh: vi.fn() });
    meCuratorMock.mockResolvedValue({ isCurator: true, canVouch: true });
    vouchStatusMock.mockResolvedValue({ vouched: true });
    renderVouch();
    expect(await screen.findByRole("button", { name: /vouched/i })).toBeInTheDocument();
  });
});

describe("CurateNavLink (AC-4)", () => {
  it("a signed-in curator sees a Curate link to /submissions", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: viewer, refresh: vi.fn() });
    meCuratorMock.mockResolvedValue({ isCurator: true, canVouch: true });
    render(
      <MemoryRouter>
        <CurateNavLink />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: /curate/i });
    expect(link).toHaveAttribute("href", "/submissions");
  });

  it("a non-curator sees no Curate link", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: viewer, refresh: vi.fn() });
    meCuratorMock.mockResolvedValue({ isCurator: false, canVouch: false });
    render(
      <MemoryRouter>
        <CurateNavLink />
      </MemoryRouter>,
    );
    // No Curate link for a non-curator (the impl resolves isCurator:false → null).
    expect(screen.queryByRole("link", { name: /curate/i })).not.toBeInTheDocument();
  });
});
