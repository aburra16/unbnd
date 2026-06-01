// Failing tests (red) for Story 29 AC-3 — the shared <CopyButton>. ADR 0030
// F1-A / Decision §1, new file `apps/web/src/components/CopyButton.tsx`:
//   - A real <button type="button"> (keyboard-focusable + Enter/Space activatable
//     for free), accessible name "Copy your npub" (aria-label).
//   - On activate: navigator.clipboard.writeText(FULL value). The full string is
//     copied even when a caller displays a truncated form (the truncated chip is
//     never what gets written).
//   - Success: visible label swaps to "Copied" and the copied state is announced
//     via a sibling <span role="status">.
//   - Failure (rejected promise OR clipboard absent): never throws, no unhandled
//     rejection, shows a transient "Copy failed" + role="status".
//   - Deterministic: the component renders only text labels, never a timestamp;
//     we assert the label text, not a timer expiry.
// CopyButton does not exist yet → import fails → red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "../../src/components/CopyButton";

const FULL_NPUB =
  "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";

const writeText = vi.fn();

/** Install a stubbed navigator.clipboard whose writeText is the mock above. */
function stubClipboard(impl: () => Promise<void>) {
  writeText.mockReset().mockImplementation(impl);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

/** Remove navigator.clipboard entirely (older browser / insecure context). */
function removeClipboard() {
  Object.defineProperty(navigator, "clipboard", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  stubClipboard(() => Promise.resolve());
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("CopyButton — accessible control (AC-3)", () => {
  it("renders a real button with the accessible name 'Copy your npub'", () => {
    render(<CopyButton value={FULL_NPUB} />);
    const btn = screen.getByRole("button", { name: /copy your npub/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("shows the idle label 'Copy' by default", () => {
    render(<CopyButton value={FULL_NPUB} />);
    expect(
      screen.getByRole("button", { name: /copy your npub/i }),
    ).toHaveTextContent(/copy/i);
  });
});

describe("CopyButton — copies the FULL value (AC-3)", () => {
  it("writes the full npub to the clipboard on click (not a truncated form)", async () => {
    render(<CopyButton value={FULL_NPUB} />);
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(FULL_NPUB);
  });

  it("is keyboard-activatable: Enter on the real button copies the full npub", async () => {
    render(<CopyButton value={FULL_NPUB} />);
    const btn = screen.getByRole("button", { name: /copy your npub/i });
    // A real <button> fires click on Enter; assert via fireEvent.click which the
    // browser synthesizes for keyboard activation of a button.
    fireEvent.keyDown(btn, { key: "Enter", code: "Enter" });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FULL_NPUB));
  });
});

describe("CopyButton — announces the copied state (AC-3)", () => {
  it("swaps the label to 'Copied' after a successful copy", async () => {
    render(<CopyButton value={FULL_NPUB} />);
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("announces the copy via a role=status region", async () => {
    render(<CopyButton value={FULL_NPUB} />);
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/copied/i);
  });
});

describe("CopyButton — clipboard failure is graceful (AC-3)", () => {
  it("shows 'Copy failed' and does not throw when writeText rejects", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyButton value={FULL_NPUB} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /copy your npub/i })),
    ).not.toThrow();
    expect(await screen.findByText(/copy failed/i)).toBeInTheDocument();
  });

  it("announces the failure via role=status", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyButton value={FULL_NPUB} />);
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/copy failed/i);
  });

  it("does not throw when navigator.clipboard is absent and reports failure", async () => {
    removeClipboard();
    render(<CopyButton value={FULL_NPUB} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /copy your npub/i })),
    ).not.toThrow();
    expect(await screen.findByText(/copy failed/i)).toBeInTheDocument();
    // No write attempt is reachable when clipboard is missing.
    expect(writeText).not.toHaveBeenCalled();
  });

  it("never reports success when the copy did not happen", async () => {
    removeClipboard();
    render(<CopyButton value={FULL_NPUB} />);
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    await screen.findByText(/copy failed/i);
    expect(screen.queryByText(/^copied$/i)).not.toBeInTheDocument();
  });
});
