import type { EventId, HexPubkey } from "../src/envelope";

/**
 * Direct cast helper for building test data. Bypasses the runtime
 * validation in `asHexPubkey` so test files can construct sample data at
 * module load without depending on the implementation of `asHexPubkey`.
 *
 * Validation behavior is tested explicitly in `envelope.test.ts`.
 */
export const hex64 = (s: string): HexPubkey => s as HexPubkey;
export const eventId64 = (s: string): EventId => s as EventId;
