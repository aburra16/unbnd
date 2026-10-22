// One image from a list of sources (Story 111 / ADR 0099 §5): the proxied
// image first, the original next. Each load error moves to the next source;
// `src` is undefined once every source has failed, so the caller can draw its
// placeholder. New sources start over.
import { useState } from "react";

export function useImageFallback(...sources: Array<string | undefined>): {
  src: string | undefined;
  onError: () => void;
} {
  const usable = sources.filter((s): s is string => Boolean(s));
  const key = usable.join("\n");
  const [failed, setFailed] = useState({ key, count: 0 });
  const count = failed.key === key ? failed.count : 0;
  return {
    src: usable[count],
    onError: () => setFailed((f) => ({ key, count: (f.key === key ? f.count : 0) + 1 })),
  };
}
