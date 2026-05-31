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
import { buildBooksRouter } from "./routes/books";
import { buildProfileRouter } from "./routes/profile";
import { buildProfileStatsRouter } from "./routes/profile-stats";
import { buildProfileSubstackRouter } from "./routes/profile-substack";
import { buildProfileFollowRouter } from "./routes/profile-follow";
import { buildSearchRouter } from "./routes/search";
import { buildTrustRouter } from "./routes/trust";
import { buildHealthRouter } from "./routes/health";
import { buildRatingsRouter } from "./routes/ratings";
import { buildTagsRouter } from "./routes/tags";
import { buildShelvesRouter } from "./routes/shelves";
import { buildSubmissionsRouter } from "./routes/submissions";
import { publishEvent, publishToMany } from "./nostr/publish";
import { publishPublicRelayKind } from "./nostr/publish-public-relay-kind";
import { fetchRawKind0, fetchRawKind3 } from "./nostr/profile";
import { withUpSync } from "./nostr/propagate";
import { resolveTrustProvider } from "./trust";
import { queryEvents, queryEventsPaged } from "./nostr/query";
import { resolveProvider } from "@unbnd/search";
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
  const searchProvider = resolveProvider({
    provider: config.searchProvider,
    url: config.searchUrl,
    apiKey: config.searchApiKey,
  });

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
        // A signup session is logged in — establish the ephemeral signing
        // wrap now (mirror login) so a new custodial user can rate without
        // having to sign in again. Decrypt the just-stored nsec with the
        // signup password, wrap, wipe.
        if (user.row.encryptedNsecPassword) {
          const secret = decryptWithPassword(
            user.row.encryptedNsecPassword,
            input.password,
          );
          try {
            rememberSessionKey(
              tokenToId(user.session.token).toString("hex"),
              secret,
            );
          } finally {
            secret.fill(0);
          }
        }
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
          // Drop the rotated-out session's wrapped key so it doesn't orphan.
          if (existingCookie) {
            forgetSessionKey(tokenToId(existingCookie).toString("hex"));
          }
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

  // Write path (ADR 0011): local relay is the source of truth + read path.
  // When dcosl propagation is configured, accepted writes are also dual-
  // published to dcosl best-effort (off the critical path); the up-sync cron
  // is the durability backstop.
  const localPublish = (event: SignedNostrEvent) =>
    publishEvent(config.strfryUrl, event);
  const publish =
    config.propagateWrites && config.dcoslRelayUrl
      ? withUpSync(
          localPublish,
          (event: SignedNostrEvent) =>
            publishEvent(config.dcoslRelayUrl as string, event),
          (reason, id) =>
            console.warn(`[upsync] dcosl publish failed id=${id}: ${reason}`),
        )
      : localPublish;

  // kind-0 profile publisher (ADR 0022, F2-A). Distinct from the shared
  // `publish` (local + dcosl): kind-0 lives on the public profile relays, so we
  // publish to the LOCAL relay first (gates the response + read-back), then fan
  // out best-effort to `config.profileRelays` (which already includes the four
  // public relays + dcosl). The fan-out is fire-and-forget — a public-relay
  // failure never fails the user's save.
  const publishKind0 = async (event: SignedNostrEvent) => {
    const local = await publishEvent(config.strfryUrl, event);
    if (local.ok && config.profileRelays && config.profileRelays.length > 0) {
      void publishToMany(config.profileRelays, event).then((rs) =>
        rs.forEach(
          (r) =>
            !r.ok &&
            // eslint-disable-next-line no-console
            console.warn(`[profile-publish] ${r.reason}`),
        ),
      );
    }
    return local;
  };

  // kind-3 contact-list publisher (ADR 0023, F2-A): the same public-relay
  // propagation model as kind-0, built from the injected primitive — local
  // awaited (gates the response + read-back), profile-relay fan-out
  // fire-and-forget, dcosl excluded.
  const publishKind3 = publishPublicRelayKind("profile-publish", {
    localRelay: config.strfryUrl,
    profileRelays: config.profileRelays ?? [],
    publishLocal: publishEvent,
    publishMany: publishToMany,
  });

  // Trust-weighting source (ADR 0014/0017). Enabled when a house observer is set
  // and the chosen provider is configured. `fixture` = deterministic, network-
  // free (CI + the staging seed harness); `brainstorm` = live NIP-85/GrapeRank.
  const trust = !config.houseObserverPubkey
    ? undefined
    : config.trustProvider === "fixture"
      ? config.trustFixture
        ? resolveTrustProvider({ provider: "fixture", fixture: config.trustFixture })
        : undefined
      : config.brainstormApiUrl && config.trustRelays
        ? resolveTrustProvider({
            provider: "brainstorm",
            apiUrl: config.brainstormApiUrl,
            relays: config.trustRelays,
          })
        : undefined;

  const resolveSessionUser = async (cookie: string | undefined) => {
    const resolved = await resolveSession(cookie);
    if (!resolved) return null;
    return {
      id: resolved.user.id,
      pubkeyHex: resolved.user.pubkeyHex,
      tier: resolved.user.tier,
    };
  };

  // Shared user-event write/read deps for ratings + tag assertions (ADR 0009).
  const userEventDeps = {
    config,
    sessionUser: resolveSessionUser,
    publish,
    query: (filter: Parameters<typeof queryEvents>[1]) => queryEvents(config, filter),
    // Paginating sibling read (ADR 0021): pages past the relay's 500 cap for the
    // author-scoped stats + shelf-membership reads. The one-shot `query` above
    // still backs per-book reads, aggregateBookTags, and the #d enrichment chunks.
    queryPaged: (filter: Parameters<typeof queryEventsPaged>[1]) =>
      queryEventsPaged(config, filter),
    trust,
    custodialSign: async (
      sessionIdHex: string,
      template: Parameters<typeof finalizeEvent>[0],
    ) => {
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
  };

  app.use("/", buildBooksRouter({ config, query: userEventDeps.query }));
  app.use("/", buildProfileRouter({ config }));
  app.use(
    "/",
    buildProfileStatsRouter({
      config,
      sessionUser: resolveSessionUser,
      query: userEventDeps.query,
      queryPaged: userEventDeps.queryPaged,
    }),
  );
  app.use(
    "/",
    buildProfileSubstackRouter({
      config,
      sessionUser: resolveSessionUser,
      publish: publishKind0,
      fetchRaw: (hex) => fetchRawKind0(config.profileRelays ?? [], hex),
      custodialSign: userEventDeps.custodialSign,
    }),
  );
  app.use(
    "/",
    buildProfileFollowRouter({
      config,
      sessionUser: resolveSessionUser,
      publish: publishKind3,
      fetchRaw: (hex) => fetchRawKind3(config.profileRelays ?? [], hex),
      custodialSign: userEventDeps.custodialSign,
    }),
  );
  app.use("/", buildSearchRouter({ searchProvider }));
  app.use("/", buildTrustRouter({ sessionUser: resolveSessionUser, trust }));
  app.use("/", buildRatingsRouter(userEventDeps));
  app.use("/", buildTagsRouter(userEventDeps));
  app.use("/", buildShelvesRouter(userEventDeps));
  app.use("/", buildSubmissionsRouter(userEventDeps));

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
