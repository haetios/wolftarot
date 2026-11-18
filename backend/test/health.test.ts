import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";

describe("GET /health", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());

  it("répond { status: 'ok' }", async () => {
    const res = await colyseus.http.get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual({ status: "ok" });
  });
});
