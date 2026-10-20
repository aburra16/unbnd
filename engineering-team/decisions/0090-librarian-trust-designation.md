# ADR 0090: The librarian's kind 10040 comes from Brainstorm's /setup

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/102-librarian-trust-designation.md`

## Context
Brainstorm-UI resolves an observer's lens by reading their kind 10040 (`services/trustSource.ts`), from the observer's NIP-65 write relays and its profile relays. The places curator (Mise En Place) has one, written by Brainstorm's client: `30382:rank` and `30382:followers` naming scorer `151466c4…` on `wss://scores.brainstorm.world`. The librarian has none. Brainstorm's `/setup/6aca05b8…` (checked 2026-10-20) lists the librarian's scorer `4328261a…` for six score types on the same relay.

## Decision
1. **The designation is read from `/setup` at publish time**, not written into code. ADR 0088 made the librarian's profile reviewed code because it is ours to word; the scorer is assigned by Brainstorm per observer, and `/setup` is the authority Unbnd's own trust provider already uses. Pinning the key in code would make a Brainstorm reassignment a silent fault.
2. **Every well-formed entry is published**, not only `rank` and `followers`: a 10040 states which scorer to trust per score type, and the service lists six. A tag passes when its name is a kind, optionally with `:metric`, its second element is 64 hex, and its third a `wss://` URL.
3. **`librarian profile` publishes kind 0, then 10002, then 10040**, to the same relays (never dcosl). A `/setup` with no usable entries fails the command after the first two are published, so the operator sees it.
4. `BRAINSTORM_API_URL` (default `BRAINSTORM_DEFAULTS.apiUrl`) joins the profile config; the fetch is injected so the cycle stays fixture-testable.

## Consequences
- Brainstorm's book view gets a curator lens: the house view's value, through the same scorer Unbnd uses.
- Re-running `librarian-profile` refreshes the designation if Brainstorm ever reassigns the scorer.
