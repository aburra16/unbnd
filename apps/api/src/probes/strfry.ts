import type { Config } from "../config";
import type { ProbeResult } from "./timeout";

export async function probeStrfry(_config: Config): Promise<ProbeResult> {
  throw new Error("probeStrfry not implemented");
}
