# Trust seed harness — reproduce a House↔Yours divergence on staging

Part of Story 17 / ADR 0017. Two ways to make the trust-weighted view visibly
differ from the raw view on staging, so the value proposition can be verified or
demoed on demand. Neither requires recruiting real users.

The weighted view only differs from raw when **a trusted rater has rated a book
that other (untrusted) raters also rated**. So every mode below has the same
shape: publish a few ratings, make some raters trusted, observe the divergence at
`GET /api/books/<slug>/ratings` (the `weighted` block vs the raw `average`), or in
the UI via the PoV toggle (House vs Yours).

---

## Mode A — fixture (deterministic, no external dependency)

Uses the `fixture` trust provider (ADR 0017): the house observer's weights are
read straight from config, so the divergence is exact and reproducible with no
Brainstorm call and no GrapeRank wait. Best for demos and smoke checks.

1. **Seed a few ratings on one book** from operator-owned keys — say raters
   `R1`, `R2` give 5★ and `U` gives 1★ on book `<slug>`. Use the normal rating
   publish path (sovereign sign or the API), or publish kind-31..-rating events
   directly to dcosl/the local relay. Record each rater's **hex** pubkey.

2. **Make the house observer trust R1/R2 but not U.** Set, on the droplet `.env`:
   ```
   TRUST_PROVIDER=fixture
   TRUST_FIXTURE={"weights":{"<LIBRARIAN_HEX>":{"<R1_HEX>":0.9,"<R2_HEX>":0.9}}}
   ```
   `<LIBRARIAN_HEX>` is the house observer (`HOUSE_OBSERVER_PUBKEY`, the librarian).
   `U` is omitted, so it stays untrusted.

3. **Restart the API** so it picks up the new env (recreate just the api service;
   pin the image like any manual op — see `deploy/redeploy.sh`):
   ```
   export UNBND_IMAGE_TAG=$(git rev-parse HEAD)
   docker compose -f docker-compose.prod.yml up -d api
   ```

4. **Observe the divergence:**
   ```
   curl -s 'https://staging.unbnd.ink/api/books/<slug>/ratings' | jq '{raw: .average, weighted: .weighted.average, trusted: .weighted.trustedCount}'
   ```
   Raw averages all three (≈3.7); weighted (House) averages only R1/R2 (5.0). In
   the UI the House view shows the higher, trusted number; "Yours" (a sovereign
   observer with no fixture entry) falls back to raw.

5. **Revert** when done: remove `TRUST_PROVIDER`/`TRUST_FIXTURE` from `.env`
   (defaults back to `brainstorm`) and restart the api service.

`TRUST_FIXTURE` is validated at boot: it must be valid JSON with a `weights`
object, or the API refuses to start (fail fast).

---

## Mode B — real (end-to-end Brainstorm / GrapeRank)

Exercises the live provider, so it validates the whole NIP-85 path, not just the
consumers. Slower and depends on Brainstorm computing scores.

1. **Librarian follows the seed raters.** Add `R1`, `R2`, … to the librarian's
   kind-3 contact list and publish it to dcosl + the nip85 relays. (Same
   mechanism Story 18 builds; until then, publish from a nostr client.)
2. **Seed ratings** from `R1`, `R2` (and an untrusted `U`) on book `<slug>`, as in
   Mode A step 1.
3. **Trigger GrapeRank** for the librarian observer (the in-app self-serve
   trigger, or the Brainstorm flow in ADR 0014) and wait for kind-30382 scores to
   appear on the nip85 relays.
4. **Observe** the same `ratings` endpoint with `TRUST_PROVIDER=brainstorm` (the
   default). The House view now weights R1/R2 by their real GrapeRank influence,
   diverging from raw.

Mode B's divergence depends on real scores existing, so it is not instant or
exactly reproducible; use Mode A for deterministic demos and CI-equivalent checks.

---

## Notes
- The fixture provider and the Brainstorm provider implement the identical
  `TrustProvider` interface, so the consuming features (weighted ratings today;
  weighted tags, promotion signals, search re-ranking, shelves later) behave the
  same under both — only the weight source changes.
- Keep operator seed keys out of the repo. Treat them like the librarian nsec.
