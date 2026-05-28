import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorSanitizer } from "../../src/middleware/errors";

function appThatThrows() {
  const app = express();
  app.get("/boom", () => {
    throw new Error("internal detail that must not leak: pg 16.2 at /srv/db");
  });
  app.use(errorSanitizer);
  return app;
}

describe("errorSanitizer", () => {
  const original = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = original;
  });
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("returns a generic 500 with a request id and no leaked detail in production", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(appThatThrows()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal");
    expect(res.body.error.message).toBe("An unexpected error occurred.");
    expect(typeof res.body.error.requestId).toBe("string");
    expect(res.body.error.requestId.length).toBeGreaterThan(0);
    expect(res.body.error.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/pg 16\.2|\/srv\/db/);
  });

  it("includes the stack outside production for dev iteration", async () => {
    process.env.NODE_ENV = "test";
    const res = await request(appThatThrows()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal");
    expect(typeof res.body.error.stack).toBe("string");
  });
});
