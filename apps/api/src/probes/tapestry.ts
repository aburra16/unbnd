import type { Config } from "../config";
import type { ProbeResult } from "./timeout";

export async function probeTapestry(_config: Config): Promise<ProbeResult> {
  throw new Error("probeTapestry not implemented");
}
