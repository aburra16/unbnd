// Book-detail shelf control (ADR 0018, Story 18). Mirrors RatingControl /
// TagControl: tier-gated add/remove of a book on a shelf. Sovereign signs via
// window.nostr; custodial server-signs; signed-out gets a sign-in prompt. The
// three reading-state defaults are fixed constants (PRD §5.6); a custom shelf
// is named at the moment a book is added to it. Adding to a default shelf when
// the book is on another default moves it (retract old, apply new — two writes,
// AC-5).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  ApiError,
  type Shelf,
  type ShelfInput,
  type SignedEvent,
} from "../lib/api";
import { useSession } from "../hooks/useSession";
import { GenrePill } from "./Pill";
import "./ShelfControl.css";

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
};

// The three reading-state defaults, fixed by PRD §5.6.
const DEFAULTS = [
  { slug: "want-to-read", name: "Want to Read" },
  { slug: "reading", name: "Reading" },
  { slug: "read", name: "Read" },
] as const;
const DEFAULT_SLUGS = new Set<string>(DEFAULTS.map((d) => d.slug));

const NEW_SHELF = "__new__";

function toShelfSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ShelfControl({ bookSlug }: Props) {
  const session = useSession();
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selected, setSelected] = useState("");
  const [customName, setCustomName] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const signedIn = session.status === "signed-in";

  function load() {
    api.shelves
      .mine()
      .then((res) => setShelves(res.shelves))
      .catch(() => setShelves([]));
  }

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    api.shelves
      .mine()
      .then((res) => !cancelled && setShelves(res.shelves))
      .catch(() => !cancelled && setShelves([]));
    return () => {
      cancelled = true;
    };
  }, [signedIn, bookSlug]);

  // Shelves this book currently sits on (membership chips + remove targets).
  const current = useMemo(
    () => shelves.filter((s) => s.books.some((b) => b.bookSlug === bookSlug)),
    [shelves, bookSlug],
  );

  // Custom shelves the user already has, offered alongside the defaults.
  const customShelves = useMemo(
    () => shelves.filter((s) => !DEFAULT_SLUGS.has(s.slug)),
    [shelves],
  );

  const isSovereign =
    session.status === "signed-in" && session.user.email === null;

  async function publishIntent(intent: ShelfInput) {
    if (isSovereign) {
      const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
      if (!nostr) throw new Error("No Nostr extension found.");
      const { template } = await api.shelves.template(intent);
      const signed = await nostr.signEvent(template);
      await api.shelves.submit(signed);
    } else {
      await api.shelves.submitCustodial(intent);
    }
  }

  async function add() {
    let shelfSlug = selected;
    let shelfName: string | undefined;
    if (selected === NEW_SHELF) {
      const trimmed = customName.trim();
      const slug = toShelfSlug(trimmed);
      if (!slug) {
        setErrorMsg("Give the shelf a name.");
        setStatus("error");
        return;
      }
      shelfSlug = slug;
      shelfName = trimmed;
    }
    if (!shelfSlug) return;

    setStatus("submitting");
    setErrorMsg(null);
    try {
      // Default shelves are mutually exclusive: adding to one removes the book
      // from any other default it is on (a move = retract old + apply new).
      if (DEFAULT_SLUGS.has(shelfSlug)) {
        const priorDefault = current.find(
          (s) => DEFAULT_SLUGS.has(s.slug) && s.slug !== shelfSlug,
        );
        if (priorDefault) {
          await publishIntent({
            bookSlug,
            shelfSlug: priorDefault.slug,
            polarity: -1,
          });
        }
      }
      await publishIntent({
        bookSlug,
        shelfSlug,
        ...(shelfName !== undefined ? { shelfName } : {}),
        polarity: 1,
      });
      setStatus("done");
      setSelected("");
      setCustomName("");
      load();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update your shelves. Try again.",
      );
      setStatus("error");
    }
  }

  async function remove(shelfSlug: string) {
    setStatus("submitting");
    setErrorMsg(null);
    try {
      await publishIntent({ bookSlug, shelfSlug, polarity: -1 });
      setStatus("done");
      load();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update your shelves. Try again.",
      );
      setStatus("error");
    }
  }

  return (
    <section className="shelfc" aria-label="Add this book to a shelf">
      <h2 className="shelfc-title">Shelves</h2>

      {current.length > 0 && (
        <div className="shelfc-current">
          {current.map((s) => (
            <span className="shelfc-chip" key={s.slug}>
              <GenrePill label={s.name} />
              <button
                type="button"
                className="shelfc-remove"
                disabled={status === "submitting"}
                onClick={() => remove(s.slug)}
              >
                Remove
              </button>
            </span>
          ))}
        </div>
      )}

      {session.status === "signed-out" && (
        <p className="shelfc-gate">
          <Link to="/auth">Sign in</Link> to add this book to a shelf.
        </p>
      )}

      {session.status === "signed-in" && (
        <div className="shelfc-form">
          <label className="shelfc-label" htmlFor="shelfc-select">
            Add to a shelf
          </label>
          <select
            id="shelfc-select"
            className="shelfc-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a shelf</option>
            <optgroup label="Reading state">
              {DEFAULTS.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </optgroup>
            {customShelves.length > 0 && (
              <optgroup label="Your shelves">
                {customShelves.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={NEW_SHELF}>New shelf…</option>
          </select>

          {selected === NEW_SHELF && (
            <div className="shelfc-new">
              <label className="shelfc-label" htmlFor="shelfc-name">
                Shelf name
              </label>
              <input
                id="shelfc-name"
                className="shelfc-input"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
          )}

          <div className="shelfc-actions">
            <button
              type="button"
              className="shelfc-add"
              disabled={
                !selected ||
                status === "submitting" ||
                (selected === NEW_SHELF && customName.trim() === "")
              }
              onClick={add}
            >
              Add
            </button>
          </div>

          {status === "error" && errorMsg && (
            <p className="shelfc-error" role="alert">
              {errorMsg}
            </p>
          )}
          {status === "done" && (
            <p className="shelfc-ok" role="status">
              Saved to your shelves.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
