import express from "express";
import { loadConfig } from "./config";
import { probeNeo4j } from "./probes/neo4j";
import { probeStrfry } from "./probes/strfry";
import { probeTapestry } from "./probes/tapestry";
import { buildHealthRouter } from "./routes/health";
import { resolveProvider } from "./search";

const config = loadConfig();
const searchProvider = resolveProvider(config);

const app = express();
app.use(express.json());

app.use(
  "/",
  buildHealthRouter({
    config,
    probeStrfry: () => probeStrfry(config),
    probeNeo4j: () => probeNeo4j(config),
    probeTapestry: () => probeTapestry(config),
    searchProvider,
  }),
);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`unbnd-api listening on :${config.port}`);
});
