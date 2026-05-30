import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  useProfileMeta,
  __resetProfileMetaCache,
} from "../../src/hooks/useProfileMeta";

const profileGetMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  api: { profile: { get: (...a: unknown[]) => profileGetMock(...a) } },
}));

const ID = "npub1cacheme";
const META = { npub: ID, picture: "https://x/pic.jpg", displayName: "Mira" };

// Tiny probe: render the hook's picture (or "none") so we can assert on it.
function Probe() {
  const meta = useProfileMeta(ID);
  return <span data-testid="pic">{meta?.picture ?? "none"}</span>;
}

beforeEach(() => {
  __resetProfileMetaCache();
  profileGetMock.mockReset().mockResolvedValue({ profile: META });
});
afterEach(() => vi.clearAllMocks());

describe("useProfileMeta caching", () => {
  it("fetches once, then resolves the picture", async () => {
    render(<Probe />);
    // Starts uncached → "none", then fills in after the fetch.
    expect(screen.getByTestId("pic").textContent).toBe("none");
    await waitFor(() =>
      expect(screen.getByTestId("pic").textContent).toBe(META.picture),
    );
    expect(profileGetMock).toHaveBeenCalledTimes(1);
  });

  it("serves the cached value synchronously on remount with no refetch (no flash)", async () => {
    const first = render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("pic").textContent).toBe(META.picture),
    );
    first.unmount();

    // Simulates a navigation/refresh remount within the session.
    render(<Probe />);
    // Cached value is present on the very first paint — never "none".
    expect(screen.getByTestId("pic").textContent).toBe(META.picture);
    expect(profileGetMock).toHaveBeenCalledTimes(1); // not called again
  });

  it("hydrates synchronously from sessionStorage with cold memory (refresh, no flash)", () => {
    // A full page refresh keeps sessionStorage but drops module memory.
    // beforeEach cleared both, so seed sessionStorage only and leave memory cold.
    sessionStorage.setItem(`unbnd:profile:${ID}`, JSON.stringify(META));

    render(<Probe />);
    // The very first paint already shows the cached picture — never "none".
    expect(screen.getByTestId("pic").textContent).toBe(META.picture);
  });
});
