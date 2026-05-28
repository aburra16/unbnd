// Production error sanitizer per ADR 0003.
import { randomBytes } from "node:crypto";
import type { ErrorRequestHandler } from "express";

/**
 * Terminal Express error middleware. Logs the full error server-side with a
 * generated request id; returns a generic { error: { code: "internal",
 * message, requestId } } with HTTP 500. Includes the stack only when
 * NODE_ENV !== "production". Keeps all four args so Express treats it as an
 * error handler.
 */
export const errorSanitizer: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = randomBytes(8).toString("hex");
  // eslint-disable-next-line no-console
  console.error(`[${requestId}]`, err);

  const isProduction = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: {
      code: "internal",
      message: "An unexpected error occurred.",
      requestId,
      ...(isProduction
        ? {}
        : { stack: err instanceof Error ? err.stack : String(err) }),
    },
  });
};
