// Failing tests (red) for Story 70 / ADR 0068 — the hype-gap classifier + the
// HypeGapIndicator. Hidden gem when the trusted average exceeds the crowd by the
// margin; overhyped when the crowd exceeds the trusted; consensus when close;
// nothing below the trusted-rater minimum or with no trusted average. Stubs
// (classifyHypeGap throws; the indicator returns null) → positive cases fail red.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  classifyHypeGap,
  HYPE_GAP_MARGIN,
  HYPE_GAP_MIN_TRUSTED,
} from "../../src/lib/view-model";
import { HypeGapIndicator } from "../../src/components/HypeGapIndicator";

describe("classifyHypeGap", () => {
  const enough = HYPE_GAP_MIN_TRUSTED;

  it("hidden-gem when the trusted average exceeds the crowd by ≥ the margin", () => {
    expect(classifyHypeGap(3.5, 3.5 + HYPE_GAP_MARGIN, enough)).toBe("hidden-gem");
  });

  it("overhyped when the crowd average exceeds the trusted by ≥ the margin", () => {
    expect(classifyHypeGap(4.5, 4.5 - HYPE_GAP_MARGIN, enough)).toBe("overhyped");
  });

  it("consensus when the two averages are within the margin", () => {
    expect(classifyHypeGap(4.0, 4.0 + HYPE_GAP_MARGIN / 2, enough)).toBe("consensus");
  });

  it("null below the trusted-rater minimum, even with a wide gap", () => {
    expect(classifyHypeGap(3.0, 5.0, HYPE_GAP_MIN_TRUSTED - 1)).toBeNull();
  });

  it("null when there is no trusted average", () => {
    expect(classifyHypeGap(4.0, null, 0)).toBeNull();
  });
});

describe("HypeGapIndicator", () => {
  it("renders a Hidden gem signal when the trusted network rates above the crowd", () => {
    render(<HypeGapIndicator rawAverage={3.5} trustedAverage={4.6} trustedCount={3} />);
    expect(screen.getByText(/hidden gem/i)).toBeInTheDocument();
  });

  it("renders an Overhyped signal when the crowd rates above the trusted network", () => {
    render(<HypeGapIndicator rawAverage={4.6} trustedAverage={3.5} trustedCount={3} />);
    expect(screen.getByText(/overhyped/i)).toBeInTheDocument();
  });

  it("renders nothing on consensus", () => {
    const { container } = render(
      <HypeGapIndicator rawAverage={4.0} trustedAverage={4.1} trustedCount={3} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing below the trusted-rater minimum", () => {
    const { container } = render(
      <HypeGapIndicator rawAverage={3.0} trustedAverage={5.0} trustedCount={1} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
