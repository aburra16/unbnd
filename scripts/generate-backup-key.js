#!/usr/bin/env node
// Generates a 32-byte server-managed backup key, hex-encoded, for
// BACKUP_ENCRYPTION_KEY (PRD §8.4 custodial nsec recovery). Prints to
// stdout — the developer pastes it into .env. Production stores it in a
// secret manager, never in committed source.
//
// Usage:
//   node scripts/generate-backup-key.js
//
// Uses node:crypto.randomBytes per the CLAUDE.md Cryptographic library
// policy — never a non-cryptographic PRNG.

import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("hex");

process.stdout.write(`BACKUP_ENCRYPTION_KEY=${key}\n`);
process.stdout.write(
  `\nPaste this into your .env. Store it safely — losing it makes password\n`,
);
process.stdout.write(`recovery impossible for every custodial account.\n`);
