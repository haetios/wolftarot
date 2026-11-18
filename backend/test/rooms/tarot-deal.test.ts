import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Room as SdkRoomOf } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../../src/app.config.js";
import type { Contract } from "../../src/engine/bidding.js";
import { isOudler, parseCardId, type Card, type SuitCard } from "../../src/engine/cards.js";
import { DEAL_CONFIGS, type PlayerCount } from "../../src/engine/deal.js";
import { discardableCards } from "../../src/engine/dog.js";
import { callableCards } from "../../src/engine/king-call.js";
import { getLegalCards } from "../../src/engine/legal-moves.js";
import type { TarotRoom } from "../../src/rooms/TarotRoom.js";
import { connectAs } from "../helpers/auth.js";

type SdkRoom = SdkRoomOf<TarotRoom>;
type MessageType = keyof TarotRoom["messages"];

describe("TarotRoom : déroulement d'une donne", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  /** Une table pleine : la première donne est distribuée. */
  async function fullTable(playerCount: PlayerCount) {
    const room = await colyseus.createRoom<TarotRoom>("tarot", { playerCount });
    const clients: SdkRoom[] = [];
    for (let i = 0; i < playerCount; i++) {
      clients.push(await connectAs(colyseus, room, { username: `J${i}` }));
    }
    return new Table(room, clients);
  }

  class Table {
    constructor(
      readonly room: TarotRoom,
      readonly clients: SdkRoom[],
    ) {}

    get state() {
      return this.room.state;
    }

    client(seat: number): SdkRoom {
      return this.clients.find((c) => this.state.players.get(c.sessionId)!.seat === seat)!;
    }

    hand(seat: number): Card[] {
      const player = [...this.state.players.values()].find((p) => p.seat === seat)!;
      return [...player.hand].map((id) => parseCardId(id)!);
    }

    /** Envoie un message et attend que le serveur l'ait traité. */
    async send(seat: number, type: MessageType, payload?: unknown) {
      this.client(seat).send(type, payload);
      await this.room.waitForMessage(type);
    }

    /** Envoie un message refusé et renvoie le code d'erreur reçu par ce client. */
    async sendExpectingError(seat: number, type: MessageType, payload?: unknown): Promise<string> {
      const error = this.client(seat).waitForMessage("error");
      await this.send(seat, type, payload);
      return ((await error) as { code: string }).code;
    }

    /** Enchères : le premier à parler annonce `contract`, les autres passent. */
    async bid(contract: Contract) {
      let first = true;
      while (this.state.phase === "bidding") {
        await this.send(this.state.currentSeat, "bid", { bid: first ? contract : "pass" });
        first = false;
      }
    }

    /** Appel du roi (5 joueurs) et écart (Petite, Garde), si la phase l'exige. */
    async prepare() {
      const taker = this.state.takerSeat;
      if (this.state.phase === "calling") {
        const [card] = callableCards(this.hand(taker));
        await this.send(taker, "callKing", { card: id(card!) });
      }
      if (this.state.phase === "discarding") {
        const { dogSize } = DEAL_CONFIGS[this.state.playerCount as PlayerCount];
        const discard = discardableCards(this.hand(taker), dogSize).slice(0, dogSize);
        await this.send(taker, "discard", { cards: discard.map(id) });
      }
    }

    /** Joue toute la donne : chaque joueur joue sa première carte légale. */
    async playAll() {
      while (this.state.phase === "playing") {
        const seat = this.state.currentSeat;
        const trick = [...this.state.currentTrick].map((c) => parseCardId(c.card)!);
        const called = parseCardId(this.state.calledCard);
        const firstLead = this.state.tricksPlayed === 0 && called !== null;
        const options = firstLead ? { calledCardOnFirstLead: called as SuitCard } : {};
        const [card] = getLegalCards(this.hand(seat), trick, options);
        await this.send(seat, "play", { card: id(card!) });
      }
    }
  }

  const id = (card: Card) =>
    card.kind === "excuse"
      ? "excuse"
      : card.kind === "trump"
        ? `trump-${card.rank}`
        : `${card.suit}-${card.rank}`;
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  it.each<[PlayerCount, Contract]>([
    [3, "guard"],
    [4, "guardWithout"],
    [4, "guardAgainst"],
    [5, "guard"],
    [5, "small"],
  ])("donne complète à %i joueurs en %s, puis donne suivante", async (players, contract) => {
    const table = await fullTable(players);
    const { state } = table;
    const firstDealer = state.dealer;
    const { handSize } = DEAL_CONFIGS[players];

    await table.bid(contract);
    expect(state.contract).toBe(contract);
    expect(state.takerSeat).toBe(state.bids[0]!.seat);
    // Une Garde contre termine les enchères immédiatement.
    expect(state.bids).toHaveLength(contract === "guardAgainst" ? 1 : players);

    await table.prepare();
    expect(state.phase).toBe("playing");
    if (players === 5) expect(state.calledCard).not.toBe("");
    // Le chien n'est montré qu'en Petite et en Garde.
    const dogShown = contract === "small" || contract === "guard";
    expect(state.dog.length > 0).toBe(dogShown);

    await table.playAll();
    expect(state.phase).toBe("scoring");
    expect(state.tricksPlayed).toBe(handSize);
    for (const player of state.players.values()) expect(player.handSize).toBe(0);

    const result = state.result!;
    expect(result).toBeDefined();
    expect(sum([...result.playerScores])).toBe(0);
    expect(result.fulfilled).toBe(result.contractScore > 0);
    for (const player of state.players.values()) {
      expect(player.score).toBe(result.playerScores[player.seat]);
    }

    // Tous prêts : nouvelle donne, le donneur suivant distribue.
    for (let seat = 0; seat < players; seat++) await table.send(seat, "ready");
    expect(state.phase).toBe("bidding");
    expect(state.dealNumber).toBeGreaterThanOrEqual(2);
    expect(state.dealer).not.toBe(firstDealer);
    expect(state.result).toBeUndefined();
    expect(state.contract).toBe("");
    for (const player of state.players.values()) expect(player.handSize).toBe(handSize);
  });

  it("si tout le monde passe, le joueur suivant redonne", async () => {
    const table = await fullTable(4);
    const { state } = table;
    const dealer = state.dealer;
    const dealNumber = state.dealNumber;
    const redeal = table.clients[0]!.waitForMessage("redeal");

    // Un « passe » par joueur (la redonne relance aussitôt une phase d'enchères).
    for (let i = 0; i < 4; i++) await table.send(state.currentSeat, "bid", { bid: "pass" });
    expect(await redeal).toMatchObject({ reason: expect.any(String) });
    expect(state.phase).toBe("bidding");
    expect(state.dealNumber).toBeGreaterThan(dealNumber);
    expect(state.dealer).not.toBe(dealer);
    expect(state.bids).toHaveLength(0);
  });

  it("le chelem annoncé donne l'entame au preneur", async () => {
    const table = await fullTable(4);
    const { state } = table;
    await table.bid("guardWithout");
    const taker = state.takerSeat;

    expect(await table.sendExpectingError((taker + 1) % 4, "announceSlam")).toBe("notTaker");
    await table.send(taker, "announceSlam");
    expect(state.announcements).toHaveLength(1);
    expect(state.announcements[0]!.kind).toBe("slam");
    expect(state.currentSeat).toBe(taker);
  });

  describe("actions refusées (message `error` au seul joueur fautif)", () => {
    it("enchère hors de son tour", async () => {
      const table = await fullTable(3);
      const notMyTurn = (table.state.currentSeat + 1) % 3;
      expect(await table.sendExpectingError(notMyTurn, "bid", { bid: "small" })).toBe(
        "notYourTurn",
      );
    });

    it("enchère inconnue", async () => {
      const table = await fullTable(3);
      expect(
        await table.sendExpectingError(table.state.currentSeat, "bid", { bid: "chelem" }),
      ).toBe("invalidBid");
    });

    it("jouer une carte pendant les enchères", async () => {
      const table = await fullTable(3);
      const seat = table.state.currentSeat;
      const card = id(table.hand(seat)[0]!);
      expect(await table.sendExpectingError(seat, "play", { card })).toBe("wrongPhase");
    });

    it("carte inconnue ou mal formée", async () => {
      const table = await fullTable(3);
      await table.bid("guard");
      const taker = table.state.takerSeat;
      expect(await table.sendExpectingError(taker, "discard", { cards: ["joker"] })).toBe(
        "invalidCard",
      );
      expect(await table.sendExpectingError(taker, "discard", "n'importe quoi")).toBe(
        "invalidCard",
      );
    });

    it("écart d'une carte interdite : la phase ne change pas", async () => {
      const table = await fullTable(3);
      await table.bid("guard");
      const taker = table.state.takerSeat;
      const hand = table.hand(taker);
      // Une carte interdite (Roi, sinon bout), complétée par cinq cartes autorisées.
      const illegal = hand.find((c) => c.kind === "suit" && c.rank === 14) ?? hand.find(isOudler)!;
      const allowed = discardableCards(hand, 6).filter((c) => c !== illegal);
      const bad = [illegal, ...allowed.slice(0, 5)];
      const code = await table.sendExpectingError(taker, "discard", { cards: bad.map(id) });
      expect(["oudlerInDiscard", "kingInDiscard"]).toContain(code);
      expect(table.state.phase).toBe("discarding");
    });

    it("carte jouée hors de son tour", async () => {
      const table = await fullTable(4);
      await table.bid("guardAgainst");
      const notMyTurn = (table.state.currentSeat + 1) % 4;
      const card = id(table.hand(notMyTurn)[0]!);
      expect(await table.sendExpectingError(notMyTurn, "play", { card })).toBe("notYourTurn");
    });
  });
});
