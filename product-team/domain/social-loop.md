# Domain Model: Unbnd — Close the Social Loop

**Slug:** `social-loop`
**Date:** 2026-06-06
**Modeler phase:** Domain Modeling (Phase 4)

> Conceptual model only, what the product knows about and not how it stores it. Phase 3 is built on the Phase 2 DList event model: kind 39998 concept headers under the librarian, kind 39999 items z-tagged to them, kind-0 profiles, kind-3 follows, and GrapeRank trust weights. Only in-scope (Phase 3) entities are modeled. The defining finding: Phase 3 invents almost no new persistent shapes. Its substance is new derived computations (taste match, hype gap) and lifecycle transitions over the existing model, plus one new pubkey-targeted concept that clones a pattern already in the codebase.

## Entities

### Curator Role Assertion
- **Description:** A trusted user's vouch that a given person is a curator.
- **Concept mapping:** New concept header `curator-roles` (kind 39998), but the item shape clones the existing `author-verified` pattern (kind 39999, `#p`-targets a pubkey, apply/dispute polarity, per-(asserter, subject) replaceable identity, count-gated read). Prior art: `AuthorVerifiedAssertion`, and the Tapestry `feat/pubkey-tagging-target` branch.
- **Attributes:**
  | Attribute | Type | Required | Notes |
  |---|---|---|---|
  | subjectPubkey | ref:Account | yes | the candidate curator (the `#p` target, not the signer) |
  | asserterPubkey | ref:Account | yes | the trusted user vouching (the signer) |
  | role | text | yes | "curator"; the scheme generalizes to other roles later |
  | polarity | number | yes | apply (+1) or dispute (−1); dispute gives revocation |

### Taste Match
- **Description:** A measure of how often two people agree on the books they have both rated.
- **Concept mapping:** New, but derived, not stored. Computed over existing `BookRating` items the same way trust-weighted consensus is computed at read time. May be cached like the Phase 2 homepage shelves; it is not a new persistent assertion.
- **Attributes:**
  | Attribute | Type | Required | Notes |
  |---|---|---|---|
  | observer | ref:Account | yes | whose viewpoint the match is shown from |
  | other | ref:Account | yes | the curator or reader being compared |
  | matchScore | number | no | a percentage; absent until the overlap threshold is met |
  | coRatedCount | number | yes | how many books both have rated; gates honest display |
  | trustWeighted | boolean | yes | whether the score factors trust-graph structure or is raw rating correlation |

### Hype-Gap Signal
- **Description:** For one book seen from one viewpoint, the gap between the raw community rating and the trust-weighted rating.
- **Concept mapping:** New, but derived, not stored. Computed over existing `BookRating` items plus the observer's trust weights. The hidden-gems homepage shelf may cache it per viewpoint, as Phase 2 cached homepage shelves.
- **Attributes:**
  | Attribute | Type | Required | Notes |
  |---|---|---|---|
  | book | ref:Book | yes | |
  | observer | ref:Account | yes | the viewpoint; the signal differs House vs Yours |
  | rawAverage | number | yes | community average |
  | trustedAverage | number | no | observer-weighted average; absent until a handful of trusted raters exist |
  | state | text | yes | hidden-gem / overhyped / consensus (consensus shows nothing) |

## Extended existing entities (no new shape; new lifecycle or read state)

### Account
- **Existing.** kind-0 profile plus the Phase 1 custodial key vault. Phase 3 adds the sovereignty transition: a custodial account can export and take ownership of its key, becoming sovereign-capable. No new entity, a new lifecycle (below). Curator status is a derived role state on an Account, not a separate entity.

### Genre
- **Existing** (`genres` concept + `book-genre-tags` assertions). Phase 3 expands the taxonomy from 8 to 14+ and recasts existing books. Genre is a revisable assertion derived from each Book's preserved Open Library subjects, so the recast re-derives genres with no re-fetch and no change to book records.

### Rating, Promoted Book, Accusatory Reveal, Tag Assertion
- **All existing.** Phase 3 adds: rating removal (#28b), promotion demotion (#30b), automatic threshold promotion and an in-product trust-gated reveal affordance (Block 3), and a contested read-state on a tag the trusted graph net-disputes (reuses the existing `trustedApplies` / `trustedDisputes` counts). No new persistent shapes.

### Follow relationship
- **Existing** (kind-3). Phase 3 derives a followers count from inbound follows, sourced via NIP-85 `kind:30382` rather than an unbounded kind-3 scan.

## Relationships

- Trusted Account **vouches-for** Account as a curator (Curator Role Assertion).
- Account **matches** Account by rating agreement (Taste Match), shown from the observer's viewpoint.
- Review **sorted-by** Taste Match on a book detail page, alongside trust score.
- Book **carries** a Hype-Gap Signal relative to an Observer.
- Account **follows** Account; followers count derived from inbound follows.
- Book **derives** Genre from its preserved Open Library subjects.

## States and lifecycle

- **Account (curator status):** not-curator → curator → not-curator. A person becomes a curator when either they are on the operator seed-curator allowlist, or enough trusted users have vouched (the count-gate). Net-dispute below the gate revokes it. The Phase 2 emergent house-weight gate (`canPromote`) persists as a cold-start fallback; whether it stays alongside vouching, and the exact knobs, are open below.
- **Account (sovereignty):** anonymous → custodial → sovereign. The custodial→sovereign step is the nsec-export flow, irreversible once the key is in the user's hands, always optional.
- **Rating:** present → removed (#28b).
- **Promoted Book:** submitted → promoted → demoted (#30b); promotion may fire automatically on a trust threshold (Block 3).
- **Accusatory tag:** hidden → revealed, where reveal becomes an in-product trust-gated action (Block 3), not only an operator subcommand.

## New vs. existing

- **Maps to existing DList concepts:** Account, Genre, Rating, Promoted Book, Accusatory Reveal, Tag Assertion, Follows. All extended by lifecycle or read-state only.
- **Genuinely new concept:** `curator-roles` (one new kind 39998 header), with curator-role assertions cloning the existing `author-verified` pubkey-targeted, count-gated pattern.
- **New but derived (not stored):** Taste Match, Hype-Gap Signal. Both are observer-relative computations over existing ratings and trust weights, optionally cached.

## Open questions pinned for the PRD / engineering

1. **Taste-match honesty threshold:** the minimum `coRatedCount` before a percentage shows rather than "not enough overlap yet."
2. **Observer relativity (confirmed in the model):** taste match is always pairwise from the viewer's side; the trust-weighted variant and which curators populate shift with House↔Yours. Hype gap differs House vs Yours, and the hidden-gems shelf exists on both views, surfacing different gems.
3. **Curator-role knobs:** how many trusted asserters (N), at what trust weight (W), confer the role (seed placeholder N=10, W=0.2 on the 0–1 weight scale), self-assertion excluded; and whether the Phase 2 emergent house-weight gate coexists with vouching or is retired in favor of it.
