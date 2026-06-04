// Failing tests (red) for Story 53 — the book-detail <Blurb> component, per
// ADR 0052 (Option A). New file `apps/web/src/components/Blurb.tsx`:
//   - Renders the blurb paragraph `<p className="bh-blurb …">` (clamped via a
//     `bh-blurb--clamped` modifier in the collapsed state).
//   - Overflow detection: a ref on the paragraph, measured in a useLayoutEffect
//     as `el.scrollHeight > el.clientHeight` (re-measured on resize via a
//     ResizeObserver). The Read more / Read less toggle renders ONLY when the
//     clamped blurb overflows.
//   - Toggle: the @unbnd/ui `Link variant="plain-amber"` (its DEFAULT_TAG is a
//     real <button>), carrying `aria-expanded` (`false` collapsed → `true`
//     expanded) and an onClick that flips `expanded`. Label "Read more" /
//     "Read less". Expanding removes the `bh-blurb--clamped` modifier.
//   - Source link: rendered only when `openLibraryId` is present, a
//     `Link variant="plain-muted" as="a"` external anchor →
//     `https://openlibrary.org/works/<id>`, `target="_blank"`,
//     `rel` containing noopener/noreferrer.
//   - No blurb → renders nothing (no `.bh-blurb`).
//
// MEASUREMENT SEAM (documented for the Implementer):
//   happy-dom has NO layout engine, so `scrollHeight`/`clientHeight` are both 0
//   on every element — a measured `scrollHeight > clientHeight` is `0 > 0`,
//   i.e. ALWAYS false. These tests STUB the measurement by defining
//   `scrollHeight`/`clientHeight` getters on `HTMLElement.prototype` BEFORE
//   render, so the component's useLayoutEffect reads the stubbed values and
//   computes `hasOverflow` from them. This assumes the component measures via a
//   standard DOM read on the `.bh-blurb` element's own `scrollHeight` /
//   `clientHeight` (the ADR's ref seam) — no test-only prop is required. The
//   ResizeObserver is also stubbed to a no-op so the effect doesn't throw under
//   happy-dom (it has no native ResizeObserver). If the Implementer's seam ends
//   up reading a wrapper element rather than the `.bh-blurb` paragraph, the
//   prototype-level stub here still applies (it covers every HTMLElement), so
//   no change is needed on the test side.
//
// Blurb does not exist yet → the opaque dynamic import resolves to "module not
// found" at first await → clean assertion-level red (not a tsc compile wall),
// mirroring apps/seeder/test/_load.ts.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Opaque-specifier loader: keeps the not-yet-existing module hidden from tsc's
// resolver, so `pnpm -r typecheck` stays clean while Blurb.tsx is missing and
// the red is an assertion-level "Cannot find module", not a TS2307 compile wall.
// ---------------------------------------------------------------------------
type BlurbProps = { blurb?: string; openLibraryId?: string };
type BlurbModule = { Blurb: ComponentType<BlurbProps> };

async function loadBlurb(): Promise<ComponentType<BlurbProps>> {
  const spec = "../../src/components/Blurb";
  const mod = (await import(/* @vite-ignore */ spec)) as BlurbModule;
  return mod.Blurb;
}

// ---------------------------------------------------------------------------
// Measurement seam stubs. happy-dom reports 0 for both heights, so we override
// the prototype getters to force a known overflow state for the duration of a
// test, then restore them in afterEach.
// ---------------------------------------------------------------------------
const ORIGINAL = {
  scrollHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollHeight",
  ),
  clientHeight: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  ),
};

/** Force the clamped-overflow measurement: scrollHeight > clientHeight. */
function stubOverflow(overflows: boolean) {
  const scroll = overflows ? 400 : 80;
  const client = 80;
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return scroll;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return client;
    },
  });
}

function restoreMeasurement() {
  if (ORIGINAL.scrollHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollHeight",
      ORIGINAL.scrollHeight,
    );
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
      .scrollHeight;
  }
  if (ORIGINAL.clientHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "clientHeight",
      ORIGINAL.clientHeight,
    );
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
      .clientHeight;
  }
}

const LONG_BLURB =
  "A sweeping novel of a coastal town across three generations, where the " +
  "lighthouse keeper's family weathers storms, fortunes, and the slow turning " +
  "of the tide. The prose is patient and the cast is wide, carrying the reader " +
  "from the herring boom to the quiet years after the cannery closed.";
const SHORT_BLURB = "A slim, complete back-cover line.";
const OL_ID = "OL45804W";

