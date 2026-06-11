// FAILING TESTS — Story 80 / ADR 0078 (web: the Remove-from-catalog action).
//
// DemoteControl renders the curator-only, community-only "Remove from
// catalog" action on the book page: nothing for non-curators or seeded
// books; a confirm step before anything is sent (a destructive action); on
// confirm it posts api.submissions.demote and settles into a calm requested
// state (the worker fulfills asynchronously, like reveal).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DemoteControl } from "../../src/components/DemoteControl";

const demoteMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: {
      demote: (...a: unknown[]) => demoteMock(...a),
    },
  },
}));

afterEach(() => {
  demoteMock.mockReset();
  vi.clearAllMocks();
});

function renderControl(props: { source?: string; canCurate?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <DemoteControl
        bookSlug="orbital--x"
        source={props.source ?? "community"}
        canCurate={props.canCurate ?? true}
      />
    </MemoryRouter>,
  );
}

describe("DemoteControl — visibility (AC-1)", () => {
  it("renders nothing for a non-curator", () => {
    renderControl({ canCurate: false });
    expect(screen.queryByRole("button", { name: /remove from catalog/i })).not.toBeInTheDocument();
  });

  it("renders nothing for a seeded (non-community) book, and nothing when source is unknown", () => {
    const seeded = renderControl({ source: "openlibrary" });
    expect(screen.queryByRole("button", { name: /remove from catalog/i })).not.toBeInTheDocument();
    seeded.unmount();

    renderControl({ source: undefined });
    expect(screen.queryByRole("button", { name: /remove from catalog/i })).not.toBeInTheDocument();
  });
});

describe("DemoteControl — the confirm-gated action (AC-2)", () => {
  it("curator + community book: offers the action, confirm-gated (nothing sent before confirm)", async () => {
    renderControl();
    const btn = await screen.findByRole("button", { name: /remove from catalog/i });
    fireEvent.click(btn);

    expect(
      await screen.findByText(/remove this book from the catalog\?/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/goes back to community submissions/i)).toBeInTheDocument();
    expect(demoteMock).not.toHaveBeenCalled();
  });

  it("'Keep it' dismisses the confirm with nothing sent", async () => {
    renderControl();
    fireEvent.click(await screen.findByRole("button", { name: /remove from catalog/i }));
    fireEvent.click(await screen.findByRole("button", { name: /keep it/i }));
    await waitFor(() =>
      expect(screen.queryByText(/remove this book from the catalog\?/i)).not.toBeInTheDocument(),
    );
    expect(demoteMock).not.toHaveBeenCalled();
  });

  it("confirm posts the demotion and settles into a calm requested state", async () => {
    demoteMock.mockResolvedValue({ status: "queued" });
    renderControl();
    fireEvent.click(await screen.findByRole("button", { name: /remove from catalog/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(demoteMock).toHaveBeenCalledWith("orbital--x"));
    expect(await screen.findByText(/removal requested/i)).toBeInTheDocument();
    expect(screen.getByText(/catalog updates shortly/i)).toBeInTheDocument();
    // The action does not re-offer itself while the worker fulfills.
    expect(screen.queryByRole("button", { name: /remove from catalog/i })).not.toBeInTheDocument();
  });

  it("a failed request surfaces an honest in-place error, no false requested state", async () => {
    demoteMock.mockRejectedValue(new Error("network"));
    renderControl();
    fireEvent.click(await screen.findByRole("button", { name: /remove from catalog/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/removal requested/i)).not.toBeInTheDocument();
  });
});
