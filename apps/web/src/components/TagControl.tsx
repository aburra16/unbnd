// Book-detail classification control (ADR 0010). Mirrors RatingControl:
// tier-gated apply/dispute over the genre/style taxonomy. Sovereign signs via
// window.nostr; custodial server-signs; signed-out gets a sign-in prompt.
// Genre + style only — quality-signal writes are deferred, accusatory tags are
// never offered here.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  ApiError,
  type BookTags,
  type SignedEvent,
  type TaxonomyElement,
} from "../lib/api";
import { useSession } from "../hooks/useSession";
import { GenrePill } from "./Pill";
import "./TagControl.css";

type Nip07 = {
  signEvent: (template: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) => Promise<SignedEvent>;
};

type Props = {
  bookSlug: string;
  tags: BookTags;
  onChanged?: () => void;
};

export function TagControl({ bookSlug, tags, onChanged }: Props) {
  const session = useSession();
  const [taxonomy, setTaxonomy] = useState<TaxonomyElement[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.tags
      .list()
      .then((res) => {
        if (!cancelled) setTaxonomy(res.tags);
      })
      .catch(() => {
        if (!cancelled) setTaxonomy([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only genre + style are user-writable here; accusatory tags are excluded.
  const options = useMemo(
    () =>
      taxonomy.filter(
        (t) =>
          (t.type === "genre" || t.type === "style") &&
          t.sensitivity !== "accusatory",
      ),
    [taxonomy],
  );

  const chips = [...tags.genres, ...tags.styles];
  const isSovereign =
    session.status === "signed-in" && session.user.email === null;

  async function write(polarity: 1 | -1) {
    const el = options.find((o) => o.slug === selected);
    if (!el) return;
    setStatus("submitting");
    setErrorMsg(null);
    const intent = {
      bookSlug,
      tagSlug: el.slug,
      tagType: el.type,
      polarity,
    } as const;
    try {
      if (isSovereign) {
        const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
        if (!nostr) {
          setErrorMsg("No Nostr extension found.");
          setStatus("error");
          return;
        }
        const { template } = await api.tags.template(intent);
        const signed = await nostr.signEvent(template);
        await api.tags.submit(signed);
      } else {
        await api.tags.submitCustodial(intent);
      }
      setStatus("done");
      onChanged?.();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Could not save your tag. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <section className="tagc" aria-label="Classify this book">
      <h2 className="tagc-title">Classification</h2>
      {chips.length === 0 ? (
        <p className="tagc-empty">No genres or styles applied yet.</p>
      ) : (
        <div className="tagc-chips">
          {chips.map((t) => (
            <GenrePill key={`${t.type}:${t.slug}`} label={t.name} count={t.applies} />
          ))}
        </div>
      )}

      {session.status === "signed-out" && (
        <p className="tagc-gate">
          <Link to="/auth">Sign in</Link> to apply or dispute a genre or style.
        </p>
      )}

      {session.status === "signed-in" && (
        <div className="tagc-form">
          <label className="tagc-label" htmlFor="tagc-select">
            Apply or dispute a tag
          </label>
          <select
            id="tagc-select"
            className="tagc-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a genre or style…</option>
            <optgroup label="Genres">
              {options
                .filter((o) => o.type === "genre")
                .map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Styles">
              {options
                .filter((o) => o.type === "style")
                .map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
          </select>
          <div className="tagc-actions">
            <button
              type="button"
              className="tagc-apply"
              disabled={!selected || status === "submitting"}
              onClick={() => write(1)}
            >
              Apply
            </button>
            <button
              type="button"
              className="tagc-dispute"
              disabled={!selected || status === "submitting"}
              onClick={() => write(-1)}
            >
              Dispute
            </button>
          </div>
          {status === "error" && errorMsg && (
            <p className="tagc-error" role="alert">
              {errorMsg}
            </p>
          )}
          {status === "done" && (
            <p className="tagc-ok" role="status">
              Saved. Thanks for classifying.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
