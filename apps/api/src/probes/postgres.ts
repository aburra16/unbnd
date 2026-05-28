import type { Config } from "../config";
import type { ProbeResult } from "./timeout";

export function probePostgres(_config: Config): Promise<ProbeResult> {
  throw new Error("probePostgres not implemented");
}
