# Style Guide: Unbnd — The Reader's Guide (the tic taxonomy)

**Slug:** `reader-guide`
**Date:** 2026-06-11

> The language law for the guide, and from ratification onward for all new user-facing prose in the product. It absorbs and supersedes the ban lists in `guides/social-loop-style-guide.md` and `product-team/guardrails/language.md` for prose; the social-loop guide's UI-copy patterns (button labels, empty states, error shapes) remain in force for interface copy. Binding during engineering review: every guide entry is **drafted, then edited against this taxonomy in a separate pass with a recorded diff**, then reviewed.

## Why this exists

The guide's reader is deciding whether to trust a product whose whole pitch is human taste. Text that sounds machine-made contradicts that pitch in the medium itself. Machine-sounding text is recognizable by specific, nameable habits. This document names them, so an editor can find them mechanically instead of arguing about vibes.

## Voice

The same person as the product: a well-read friend who respects your judgment. The guide register is that friend with more time: unhurried, concrete, plain. Second person throughout ("you rate a book"). Contractions welcome. The landing page may use one short we-voice passage; reference entries never do, and no entry is signed. The read-aloud test governs everything: if you would not say the sentence to a friend across a table, rewrite it.

## The tic taxonomy

Each tic: what it looks like, why it reads as machine text, and the fix. **[M]** marks rules a plain text search can enforce; **[J]** marks judgment calls the edit pass weighs.

### A. Punctuation and typography

**A1. Em dashes. [M]** Banned outright, in every position.
*Tic:* "Your rating matters — it shapes the consensus."
*Fix:* a period, a comma, a colon, or parentheses. "Your rating matters. It shapes the consensus."

**A2. Exclamation marks. [M]** Banned. Enthusiasm is carried by specificity, never punctuation.

**A3. Emoji. [M]** Banned in guide text.

**A4. Title Case Headings. [M-ish]** Headings are sentence case, and reference-entry headings are the on-screen name verbatim.

**A5. The bolded lead-in list. [J]** "**Speed.** Pages load fast. **Trust.** Numbers you can check." A formatting crutch that fragments prose into pseudo-bullets. Entries use real sentences and real numbered steps; bold is reserved for the entry-anatomy labels the design guide defines.

### B. Sentence-shape tells

**B1. Rhetorical contrast. [J, searchable hints]** The "not x; it's y" family in all its disguises: "It isn't about the stars. It's about the people." / "more than just a rating" / "less a number than a promise."
*Why:* the machine's favorite way to fake insight is to deny a thing nobody claimed.
*Fix:* say the true thing directly. "The rating shows you whose judgment it came from."

**B2. Declarative negative lists. [J, searchable hints]** "No algorithms, no ads, no tricks."
*Fix:* state what is, once. If a contrast with another product is genuinely needed, make it one plain sentence with a named subject.

**B3. Triadic structures. [J]** "Clean, clear, and calm." Three parallel items as rhythm rather than content. Minimal means minimal: a triad survives editing only when the three items are genuinely three distinct facts, and never twice on a page. Pairs and single concrete claims are the default.

**B4. Anaphora and parallel-sentence drumming. [J]** "Every rating is yours. Every review is yours. Every shelf is yours." Banned. One sentence with a list inside it, or two differently shaped sentences.

**B5. Participial tails. [J]** "...stored under your own name, making it impossible for anyone to rewrite it, ensuring your words stay yours."
*Fix:* full sentences. "...stored under your own name. Nobody can rewrite it."

**B6. The "whether you're" construction. [M]** "Whether you're a casual reader or a devoted curator..." Audience pandering. Address the one reader.

**B7. "From x to y" ranges. [J]** "From cozy mysteries to dense literary fiction..." Decoration pretending to be information. Name the real thing once.

**B8. Rhetorical questions as transitions. [J]** "So what does this mean for you?" Banned. The next sentence should just say what it means.

### C. Word-level tells

**C1. The hype lexicon. [M]** Banned words in guide prose: seamless, effortless, powerful, robust, intuitive, delightful, supercharge, unlock, elevate, streamline, leverage, empower, game-changing, revolutionary, vibrant, dive (in any depth), journey (metaphorical), landscape (metaphorical), ecosystem, navigate (metaphorical), explore (when it means "read about"), discover (when it means "see"), curated (as a vague adjective; fine as the literal verb curators perform).

