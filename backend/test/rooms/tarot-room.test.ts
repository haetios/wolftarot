import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../../src/app.config.js";
import type { TarotRoom } from "../../src/rooms/TarotRoom.js";
import { connectAs } from "../helpers/auth.js";

describe("TarotRoom", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  const createRoom = (playerCount?: number) =>
    colyseus.createRoom<TarotRoom>("tarot", playerCount === undefined ? {} : { playerCount });
  /** Un joueur authentifié (nouvel utilisateur Supabase à chaque appel). */
  const join = (room: TarotRoom, username?: string) =>
    connectAs(colyseus, room, username === undefined ? {} : { username });

  describe("création", () => {
    it("4 joueurs par défaut", async () => {
      const room = await createRoom();
      expect(room.state.playerCount).toBe(4);
      expect(room.maxClients).toBe(4);
      expect(room.state.phase).toBe("waiting");
    });

    it.each([3, 5])("accepte %i joueurs", async (players) => {
      const room = await createRoom(players);
      expect(room.state.playerCount).toBe(players);
    });

    it("refuse un nombre de joueurs invalide", async () => {
      await expect(createRoom(6)).rejects.toThrow();
    });
  });

  describe("rejoindre et quitter", () => {
    it("chaque joueur reçoit le plus petit siège libre et son pseudo", async () => {
      const room = await createRoom(3);
      // Le pseudo vient du jeton (`user_metadata.username`) ; sans pseudo, valeur de repli.
      const a = await join(room, "  Alice  ");
      const b = await join(room);

      const alice = room.state.players.get(a.sessionId)!;
      const other = room.state.players.get(b.sessionId)!;
      expect(alice).toMatchObject({ seat: 0, name: "Alice", connected: true });
      expect(other).toMatchObject({ seat: 1, name: "Joueur 2" });
      expect(room.state.phase).toBe("waiting");
    });

    it("avant la partie, quitter libère le siège", async () => {
      const room = await createRoom(3);
      const a = await join(room);
      await join(room);

      await a.leave();
      await room.waitForNextPatch();
      expect(room.state.players.size).toBe(1);

      const c = await join(room);
      expect(room.state.players.get(c.sessionId)!.seat).toBe(0);
    });

    it("une table complète est verrouillée et la donne commence", async () => {
      const room = await createRoom(3);
      for (let i = 0; i < 3; i++) await join(room);

      expect(room.locked).toBe(true);
      expect(room.state.phase).toBe("bidding");
      expect(room.state.dealer).toBeGreaterThanOrEqual(0);
      expect(room.state.dealer).toBeLessThan(3);
      expect(room.state.currentSeat).toBe((room.state.dealer + 1) % 3);
    });

    it("pendant la partie, quitter ne libère pas le siège", async () => {
      const room = await createRoom(3);
      const clients = [];
      for (let i = 0; i < 3; i++) clients.push(await join(room));

      await clients[0]!.leave();
      await room.waitForNextPatch();
      expect(room.state.players.size).toBe(3);
      expect(room.state.players.get(clients[0]!.sessionId)!.connected).toBe(false);
    });
  });

  describe("distribution", () => {
    it.each([
      [3, 24],
      [4, 18],
      [5, 15],
    ])("à %i joueurs : %i cartes chacun, toutes différentes", async (players, handSize) => {
      const room = await createRoom(players);
      for (let i = 0; i < players; i++) await join(room);

      const hands = [...room.state.players.values()].map((p) => [...p.hand]);
      for (const hand of hands) expect(hand).toHaveLength(handSize);
      expect(new Set(hands.flat()).size).toBe(players * handSize);
      for (const p of room.state.players.values()) expect(p.handSize).toBe(handSize);
    });
  });

  describe("confidentialité des mains", () => {
    it("chaque client ne reçoit que sa propre main", async () => {
      const room = await createRoom(3);
      const clients = [];
      for (let i = 0; i < 3; i++) clients.push(await join(room));
      await Promise.all(clients.map((c) => c.waitForNextPatch()));

      for (const client of clients) {
        const serverHand = [...room.state.players.get(client.sessionId)!.hand];

        for (const [sessionId, player] of client.state.players.entries()) {
          // Tout le monde voit la taille des mains…
          expect(player.handSize).toBe(24);
          if (sessionId === client.sessionId) {
            // …mais seul le propriétaire reçoit ses cartes.
            expect([...player.hand]).toEqual(serverHand);
          } else {
            expect(player.hand?.length ?? 0).toBe(0);
          }
        }
      }
    });
  });
});
