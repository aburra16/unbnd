# Story 107: The API reads the house observer the operator set

**Origin:** found while verifying story 105 on staging (2026-10-20). "Recently added" and the homepage shelves still showed a cache computed on 2026-06-05.

## Problem
ADR 0057 §5 made the house observer a config-only swap: set `HOUSE_OBSERVER_PUBKEY` in `/opt/unbnd/.env` and restart the readers, "since `apps/api` and `apps/shelves` already read it". The operator did, and set it to the librarian. But `docker-compose.prod.yml` passes that variable, and the Brainstorm endpoints (`TRUST_PROVIDER`, `BRAINSTORM_API_URL`, `TRUST_RELAYS`), to the shelves worker only. The API never receives them, so it falls back to its code defaults:

- The API's house view of ratings is nosfabrica's network; the shelves worker computes from the librarian's.
- The shelves worker writes the homepage cache under the librarian; the API reads it under nosfabrica and serves rows last written on 2026-06-05.
- The `set-brainstorm-endpoints` ops task rewrites `.env` and recreates the API, which changes nothing in the API.

## Acceptance criteria
1. The `api` service receives `HOUSE_OBSERVER_PUBKEY`, `TRUST_PROVIDER`, `BRAINSTORM_API_URL`, `TRUST_RELAYS` and `TRUST_FIXTURE` from `.env`, written exactly as the `shelves` service writes them.
2. A test holds every trust-reading service in `docker-compose.prod.yml` (`api`, `shelves`) to the same five lines, so the two cannot drift again.
3. After deploy the API's homepage shelves carry the shelves worker's latest `computedAt`.

## Out of scope
Changing what an unset `HOUSE_OBSERVER_PUBKEY` means in either app.
