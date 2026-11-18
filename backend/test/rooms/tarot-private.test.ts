import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Room as SdkRoomOf } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../../src/app.config.js";
import {
  PRIVATE_CODE_ALPHABET,
  PRIVATE_CODE_LENGTH,
  type TarotRoom,
} from "../../src/rooms/TarotRoom.js";
import { signTestToken } from "../helpers/auth.js";

type SdkRoom = SdkRoomOf<TarotRoom>;
type MessageType = keyof TarotRoom["messages"];

describe("TarotRoom : tables privées", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  async function authenticate() {
    colyseus.sdk.auth.token = await signTestToken({ sub: randomUUID() });
  }

  /** L'hôte crée une table privée, comme le fera le frontend. */
  async function createPrivate(options: Record<string, unknown> = {}): Promise<SdkRoom> {
    await authenticate();
    return colyseus.sdk.create("tarot", { privateTable: true, ...options });
  }

  /** Un ami rejoint la table avec son code. */
  async function joinByCode(code: string): Promise<SdkRoom> {
    await authenticate();
    return colyseus.sdk.joinById(code);
  }

  async function joinFree(options: Record<string, unknown> = {}): Promise<SdkRoom> {
    await authenticate();
    return colyseus.sdk.joinOrCreate("tarot", options);
  }

  const serverRoom = (roomId: string) => colyseus.getRoomById<TarotRoom>(roomId);

  /** Envoie un message et attend que le serveur l'ait traité. */
  async function send(client: SdkRoom, type: MessageType, payload?: unknown) {
    client.send(type, payload);
    await serverRoom(client.roomId).waitForMessage(type);
  }

  /** Envoie un message refusé et renvoie le code d'erreur reçu par ce client. */
  async function sendExpectingError(client: SdkRoom, type: MessageType, payload?: unknown) {
    const error = client.waitForMessage("error");
    await send(client, type, payload);
    return ((await error) as { code: string }).code;
  }

  describe("création avec code", () => {
    it("le code est l'identifiant de la table, lisible et sans caractère ambigu", async () => {
      const host = await createPrivate({ playerCount: 3 });
      const code = host.roomId;
      const pattern = new RegExp(`^[${PRIVATE_CODE_ALPHABET}]{${PRIVATE_CODE_LENGTH}}$`);
      expect(code).toMatch(pattern);
      expect(code).not.toMatch(/[01OIL]/);

      const room = serverRoom(code);
      expect(room.state).toMatchObject({ isPrivate: true, code, playerCount: 3, hostSeat: 0 });
      expect(room.state.phase).toBe("waiting");
    });

    it("deux tables privées n'ont jamais le même code", async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 10; i++) codes.add((await createPrivate()).roomId);
      expect(codes.size).toBe(10);
    });

    it("une table privée n'apparaît jamais dans le matchmaking des parties libres", async () => {
      const host = await createPrivate({ playerCount: 4 });
      const stranger = await joinFree({ playerCount: 4 });
      expect(stranger.roomId).not.toBe(host.roomId);
      expect(serverRoom(host.roomId).state.players.size).toBe(1);
    });

    it("une partie libre n'a ni code ni hôte", async () => {
      const player = await joinFree({ playerCount: 4 });
      expect(serverRoom(player.roomId).state).toMatchObject({
        isPrivate: false,
        code: "",
        hostSeat: -1,
      });
    });

    it.each(["yes", 1, null])("refuse une option privateTable invalide (%o)", async (value) => {
      await expect(createPrivate({ privateTable: value })).rejects.toThrow(/privateTable/);
    });
  });

  describe("rejoindre par code", () => {
    it("les amis rejoignent la table avec le code", async () => {
      const host = await createPrivate({ playerCount: 3 });
      const friend = await joinByCode(host.roomId);
      expect(friend.roomId).toBe(host.roomId);
      expect(serverRoom(host.roomId).state.players.size).toBe(2);
    });

    it("un code inconnu est refusé", async () => {
      await expect(joinByCode("ZZZZZZ")).rejects.toThrow();
    });

    it("une table privée complète n'accepte plus personne", async () => {
      const host = await createPrivate({ playerCount: 3 });
      await joinByCode(host.roomId);
      await joinByCode(host.roomId);
      await expect(joinByCode(host.roomId)).rejects.toThrow();
    });
  });

  describe("l'hôte", () => {
    it("une table privée complète ne démarre pas seule : l'hôte lance la partie", async () => {
      const host = await createPrivate({ playerCount: 3 });
      const friends = [await joinByCode(host.roomId), await joinByCode(host.roomId)];
      const room = serverRoom(host.roomId);
      expect(room.state.phase).toBe("waiting");

      expect(await sendExpectingError(friends[0]!, "start")).toBe("notHost");
      await send(host, "start");
      expect(room.state.phase).toBe("bidding");
      for (const player of room.state.players.values()) expect(player.handSize).toBe(24);
      expect(await sendExpectingError(host, "start")).toBe("wrongPhase");
    });

    it("l'hôte ne peut pas lancer une table incomplète", async () => {
      const host = await createPrivate({ playerCount: 3 });
      await joinByCode(host.roomId);
      expect(await sendExpectingError(host, "start")).toBe("tableNotFull");
      expect(serverRoom(host.roomId).state.phase).toBe("waiting");
    });

    it("l'hôte choisit 3, 4 ou 5 joueurs avant de lancer", async () => {
      const host = await createPrivate({ playerCount: 5 });
      const room = serverRoom(host.roomId);
      await joinByCode(host.roomId);
      await joinByCode(host.roomId);

      await send(host, "setPlayerCount", { playerCount: 3 });
      expect(room.state.playerCount).toBe(3);
      expect(room.maxClients).toBe(3);
      await expect(joinByCode(host.roomId)).rejects.toThrow();

      await send(host, "start");
      expect(room.state.phase).toBe("bidding");
      for (const player of room.state.players.values()) expect(player.handSize).toBe(24);
    });

    it("agrandir une table pleine la rouvre aux amis", async () => {
      const host = await createPrivate({ playerCount: 3 });
      await joinByCode(host.roomId);
      await joinByCode(host.roomId);
      await send(host, "setPlayerCount", { playerCount: 4 });

      const fourth = await joinByCode(host.roomId);
      expect(fourth.roomId).toBe(host.roomId);
      expect(serverRoom(host.roomId).state.players.size).toBe(4);
    });

    it("refuse une taille invalide, ou plus petite que le nombre de joueurs assis", async () => {
      const host = await createPrivate({ playerCount: 5 });
      for (let i = 0; i < 3; i++) await joinByCode(host.roomId);

      expect(await sendExpectingError(host, "setPlayerCount", { playerCount: 6 })).toBe(
        "invalidPlayerCount",
      );
      expect(await sendExpectingError(host, "setPlayerCount", { playerCount: "4" })).toBe(
        "invalidPlayerCount",
      );
      expect(await sendExpectingError(host, "setPlayerCount", { playerCount: 3 })).toBe(
        "tooManyPlayers",
      );
      expect(serverRoom(host.roomId).state.playerCount).toBe(5);
    });

    it("seul l'hôte change la taille, et seulement sur une table privée", async () => {
      const host = await createPrivate({ playerCount: 4 });
      const friend = await joinByCode(host.roomId);
      expect(await sendExpectingError(friend, "setPlayerCount", { playerCount: 3 })).toBe(
        "notHost",
      );

      const free = await joinFree({ playerCount: 4 });
      expect(await sendExpectingError(free, "setPlayerCount", { playerCount: 3 })).toBe(
        "notPrivate",
      );
      expect(await sendExpectingError(free, "start")).toBe("notPrivate");
    });

    it("réduire la taille renumérote les sièges sans trou, l'hôte compris", async () => {
      const host = await createPrivate({ playerCount: 5 });
      const room = serverRoom(host.roomId);
      const b = await joinByCode(host.roomId);
      const c = await joinByCode(host.roomId);
      const d = await joinByCode(host.roomId);
      // Sièges 0, 1, 2, 3 ; les sièges 1 et 2 partent : il reste 0 et 3.
      await b.leave();
      await room.waitForNextPatch();
      await c.leave();
      await room.waitForNextPatch();

      await send(host, "setPlayerCount", { playerCount: 3 });
      const seats = [...room.state.players.values()].map((p) => p.seat).sort();
      expect(seats).toEqual([0, 1]);
      expect(room.state.players.get(host.sessionId)!.seat).toBe(room.state.hostSeat);
      expect(room.state.players.get(d.sessionId)!.seat).toBe(1);
    });

    it("si l'hôte part avant le début, le joueur au plus petit siège devient l'hôte", async () => {
      const host = await createPrivate({ playerCount: 4 });
      const room = serverRoom(host.roomId);
      const friend = await joinByCode(host.roomId);
      await joinByCode(host.roomId);

      await host.leave();
      await room.waitForNextPatch();
      expect(room.state.hostSeat).toBe(room.state.players.get(friend.sessionId)!.seat);
      expect(room.state.hostSeat).toBe(1);

      // Le nouvel hôte peut agir.
      await send(friend, "setPlayerCount", { playerCount: 3 });
      expect(room.state.playerCount).toBe(3);
    });
  });
});