beforeEach(() => {
  // happy-dom has no ResizeObserver; provide a no-op so the component's
  // observer wiring (per ADR §2) doesn't throw on construct/observe.
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

afterEach(() => {
  cleanup();
  restoreMeasurement();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Toggle behavior (AC: clamp + Read more / Read less + aria-expanded).
// ---------------------------------------------------------------------------
describe("Blurb — Read more / Read less toggle (overflow present)", () => {
  it("renders a Read more control with aria-expanded=false when the blurb overflows", async () => {
    stubOverflow(true);
    const Blurb = await loadBlurb();
    render(<Blurb blurb={LONG_BLURB} />);

    const toggle = await screen.findByRole("button", { name: /read more/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("applies the clamp modifier class in the collapsed state", async () => {
    stubOverflow(true);
    const Blurb = await loadBlurb();
    const { container } = render(<Blurb blurb={LONG_BLURB} />);

    const para = container.querySelector(".bh-blurb");
    expect(para).not.toBeNull();
    expect(para!.classList.contains("bh-blurb--clamped")).toBe(true);
  });

  it("flips to Read less with aria-expanded=true and removes the clamp on click", async () => {
    stubOverflow(true);
    const Blurb = await loadBlurb();
    const { container } = render(<Blurb blurb={LONG_BLURB} />);

    const toggle = await screen.findByRole("button", { name: /read more/i });
    fireEvent.click(toggle);

    const expanded = await screen.findByRole("button", { name: /read less/i });
    expect(expanded).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelector(".bh-blurb")!.classList.contains("bh-blurb--clamped"),
    ).toBe(false);
  });

  it("collapses again on a second click (Read less → Read more, clamp restored)", async () => {
    stubOverflow(true);
    const Blurb = await loadBlurb();
    const { container } = render(<Blurb blurb={LONG_BLURB} />);

    fireEvent.click(await screen.findByRole("button", { name: /read more/i }));
    fireEvent.click(await screen.findByRole("button", { name: /read less/i }));

    const collapsed = await screen.findByRole("button", { name: /read more/i });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");
    expect(
      container.querySelector(".bh-blurb")!.classList.contains("bh-blurb--clamped"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No toggle when it fits (AC: short blurb, no overflow → no control).
// ---------------------------------------------------------------------------
describe("Blurb — no toggle when the blurb fits", () => {
  it("renders no Read more / Read less control when the clamped blurb does not overflow", async () => {
    stubOverflow(false);
    const Blurb = await loadBlurb();
    render(<Blurb blurb={SHORT_BLURB} />);

    // Let the layout effect run.
    await screen.findByText(SHORT_BLURB);
    expect(
      screen.queryByRole("button", { name: /read more|read less/i }),
    ).not.toBeInTheDocument();
  });

  it("still renders the full short blurb text", async () => {
    stubOverflow(false);
    const Blurb = await loadBlurb();
    render(<Blurb blurb={SHORT_BLURB} />);
    expect(await screen.findByText(SHORT_BLURB)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Source: Open Library link (AC: openLibraryId present / absent).
// ---------------------------------------------------------------------------
describe("Blurb — Source: Open Library link", () => {
  it("renders an external Source: Open Library anchor when openLibraryId is present", async () => {
    stubOverflow(false);
    const Blurb = await loadBlurb();
    render(<Blurb blurb={SHORT_BLURB} openLibraryId={OL_ID} />);

    const link = await screen.findByRole("link", { name: /source: open library/i });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute(
      "href",
      `https://openlibrary.org/works/${OL_ID}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    const rel = link.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  it("renders no Source link when openLibraryId is absent", async () => {
    stubOverflow(false);
    const Blurb = await loadBlurb();
    render(<Blurb blurb={SHORT_BLURB} />);

    await screen.findByText(SHORT_BLURB);
    expect(
      screen.queryByRole("link", { name: /source: open library/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the Source link independent of overflow (shown with the toggle too)", async () => {
    stubOverflow(true);
    const Blurb = await loadBlurb();
    render(<Blurb blurb={LONG_BLURB} openLibraryId={OL_ID} />);

    expect(
      await screen.findByRole("link", { name: /source: open library/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /read more/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// No blurb (AC: graceful absence).
// ---------------------------------------------------------------------------
describe("Blurb — no blurb", () => {
  it("renders nothing (no .bh-blurb) when there is no blurb", async () => {
    stubOverflow(true);
    const Blurb = await loadBlurb();
    const { container } = render(<Blurb />);

    expect(container.querySelector(".bh-blurb")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /read more|read less/i }),
    ).not.toBeInTheDocument();
  });
});