**C2. Throat-clearing. [M]** Banned openers: Essentially, Basically, Fundamentally, At its core, In essence, Simply put, It's worth noting, Keep in mind, Note that, Importantly, Interestingly.

**C3. Summary closers. [M]** Banned: In short, In summary, Ultimately, At the end of the day. Entries end when the information ends; no recap paragraphs.

**C4. "Simply" and "just" in instructions. [M]** Banned. They shame the reader who finds the step hard. "Click the toggle," never "simply click the toggle."

**C5. Unevidenced superlatives. [J]** "The best way to find your next book." State what the feature does; the reader ranks it.

**C6. Hedging where behavior is known. [J]** "This may update your rating" when it always does. Say what happens. Reserve may/might for genuine contingency, and then say what the contingency is.

**C7. False warmth. [M]** Banned: We're excited, We're thrilled, Welcome aboard, Happy reading. Warmth is earned by usefulness and respect, not announced.

### D. Discourse-level tells

**D1. Purple prose. [J]** Overwrought metaphor, scene-setting, atmosphere. One concrete comparison is allowed per entry when it genuinely teaches ("the house view is the staff picks shelf, assembled by people whose taste you can check"). Two is decoration.

**D2. The encyclopedia opener. [J]** "Taste match is a feature that allows users to..." Banned shape: "[Feature] is a [category] that [verbs]." Open with the reader or the thing itself: "The percentage on a profile tells you how often you and that person score the same books the same way."

**D3. Third-person product-speak in how-tos. [J]** "Users can remove a rating." Steps are second-person imperative: "Open the book page. Choose Remove rating."

**D4. Length padding. [J]** Saying it twice in different words. Every entry should survive the cut test: remove any sentence and check whether information was lost. If not, it stays removed.

### E. The protocol-vocabulary wall [M]

Outside the one clearly marked entry in "Your account is yours" (the for-nostr-readers note), these words never appear in the guide: nostr, relay, event, protocol, decentralized, key signing, kind, npub, nsec, NIP, client (in the protocol sense), web of trust (as a term; the idea is described in plain words).
Words the interface itself shows get plain-word treatment where they appear: "key" is allowed in the sovereignty entry because the product says it, and it is introduced as "the key to your account" with what it does before any property of it is discussed.

## Positive guidance (what good looks like)

1. Short declarative sentences, varied naturally. If three sentences in a row share a shape, reshape one.
2. Concrete subjects doing concrete things. The reader acts: "Open a book page." The product responds: "The numbers change."
3. One idea per paragraph; one to four sentences per paragraph.
4. Define by what it does for the reader first, mechanism second, and the mechanism in plain words: "The match is based on books you have both rated."
5. Numbers and named things over adjectives: "books at least three of your trusted people rated four stars or higher," never "highly rated by trusted curators."
6. On-screen words are quoted exactly and capitalized as the screen shows them.
7. Steps are numbered, each step one action, each starting with the verb.

## The editing process (binding)

1. **Draft.** The story author writes the entry for content correctness against the shipped feature.
2. **Taxonomy edit.** A separate pass, against this document section by section, producing a **recorded diff** (its own commit, labeled as the edit pass). The mechanical rules **[M]** are checked by text search; the judgment rules **[J]** are applied by reading. An entry with zero edits in this pass is a flag, not a compliment: the reviewer reads it with extra suspicion.
3. **Review.** The story reviewer verifies the edit-pass diff exists, runs the [M] searches independently, spot-reads against the [J] rules, and applies the read-aloud test to at least the entry's opening and its steps.

The mechanical list, for searches and (engineering's call) a CI text check over guide content: `—`, `!`, the C1 lexicon, the C2 openers, the C3 closers, "simply", "just" (in step lines), "whether you're", the E-wall words.

## What this supersedes

For prose (the guide, and all new user-facing passages of more than a sentence): this document. For interface microcopy (buttons, labels, empty states, errors, confirmations): the social-loop style guide's "UI copy patterns" section stays in force, and its forbidden-phrases list is absorbed into C1/C7/E above. Where the two disagree about prose, this document wins.
