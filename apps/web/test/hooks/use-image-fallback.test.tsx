// Story 111 review round 1 (N2): new sources start over.
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useImageFallback } from "../../src/hooks/useImageFallback";

describe("useImageFallback", () => {
  it("starts over when the sources change", () => {
    const { result, rerender } = renderHook(({ a, b }) => useImageFallback(a, b), { initialProps: { a: "/img/1.webp", b: "https://x/1.jpg" } });
    act(() => result.current.onError());
    act(() => result.current.onError());
    expect(result.current.src).toBeUndefined();
    rerender({ a: "/img/2.webp", b: "https://x/2.jpg" });
    expect(result.current.src).toBe("/img/2.webp");
  });
});
