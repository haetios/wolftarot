import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { ErrorCode, matchMaker } from "colyseus";

import appConfig from "../../src/app.config.js";
import type { TarotRoom } from "../../src/rooms/TarotRoom.js";
import { connectAs, connectWithToken, signTestToken } from "../helpers/auth.js";

describe("TarotRoom : authentification Supabase", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  const createRoom = () => colyseus.createRoom<TarotRoom>("tarot", { playerCount: 3 });

  describe("jeton valide", () => {
    it("le joueur entre avec l'identité et le pseudo du jeton", async () => {
      const room = await createRoom();
      const sub = "4b0d5c7e-1111-4222-8333-944455556666";
      const client = await connectAs(colyseus, room, { sub, username: "Alice" });

      expect(room.state.players.get(client.sessionId)).toMatchObject({ seat: 0, name: "Alice" });
      // L'identité reste côté serveur, sur le client de la room.
      const serverClient = room.clients.find((c) => c.sessionId === client.sessionId)!;
      expect(serverClient.auth).toEqual({ id: sub, name: "Alice" });
    });

    it("le pseudo envoyé dans les options de connexion est ignoré", async () => {
      const room = await createRoom();
      const token = await signTestToken({ username: "Alice" });
      const client = await connectWithToken(colyseus, room, token, { name: "Usurpateur" });
      expect(room.state.players.get(client.sessionId)!.name).toBe("Alice");
    });

    it("sans pseudo dans le jeton : pseudo de repli", async () => {
      const room = await createRoom();
      await connectAs(colyseus, room, { username: "Alice" });
      const client = await connectAs(colyseus, room);
      expect(room.state.players.get(client.sessionId)!.name).toBe("Joueur 2");
    });

    it("ni le jeton ni l'identifiant Supabase ne sont synchronisés", async () => {
      const room = await createRoom();
      const subs = ["sub-alice-0001", "sub-bob-0002"];
      const tokens = await Promise.all(subs.map((sub) => signTestToken({ sub, username: sub })));
      const alice = await connectWithToken(colyseus, room, tokens[0]!);
      const bob = await connectWithToken(colyseus, room, tokens[1]!);
      await Promise.all([alice.waitForNextPatch(), bob.waitForNextPatch()]);

      for (const client of [alice, bob]) {
        const synced = JSON.stringify(client.state.toJSON());
        expect(synced).toContain(subs[0]); // le pseudo (ici égal au sub) est bien public…
        for (const token of tokens) expect(synced).not.toContain(token);
      }
      const serverState = JSON.stringify(room.state.toJSON());
      for (const token of tokens) expect(serverState).not.toContain(token);
      expect(Object.keys(room.state.players.get(alice.sessionId)!.toJSON())).not.toContain("id");
    });
  });

  describe("connexions refusées (AUTH_FAILED)", () => {
    /** La connexion échoue avec AUTH_FAILED, la raison dans le message, et aucun siège n'est pris. */
    async function expectRefused(connect: (room: TarotRoom) => Promise<unknown>, reason: string) {
      const room = await createRoom();
      await expect(connect(room)).rejects.toMatchObject({
        code: ErrorCode.AUTH_FAILED,
        message: expect.stringContaining(`(${reason})`),
      });
      expect(room.state.players.size).toBe(0);
      expect(room.clients.length).toBe(0);
    }

    it("sans jeton", async () => {
      await colyseus.sdk.auth.signOut();
      await expectRefused((room) => colyseus.connectTo(room), "missingToken");
    });

    it("jeton expiré", async () => {
      const token = await signTestToken({ expiresIn: -60 });
      await expectRefused((room) => connectWithToken(colyseus, room, token), "expiredToken");
    });

    it("mauvaise signature", async () => {
      const key = new TextEncoder().encode("not-the-project-secret-but-long-enough-anyway");
      const token = await signTestToken({ key });
      await expectRefused((room) => connectWithToken(colyseus, room, token), "invalidSignature");
    });

    it("mauvaise audience", async () => {
      const token = await signTestToken({ claims: { aud: "anon" } });
      await expectRefused((room) => connectWithToken(colyseus, room, token), "invalidClaims");
    });

    it("mauvais émetteur", async () => {
      const token = await signTestToken({ claims: { iss: "https://evil.example/auth/v1" } });
      await expectRefused((room) => connectWithToken(colyseus, room, token), "invalidClaims");
    });

    it("jeton mal formé", async () => {
      await expectRefused(
        (room) => connectWithToken(colyseus, room, "pas.un.jwt"),
        "malformedToken",
      );
    });

    it("sans jeton, on ne peut pas non plus créer de table", async () => {
      await colyseus.sdk.auth.signOut();
      await expect(colyseus.sdk.create("tarot", { playerCount: 3 })).rejects.toMatchObject({
        code: ErrorCode.AUTH_FAILED,
      });
    });

    it("un siège réservé sans authentification (côté serveur) ne donne pas de place", async () => {
      const room = await createRoom();
      // Réservation interne, sans contexte d'authentification : `onAuth` n'est pas appelé.
      const reservation = await matchMaker.joinById(room.roomId, {});
      await colyseus.sdk.auth.signOut();
      await expect(colyseus.sdk.consumeSeatReservation(reservation)).rejects.toThrow(
        "identité absente",
      );
      expect(room.state.players.size).toBe(0);
    });
  });
});
