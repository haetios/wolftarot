import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";

describe("testing your Colyseus app", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("only lets the current player act", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const client1 = await colyseus.connectTo(room);
    const client2 = await colyseus.connectTo(room);

    expect(room.state.currentTurn, "first joiner starts").toBe(client1.sessionId);

    // out of turn: ignored
    client2.send("play", {});
    await room.waitForMessage("play");
    expect(room.state.players.get(client2.sessionId)?.score).toBe(0);
    expect(room.state.currentTurn).toBe(client1.sessionId);

    // in turn: counted, and the turn passes on
    client1.send("play", {});
    await room.waitForMessage("play");
    expect(room.state.players.get(client1.sessionId)?.score).toBe(1);
    expect(room.state.currentTurn).toBe(client2.sessionId);
  });
});
