import type { Config } from "../config";
import type { ProbeResult } from "./timeout";

export async function probeNeo4j(_config: Config): Promise<ProbeResult> {
  throw new Error("probeNeo4j not implemented");
}
