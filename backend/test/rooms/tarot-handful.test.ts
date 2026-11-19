import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Room as SdkRoomOf } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../../src/app.config.js";
import {
  cardId,
  createDeck,
  parseCardId,
  suitCard,
  trump,
  type Card,
  type TrumpRank,
} from "../../src/engine/cards.js";
import type { Deal } from "../../src/engine/deal.js";
import { getLegalCards } from "../../src/engine/legal-moves.js";
import { seededRng, shuffle } from "../../src/engine/random.js";
import { TarotRoom, randomDeals } from "../../src/rooms/TarotRoom.js";
import { connectAs } from "../helpers/auth.js";

type SdkRoom = SdkRoomOf<TarotRoom>;
type MessageType = keyof TarotRoom["messages"];

/** Les atouts de `from` à `to` inclus. */
const trumps = (from: number, to: number): Card[] =>
  Array.from({ length: to - from + 1 }, (_, i) => trump((from + i) as TrumpRank));

/**
 * Donne à 3 joueurs construite à la main : le siège 0 a exactement 13 atouts (poignée simple à
 * 3 joueurs) et 11 piques ; le reste est mélangé entre les deux autres mains et le chien.
 */
function handfulDeal(): Deal {
  const seat0 = [
    ...trumps(1, 13),
    ...Array.from({ length: 11 }, (_, i) => suitCard("spades", (i + 1) as 1)),
  ];
  const taken = new Set(seat0.map(cardId));
  const rest = shuffle(
    createDeck().filter((c) => !taken.has(cardId(c))),
    seededRng(42),
  );
  return { hands: [seat0, rest.slice(0, 24), rest.slice(24, 48)], dog: rest.slice(48, 54) };
}

describe("TarotRoom : poignée annoncée pendant une vraie donne", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => {
    await colyseus.cleanup();
    TarotRoom.dealSource = () => handfulDeal();
  });
  afterEach(() => {
    TarotRoom.dealSource = randomDeals;
  });

  async function fullTable() {
    const room = await colyseus.createRoom<TarotRoom>("tarot", { playerCount: 3 });
    const clients: SdkRoom[] = [];
    for (let i = 0; i < 3; i++)
      clients.push(await connectAs(colyseus, room, { username: `J${i}` }));
    const bySeat = (seat: number) =>
      clients.find((c) => room.state.players.get(c.sessionId)!.seat === seat)!;
    const hand = (seat: number) =>
      [...[...room.state.players.values()].find((p) => p.seat === seat)!.hand].map((id) =>
        parseCardId(id)!,
      );
    const send = async (seat: number, type: MessageType, payload?: unknown) => {
      bySeat(seat).send(type, payload);
      await room.waitForMessage(type);
    };
    const sendExpectingError = async (seat: number, type: MessageType, payload?: unknown) => {
      const error = bySeat(seat).waitForMessage("error");
      await send(seat, type, payload);
      return ((await error) as { code: string }).code;
    };
    /** Le joueur dont c'est le tour joue sa première carte légale. */
    const playOne = async () => {
      const seat = room.state.currentSeat;
      const trick = [...room.state.currentTrick].map((c) => parseCardId(c.card)!);
      const [card] = getLegalCards(hand(seat), trick);
      await send(seat, "play", { card: cardId(card!) });
    };
    return { room, send, sendExpectingError, playOne };
  }

  it("le joueur aux 13 atouts annonce sa poignée avant sa première carte ; la prime est comptée", async () => {
    const { room, send, sendExpectingError, playOne } = await fullTable();

    // Enchères : le premier à parler prend une Garde sans (pas d'écart), les autres passent.
    let first = true;
    while (room.state.phase === "bidding") {
      await send(room.state.currentSeat, "bid", { bid: first ? "guardWithout" : "pass" });
      first = false;
    }
    expect(room.state.phase).toBe("playing");

    // Premier pli : on joue jusqu'au tour du siège 0.
    while (room.state.currentSeat !== 0) {
      // Un autre joueur ne peut pas annoncer de poignée hors de son tour.
      expect(
        await sendExpectingError(0, "announceHandful", { cards: trumps(1, 13).map(cardId) }),
      ).toBe("cannotAnnounceHandful");
      await playOne();
    }

    // Mauvais nombre d'atouts : refusé.
    expect(
      await sendExpectingError(0, "announceHandful", { cards: trumps(1, 12).map(cardId) }),
    ).toBe("wrongHandfulSize");
    // Un atout qu'il n'a pas : refusé.
    expect(
      await sendExpectingError(0, "announceHandful", {
        cards: [...trumps(1, 12), trump(21)].map(cardId),
      }),
    ).toBe("cardNotInHand");

    // Poignée simple valide (13 atouts à 3 joueurs).
    await send(0, "announceHandful", { cards: trumps(1, 13).map(cardId) });
    expect(room.state.announcements).toHaveLength(1);
    expect(room.state.announcements[0]).toMatchObject({
      seat: 0,
      kind: "handful",
      level: "single",
    });
    expect([...room.state.announcements[0]!.cards]).toEqual(trumps(1, 13).map(cardId));

    // Une seule poignée par joueur, et plus après sa première carte.
    expect(
      await sendExpectingError(0, "announceHandful", { cards: trumps(1, 13).map(cardId) }),
    ).toBe("cannotAnnounceHandful");
    await playOne();
    expect(
      await sendExpectingError(0, "announceHandful", { cards: trumps(1, 13).map(cardId) }),
    ).toBe("cannotAnnounceHandful");

    // Fin de la donne : la prime de 20 revient au camp gagnant.
    while (room.state.phase === "playing") await playOne();
    const result = room.state.result!;
    expect(result.handfulBonus).toBe(result.fulfilled ? 20 : -20);
    expect(result.total).toBe(
      result.contractScore + result.handfulBonus + result.petitAuBoutBonus + result.slamBonus,
    );
  });
});
