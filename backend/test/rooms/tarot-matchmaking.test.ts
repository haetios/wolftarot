import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { matchMaker } from "colyseus";

import appConfig from "../../src/app.config.js";
import { ALREADY_SEATED, type TarotRoom } from "../../src/rooms/TarotRoom.js";
import { signTestToken } from "../helpers/auth.js";

describe("TarotRoom : parties libres (matchmaking)", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  /** Rejoint une partie libre comme le fera le frontend : `joinOrCreate("tarot", options)`. */
  async function joinFree(options: Record<string, unknown> = {}, sub: string = randomUUID()) {
    colyseus.sdk.auth.token = await signTestToken({ sub });
    return colyseus.sdk.joinOrCreate("tarot", options);
  }

  const serverRoom = (roomId: string) => colyseus.getRoomById<TarotRoom>(roomId);

  it("les joueurs qui demandent la même taille se retrouvent à la même table", async () => {
    const a = await joinFree({ playerCount: 3 });
    const b = await joinFree({ playerCount: 3 });
    expect(b.roomId).toBe(a.roomId);

    const room = serverRoom(a.roomId);
    expect(room.state.playerCount).toBe(3);
    expect(room.state.players.size).toBe(2);
    expect(room.state.phase).toBe("waiting");
  });

  it("des tailles différentes ne sont jamais mélangées", async () => {
    const three = await joinFree({ playerCount: 3 });
    const four = await joinFree({ playerCount: 4 });
    const five = await joinFree({ playerCount: 5 });

    expect(new Set([three.roomId, four.roomId, five.roomId]).size).toBe(3);
    expect(serverRoom(three.roomId).state.playerCount).toBe(3);
    expect(serverRoom(four.roomId).state.playerCount).toBe(4);
    expect(serverRoom(five.roomId).state.playerCount).toBe(5);
  });

  it("sans taille précisée : une table à 4, jamais une table d'une autre taille", async () => {
    const waitingAtThree = await joinFree({ playerCount: 3 });
    const noOption = await joinFree();

    expect(noOption.roomId).not.toBe(waitingAtThree.roomId);
    expect(serverRoom(noOption.roomId).state.playerCount).toBe(4);
    expect((await joinFree({ playerCount: 4 })).roomId).toBe(noOption.roomId);
  });

  it("la table démarre quand elle est complète, la suivante se crée ensuite", async () => {
    const first = [];
    for (let i = 0; i < 3; i++) first.push(await joinFree({ playerCount: 3 }));
    const roomId = first[0]!.roomId;
    expect(first.every((c) => c.roomId === roomId)).toBe(true);

    const room = serverRoom(roomId);
    expect(room.locked).toBe(true);
    expect(room.state.phase).toBe("bidding");
    for (const player of room.state.players.values()) expect(player.handSize).toBe(24);

    const next = await joinFree({ playerCount: 3 });
    expect(next.roomId).not.toBe(roomId);
    expect(serverRoom(next.roomId).state.phase).toBe("waiting");
  });

  it("le client suit le remplissage de sa table (joueurs présents / attendus)", async () => {
    const a = await joinFree({ playerCount: 4 });
    await joinFree({ playerCount: 4 });
    await a.waitForNextPatch();
    expect(a.state.playerCount).toBe(4);
    expect(a.state.players.size).toBe(2);
    expect(a.state.phase).toBe("waiting");
  });

  it("un siège libéré avant le début est repris par le matchmaking", async () => {
    const a = await joinFree({ playerCount: 4 });
    await joinFree({ playerCount: 4 });
    const leaving = await joinFree({ playerCount: 4 });
    const room = serverRoom(a.roomId);
    expect(room.state.players.size).toBe(3);

    await leaving.leave();
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    expect(room.locked).toBe(false);

    const back = await joinFree({ playerCount: 4 });
    expect(back.roomId).toBe(a.roomId);
    expect(room.state.players.size).toBe(3);
  });

  it.each([6, 2, 0, "4", 3.5, null, true])(
    "refuse une taille de table invalide (%o)",
    async (playerCount) => {
      await expect(joinFree({ playerCount })).rejects.toThrow(/Nombre de joueurs invalide/);
    },
  );

  it.each([JSON.stringify("abc"), "42", "true", "null", "[3]", "[]"])(
    "refuse un corps de requête qui n'est pas un objet (%s), sans rejoindre ni créer de table",
    async (body) => {
      const waiting = await joinFree({ playerCount: 3 });
      const token = await signTestToken();

      await expect(
        colyseus.http.post("/matchmake/joinOrCreate/tarot", {
          body,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        }),
      ).rejects.toMatchObject({ statusCode: expect.any(Number) });

      expect(serverRoom(waiting.roomId).state.players.size).toBe(1);
      expect(await matchMaker.query({ name: "tarot" })).toHaveLength(1);
    },
  );

  it("un même compte ne peut pas occuper deux sièges de la même table", async () => {
    const sub = randomUUID();
    const first = await joinFree({ playerCount: 4 }, sub);

    await expect(joinFree({ playerCount: 4 }, sub)).rejects.toMatchObject({
      code: ALREADY_SEATED,
    });
    const room = serverRoom(first.roomId);
    expect(room.state.players.size).toBe(1);

    // Les autres joueurs continuent d'arriver normalement.
    const other = await joinFree({ playerCount: 4 });
    expect(other.roomId).toBe(first.roomId);
    expect(room.state.players.size).toBe(2);
  });

  it("après avoir quitté une table en attente, le même compte peut y revenir", async () => {
    // Un autre joueur reste assis : sans lui, la table vide serait fermée par Colyseus.
    const other = await joinFree({ playerCount: 4 });
    const sub = randomUUID();
    const first = await joinFree({ playerCount: 4 }, sub);
    const room = serverRoom(other.roomId);
    await first.leave();
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    const again = await joinFree({ playerCount: 4 }, sub);
    expect(again.roomId).toBe(other.roomId);
    expect(room.state.players.size).toBe(2);
  });
});
