#!/usr/bin/env node
// Generates a fresh nostr keypair and prints the hex pubkey, npub, and
// nsec to stdout. Used once per environment to populate OWNER_PUBKEY in
// `.env`. Does not write to any file — the developer is responsible for
// storing the nsec safely.
//
// Usage:
//   node scripts/generate-keypair.js
//
// Cryptography goes through the audited Applesauce stack:
//   - generateSecretKey / getPublicKey re-exported from nostr-tools/pure
//   - nsec / npub encoding via nostr-tools/nip19
//   - The underlying curve math is @noble/secp256k1 (Trail of Bits and
//     Cure53 audited; constant-time; side-channel hardened).
//
// See CLAUDE.md "Cryptographic library policy" for the project-wide rule.

import { generateSecretKey, getPublicKey } from "applesauce-core/helpers/keys";
import { nsecEncode, npubEncode } from "nostr-tools/nip19";

const privateKey = generateSecretKey();
const pubkeyHex = getPublicKey(privateKey);
const nsec = nsecEncode(privateKey);
const npub = npubEncode(pubkeyHex);

process.stdout.write(`pubkey (hex):  ${pubkeyHex}\n`);
process.stdout.write(`npub:          ${npub}\n`);
process.stdout.write(`nsec:          ${nsec}\n`);
process.stdout.write(`\n`);
process.stdout.write(
  `Paste the hex pubkey into OWNER_PUBKEY in your .env file.\n`,
);
process.stdout.write(
  `Store the nsec somewhere safe. Anyone with it can sign as this identity.\n`,
);
