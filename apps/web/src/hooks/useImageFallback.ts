// One image from a list of sources (Story 111 / ADR 0099 §5): the proxied
// image first, the original next. Each load error moves to the next source;
// `src` is undefined once every source has failed, so the caller can draw its
// placeholder.
import { useState } from "react";

export function useImageFallback(...sources: Array<string | undefined>): {
  src: string | undefined;
  onError: () => void;
} {
  const [failed, setFailed] = useState(0);
  const usable = sources.filter((s): s is string => Boolean(s));
  return { src: usable[failed], onError: () => setFailed((n) => n + 1) };
}
