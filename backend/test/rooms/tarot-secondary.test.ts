import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Room as SdkRoomOf } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../../src/app.config.js";
import { cardId, parseCardId } from "../../src/engine/cards.js";
import { getLegalCards } from "../../src/engine/legal-moves.js";
import type { TarotRoom } from "../../src/rooms/TarotRoom.js";
import { signTestToken } from "../helpers/auth.js";

type SdkRoom = SdkRoomOf<TarotRoom>;
type MessageType = keyof TarotRoom["messages"];

describe("TarotRoom : option « annonces secondaires » (B17.4)", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  async function joinFree(options: Record<string, unknown>): Promise<SdkRoom> {
    colyseus.sdk.auth.token = await signTestToken({ sub: randomUUID() });
    return colyseus.sdk.joinOrCreate("tarot", options);
  }

  async function createPrivate(options: Record<string, unknown>): Promise<SdkRoom> {
    colyseus.sdk.auth.token = await signTestToken({ sub: randomUUID() });
    return colyseus.sdk.create("tarot", { privateTable: true, ...options });
  }

  const serverRoom = (roomId: string) => colyseus.getRoomById<TarotRoom>(roomId);

  describe("parties libres", () => {
    it("activées par défaut", async () => {
      const a = await joinFree({ playerCount: 4 });
      expect(serverRoom(a.roomId).state.secondaryAnnouncements).toBe(true);
    });

    it("les joueurs ne sont regroupés qu'avec la même option", async () => {
      const withSecondary = await joinFree({ playerCount: 4 });
      const without = await joinFree({ playerCount: 4, secondaryAnnouncements: false });
      const withExplicit = await joinFree({ playerCount: 4, secondaryAnnouncements: true });
      const withoutAgain = await joinFree({ playerCount: 4, secondaryAnnouncements: false });

      expect(without.roomId).not.toBe(withSecondary.roomId);
      expect(withExplicit.roomId).toBe(withSecondary.roomId);
      expect(withoutAgain.roomId).toBe(without.roomId);
      expect(serverRoom(without.roomId).state.secondaryAnnouncements).toBe(false);
    });

    it.each(["non", 0, null])("refuse une valeur invalide (%o)", async (value) => {
      await expect(joinFree({ playerCount: 4, secondaryAnnouncements: value })).rejects.toThrow(
        /secondaryAnnouncements/,
      );
    });
  });

  it("table privée : l'option est choisie à la création", async () => {
    const host = await createPrivate({ playerCount: 3, secondaryAnnouncements: false });
    expect(serverRoom(host.roomId).state.secondaryAnnouncements).toBe(false);
  });

  describe("donne complète sans annonces secondaires", () => {
    async function fullTable() {
      const clients: SdkRoom[] = [
        await joinFree({ playerCount: 3, secondaryAnnouncements: false }),
      ];
      for (let i = 0; i < 2; i++) {
        clients.push(await joinFree({ playerCount: 3, secondaryAnnouncements: false }));
      }
      const room = serverRoom(clients[0]!.roomId);
      expect(clients.every((c) => c.roomId === room.roomId)).toBe(true);
      const bySeat = (seat: number) =>
        clients.find((c) => room.state.players.get(c.sessionId)!.seat === seat)!;
      const send = async (seat: number, type: MessageType, payload?: unknown) => {
        bySeat(seat).send(type, payload);
        await room.waitForMessage(type);
      };
      return { room, bySeat, send };
    }

    it("le chelem est refusé et le score n'a ni prime de chelem ni de petit au bout", async () => {
      const { room, bySeat, send } = await fullTable();
      let first = true;
      while (room.state.phase === "bidding") {
        await send(room.state.currentSeat, "bid", { bid: first ? "guardWithout" : "pass" });
        first = false;
      }
      const taker = room.state.takerSeat;
      const error = bySeat(taker).waitForMessage("error");
      await send(taker, "announceSlam");
      expect(((await error) as { code: string }).code).toBe("secondaryAnnouncementsDisabled");
      expect(room.state.announcements).toHaveLength(0);

      while (room.state.phase === "playing") {
        const seat = room.state.currentSeat;
        const player = [...room.state.players.values()].find((p) => p.seat === seat)!;
        const hand = [...player.hand].map((id) => parseCardId(id)!);
        const trick = [...room.state.currentTrick].map((c) => parseCardId(c.card)!);
        const [card] = getLegalCards(hand, trick);
        await send(seat, "play", { card: cardId(card!) });
      }
      const result = room.state.result!;
      expect(result.slamBonus).toBe(0);
      expect(result.petitAuBoutBonus).toBe(0);
      expect(result.total).toBe(result.contractScore + result.handfulBonus);
    });
  });
});
