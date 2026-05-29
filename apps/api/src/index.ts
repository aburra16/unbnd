import express from "express";
import { loadConfig } from "./config";
import { createDb, db, runMigrations } from "./db";
import { retryWithBackoff, isRetryableConnError } from "./util/retry";
import { errorSanitizer } from "./middleware/errors";
import { probeNeo4j } from "./probes/neo4j";
import { probePostgres } from "./probes/postgres";
import { probeStrfry } from "./probes/strfry";
import { probeTapestry } from "./probes/tapestry";
import { buildAuthRouter } from "./routes/auth";
import { buildHealthRouter } from "./routes/health";
import { buildRatingsRouter } from "./routes/ratings";
import { publishEvent } from "./nostr/publish";
import { queryEvents } from "./nostr/query";
import { resolveProvider } from "./search";
import {
  createCustodialUser,
  createOrLoadSovereignUser,
  findUserByEmail,
  toPublicUser,
} from "./auth/users";
import { decryptWithPassword } from "./auth/crypto";
import {
  issueSession,
  resolveSession,
  revokeSession,
  tokenToId,
} from "./auth/sessions";
import {
  rememberSessionKey,
  forgetSessionKey,
  useSessionKey,
  NoSessionKeyError,
} from "./auth/ephemeral";
import { finalizeEvent } from "nostr-tools/pure";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { consumeChallenge, issueChallenge } from "./auth/challenges";
import { verifySignedChallenge } from "./auth/nostr";

async function main() {
  const config = loadConfig();
  const searchProvider = resolveProvider(config);

  // Postgres may not accept connections the instant the API container starts
  // (compose `depends_on: service_healthy` covers the normal case; this is
  // defense in depth and helps local/dev too).
  await retryWithBackoff(() => runMigrations(config.databaseUrl), {
    attempts: 15,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    shouldRetry: isRetryableConnError,
    onRetry: (_err, attempt, delayMs) => {
      // eslint-disable-next-line no-console
      console.warn(
        `db not ready (attempt ${attempt}); retrying in ${delayMs}ms`,
      );
    },
  });
  createDb(config.databaseUrl);

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.use(
    "/",
    buildHealthRouter({
      config,
      probeStrfry: () => probeStrfry(config),
      probeNeo4j: () => probeNeo4j(config),
      probeTapestry: () => probeTapestry(config),
      probePostgres: () => probePostgres(config),
      searchProvider,
    }),
  );

  app.use(
    "/",
    buildAuthRouter({
      config,
      signup: async (input) => {
        const user = await db.transaction(async (tx) => {
          const row = await createCustodialUser(
            tx,
            input,
            config.backupEncryptionKey,
          );
          const session = await issueSession(tx, row.id);
          return { row, session };
        }).catch((err: unknown) => {
          // Map the Postgres unique-violation on email to the typed error.
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code?: string }).code === "23505"
          ) {
            throw Object.assign(new Error("email in use"), {
              code: "email_in_use",
            });
          }
          throw err;
        });
        return {
          user: toPublicUser(user.row),
          token: user.session.token,
          expiresAt: user.session.expiresAt,
        };
      },
      login: async (input, existingCookie) => {
        const row = await findUserByEmail(input.email);
        if (!row) return null;
        // A null password column means this is not a custodial account
        // (sovereign users have no email/password). Treat as invalid.
        if (!row.encryptedNsecPassword) return null;
        let secret: Uint8Array;
        try {
          secret = decryptWithPassword(row.encryptedNsecPassword, input.password);
        } catch {
          return null; // wrong password — NIP-49 AEAD tag check failed
        }
        try {
          const session = await db.transaction(async (tx) => {
            await revokeSession(tx, existingCookie); // rotation
            return issueSession(tx, row.id);
          });
          // §8.2: wrap the just-decrypted nsec under the process-local
          // ephemeral key, bound to this session, for server-side signing.
          rememberSessionKey(tokenToId(session.token).toString("hex"), secret);
          return {
            user: toPublicUser(row),
            token: session.token,
            expiresAt: session.expiresAt,
          };
        } finally {
          secret.fill(0); // never retain the plaintext beyond the wrap
        }
      },
      logout: async (cookie) => {
        if (cookie) forgetSessionKey(tokenToId(cookie).toString("hex"));
        await db.transaction((tx) => revokeSession(tx, cookie));
      },
      me: async (cookie) => {
        const resolved = await resolveSession(cookie);
        return resolved ? toPublicUser(resolved.user) : null;
      },
      nostrChallenge: async (pubkey) => {
        const challenge = await db.transaction((tx) =>
          issueChallenge(tx, pubkey),
        );
        return { challenge };
      },
      nostrVerify: async (event) => {
        const verified = verifySignedChallenge(event);
        if (!verified.ok) return null;
        const { pubkey, challenge } = verified;
        return db.transaction(async (tx) => {
          // Single-use: a replayed or expired challenge fails here.
          const consumed = await consumeChallenge(tx, pubkey, challenge);
          if (!consumed) return null;
          const row = await createOrLoadSovereignUser(tx, pubkey);
          const session = await issueSession(tx, row.id);
          return {
            user: toPublicUser(row),
            token: session.token,
            expiresAt: session.expiresAt,
          };
        });
      },
    }),
  );

  app.use(
    "/",
    buildRatingsRouter({
      config,
      sessionUser: async (cookie) => {
        const resolved = await resolveSession(cookie);
        if (!resolved) return null;
        return {
          id: resolved.user.id,
          pubkeyHex: resolved.user.pubkeyHex,
          tier: resolved.user.tier,
        };
      },
      publish: (event) => publishEvent(config, event),
      query: (filter) => queryEvents(config, filter),
      custodialSign: async (sessionIdHex, template) => {
        try {
          return await useSessionKey(
            sessionIdHex,
            (secret) => finalizeEvent(template, secret) as SignedNostrEvent,
          );
        } catch (err) {
          if (err instanceof NoSessionKeyError) return null; // restart/evicted
          throw err;
        }
      },
    }),
  );

  app.use(errorSanitizer);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`unbnd-api listening on :${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal: failed to start unbnd-api", err);
  process.exit(1);
});
