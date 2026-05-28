import express from "express";
import { loadConfig } from "./config";
import { createDb, db, runMigrations } from "./db";
import { errorSanitizer } from "./middleware/errors";
import { probeNeo4j } from "./probes/neo4j";
import { probePostgres } from "./probes/postgres";
import { probeStrfry } from "./probes/strfry";
import { probeTapestry } from "./probes/tapestry";
import { buildAuthRouter } from "./routes/auth";
import { buildHealthRouter } from "./routes/health";
import { resolveProvider } from "./search";
import {
  createCustodialUser,
  findUserByEmail,
  toPublicUser,
} from "./auth/users";
import { decryptWithPassword } from "./auth/crypto";
import { issueSession, resolveSession, revokeSession } from "./auth/sessions";

async function main() {
  const config = loadConfig();
  const searchProvider = resolveProvider(config);

  await runMigrations(config.databaseUrl);
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
        try {
          decryptWithPassword(row.encryptedNsecPassword, input.password);
        } catch {
          return null; // wrong password — NIP-49 AEAD tag check failed
        }
        const session = await db.transaction(async (tx) => {
          await revokeSession(tx, existingCookie); // rotation
          return issueSession(tx, row.id);
        });
        return {
          user: toPublicUser(row),
          token: session.token,
          expiresAt: session.expiresAt,
        };
      },
      logout: async (cookie) => {
        await db.transaction((tx) => revokeSession(tx, cookie));
      },
      me: async (cookie) => {
        const resolved = await resolveSession(cookie);
        return resolved ? toPublicUser(resolved.user) : null;
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
