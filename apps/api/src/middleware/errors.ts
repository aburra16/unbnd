// Production error sanitizer per ADR 0003. Stub throws until implemented.
import type { ErrorRequestHandler } from "express";

/**
 * Terminal Express error middleware. Logs the full error server-side with a
 * generated request id; returns a generic { error: { code: "internal",
 * message, requestId } } with HTTP 500. Includes the stack only when
 * NODE_ENV !== "production".
 */
export const errorSanitizer: ErrorRequestHandler = (_err, _req, _res, _next) => {
  throw new Error("errorSanitizer not implemented");
};
