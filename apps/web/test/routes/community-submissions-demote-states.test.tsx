// FAILING TESTS — Story 82 (Review #80 carry-forward): the in-flight demote
// states render honestly on the community-submissions list. A
// demote_pending/demoting row shows a quiet "Removal queued" (NO Promote
// button — pressing it would no-op while the UI lied); a demoted row stays a
// plain re-promotable submission (the Promote button), the ADR 0078 intent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommunitySubmissions } from "../../src/routes/CommunitySubmissions";
import type { SubmittedBook } from "../../src/lib/api";

const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: {
      list: (...a: unknown[]) => listMock(...a),
      promote: vi.fn(),
    },
    auth: { me: vi.fn(async () => ({ user: null })) },
    profile: { get: vi.fn(async () => ({ profile: {} })) },
  },
}));

function row(slug: string, promotionStatus: string | null): SubmittedBook {
  return {
    slug,
    title: `Title ${slug}`,
    authorName: "A. Author",
    createdAt: 1,
    canPromote: true,
    promotionStatus,
    signals: null,
  };
}

beforeEach(() => listMock.mockReset());
afterEach(() => vi.clearAllMocks());

async function renderList(rows: SubmittedBook[]) {
  listMock.mockResolvedValue({ submissions: rows });
  render(
    <MemoryRouter>
      <CommunitySubmissions />
    </MemoryRouter>,
  );
  await waitFor(() => expect(listMock).toHaveBeenCalled());
  await screen.findByText(`Title ${rows[0]!.slug}`);
}

describe("CommunitySubmissions — in-flight demote states (Story 82)", () => {
  it("a demote_pending row shows 'Removal queued' and NO Promote button", async () => {
    await renderList([row("going--a", "demote_pending")]);
    expect(await screen.findByText(/removal queued/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("a demoting row shows 'Removal queued' too", async () => {
    await renderList([row("going--b", "demoting")]);
    expect(await screen.findByText(/removal queued/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("a demoted row stays a plain re-promotable submission (Promote offered)", async () => {
    await renderList([row("back--c", "demoted")]);
    expect(await screen.findByRole("button", { name: /promote/i })).toBeInTheDocument();
    expect(screen.queryByText(/removal queued/i)).not.toBeInTheDocument();
  });
});
