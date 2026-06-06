# Book of Work: <title>

**Slug:** <book-slug>
**Status:** Open | Closed
**Opened:** <DATE>
**Closed:** <DATE or —>

## Intent anchor
How "done" is defined for this book. One of:

- **PRD-backed** — a PRD section set (e.g. `unbnd-prd.md` §11.1 MVP Scope, `engineering-team/phase2-prd.md` §<n>, or `product-team/prd/<slug>.md` §<sections>). Completion is *computed*: every story tracing to these sections is `Done`.
- **Acceptance frame (no PRD)** — the human's ask, restated and confirmed at kickoff. Completion is *judged* against the bullets below.

### Acceptance frame
*(Only when there is no PRD. A few bullets — what "done" means, in the human's own terms, confirmed at kickoff. This is the durable definition of done; it also doubles as the skeleton for the PRD seed at close.)*

- [ ] <observable outcome 1>
- [ ] <observable outcome 2>

## Stories in this book
- #<n> `<slug>` — <one line>

## Provenance
- **Mode:** PRD-backed | Acceptance-frame | Reconstructed *(no anchor captured at kickoff — intent inferred from `_intake.md` + git at close)*
- **Confidence at close:** high | medium | low

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/<book-slug>/audit.md`
- Product feedback: `engineering-team/audits/<book-slug>/prd-addendum.md` | `prd-seed.md`
