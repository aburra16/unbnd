// Failing tests (red) for Story 22 AC-9 — the cache-bust the Settings save
// calls on success. ADR 0022 Decision 4 / Implementation notes: useProfileMeta
// gains an exported `invalidateProfileMeta(idOrNpub)` that deletes the mem-cache
// + sessionStorage entry and clears `fetchedThisSession` for that id, so the
// next mount of /profile/me (and AccountMenu) re-reads. `invalidateProfileMeta`
// is not exported yet → import fails → red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor as rtlWaitFor } from "@testing-library/react";
import {
  useProfileMeta,
  invalidateProfileMeta,
  __resetProfileMetaCache,
} from "../../src/hooks/useProfileMeta";

const profileGetMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  api: { profile: { get: (...a: unknown[]) => profileGetMock(...a) } },
}));

const ID = "npub1cacheme";
const META = { npub: ID, substack: "https://mira.substack.com" };

function Probe() {
  const meta = useProfileMeta(ID);
  return <span data-testid="sub">{meta?.substack ?? "none"}</span>;
}

beforeEach(() => {
  __resetProfileMetaCache();
  profileGetMock.mockReset().mockResolvedValue({ profile: META });
});
afterEach(() => vi.clearAllMocks());

describe("invalidateProfileMeta (AC-9)", () => {
  it("drops the cached entry so a remount re-reads from the API", async () => {
    const first = render(<Probe />);
    await rtlWaitFor(() =>
      expect(screen.getByTestId("sub").textContent).toBe(META.substack),
    );
    expect(profileGetMock).toHaveBeenCalledTimes(1);
    first.unmount();

    // Without invalidation, a remount serves the cache and does NOT refetch.
    invalidateProfileMeta(ID);

    render(<Probe />);
    // The mem + session cache were dropped → the hook fetches again.
    await rtlWaitFor(() => expect(profileGetMock).toHaveBeenCalledTimes(2));
  });

  it("clears the sessionStorage entry for the id", async () => {
    sessionStorage.setItem(`unbnd:profile:${ID}`, JSON.stringify(META));
    invalidateProfileMeta(ID);
    expect(sessionStorage.getItem(`unbnd:profile:${ID}`)).toBeNull();
  });
});
