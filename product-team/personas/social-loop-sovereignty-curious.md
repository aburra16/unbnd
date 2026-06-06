# Persona: The Sovereignty-Curious User

**Slug:** social-loop-sovereignty-curious
**Priority:** Secondary
**Date:** 2026-06-06

## Who they are

Usually a curator, sometimes a reader, who cares that their identity and data are portable, or who is already poking around the broader nostr ecosystem. They signed up custodially with email because it was the easy path, and the lock-in nags at them. They span a range: from "I just want the insurance that I could leave" to "I already use other nostr apps and want one identity across all of them."

This is a behavioral type, not a separate audience. A Founding Curator or a Trusting Reader becomes this persona the moment ownership starts to matter to them.

## What they want

The genuine option to hold their own keys and carry their identity across nostr, on their own timeline.

## Their core loop

Not a daily loop. A one-time-ish upgrade decision, triggered by a moment of investment ("I've put real curation in here, can I take it with me?"), followed by ongoing peace of mind or active cross-app use.

## What they won't tolerate

- A key-handling flow so scary they bail, or so casual it feels unsafe.
- Learning, after investing, that the sovereignty promise was never real.
- Being pushed to manage keys they never asked for.

## Notes

This persona exists to protect one specific design decision that the other two do not touch: how prominent and how heavy the sovereignty-upgrade path should be. Sovereignty is offered as a choice, never forced. Most users will never exercise it. Its existence is the product's integrity, and the founder's framing is explicit: whether someone wants to control their own keys on this app or use those keys to explore the wider nostr ecosystem is up to them.

The upgrade flow has real gravity. Handing someone their own key is irreversible if mishandled. The flow must respect that weight while staying approachable enough that a non-technical custodial user is not frightened away (discovery open question 4). This is the keystone reason the nsec-export work earns its own design pass rather than riding along with another feature.
