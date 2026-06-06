// Story 67 / ADR 0066 — the Curator badge on a profile. Resolves the owner's
// curator status (seed OR vouched OR emergent, server-side) and renders a neutral
// @unbnd/ui Pill labelled "Curator" when they are a curator; nothing otherwise.
import { useEffect, useState } from "react";
import { Pill } from "@unbnd/ui";
import { api } from "../lib/api";

export function CuratorBadge({ npub }: { npub: string }) {
  const [isCurator, setIsCurator] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.profile
      .curatorStatus(npub)
      .then((r) => !cancelled && setIsCurator(r.isCurator))
      .catch(() => !cancelled && setIsCurator(false));
    return () => {
      cancelled = true;
    };
  }, [npub]);

  if (!isCurator) return null;
  return <Pill variant="genre" label="Curator" />;
}
