import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Room as SdkRoomOf } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { matchMaker } from "colyseus";

import appConfig from "../../src/app.config.js";
import { DEFAULT_TIMING, TarotRoom, type TarotTiming } from "../../src/rooms/TarotRoom.js";
import { connectAs } from "../helpers/auth.js";

type SdkRoom = SdkRoomOf<TarotRoom>;

/** Attend qu'une condition devienne vraie (états mis à jour par des minuteurs). */
async function waitFor(condition: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Condition jamais remplie");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("TarotRoom : déconnexion, reconnexion, délais et abandon", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());
  afterEach(() => {
    TarotRoom.timing = { ...DEFAULT_TIMING };
  });

  /** Délais courts pour les tests (les tables créées ensuite les utilisent). */
  function useTiming(timing: Partial<TarotTiming>) {
    TarotRoom.timing = { ...DEFAULT_TIMING, ...timing };
  }

  /** Table pleine de 3 joueurs : la première donne est distribuée. */
  async function fullTable() {
    const room = await colyseus.createRoom<TarotRoom>("tarot", { playerCount: 3 });
    const clients: SdkRoom[] = [];
    for (let i = 0; i < 3; i++)
      clients.push(await connectAs(colyseus, room, { username: `J${i}` }));
    return { room, clients };
  }

  const playerOf = (room: TarotRoom, client: SdkRoom) => room.state.players.get(client.sessionId)!;

  /** Coupure réseau (fermeture sans consentement), sans reconnexion automatique du SDK. */
  async function drop(client: SdkRoom) {
    client.reconnection.enabled = false;
    const token = client.reconnectionToken;
    await client.leave(false);
    return token;
  }

  describe("reconnexion avec la même identité", () => {
    it("dans le délai, le joueur retrouve son siège, son pseudo et sa main", async () => {
      const { room, clients } = await fullTable();
      const a = clients[0]!;
      const player = playerOf(room, a);
      const seat = player.seat;
      const hand = [...player.hand];

      const token = await drop(a);
      await waitFor(() => !player.connected);
      expect(player.abandoned).toBe(false);

      const back = await colyseus.sdk.reconnect<TarotRoom>(token);
      await waitFor(() => player.connected);
      expect(back.sessionId).toBe(a.sessionId);
      expect(player).toMatchObject({ seat, name: "J0", abandoned: false });

      // La main est de nouveau envoyée à son propriétaire, et à lui seul.
      await back.waitForNextPatch().catch(() => {});
      await waitFor(() => back.state.players?.get(back.sessionId)?.hand?.length === 24);
      expect([...back.state.players.get(back.sessionId)!.hand]).toEqual(hand);
      for (const [sessionId, other] of back.state.players.entries()) {
        if (sessionId !== back.sessionId) expect(other.hand?.length ?? 0).toBe(0);
      }
    });

    it("le joueur reconnecté peut jouer normalement", async () => {
      const { room, clients } = await fullTable();
      const seat = room.state.currentSeat;
      const client = clients.find((c) => playerOf(room, c).seat === seat)!;

      const back = await colyseus.sdk.reconnect<TarotRoom>(await drop(client));
      await waitFor(() => playerOf(room, back).connected);
      back.send("bid", { bid: "pass" });
      await room.waitForMessage("bid");
      expect(room.state.bids).toHaveLength(1);
      expect(room.state.bids[0]!.seat).toBe(seat);
    });

    it("après le délai, la reconnexion est refusée et le joueur a abandonné", async () => {
      useTiming({ reconnectionSeconds: 0.2 });
      const { room, clients } = await fullTable();
      const player = playerOf(room, clients[0]!);

      const token = await drop(clients[0]!);
      await waitFor(() => player.abandoned);
      expect(player.connected).toBe(false);
      await expect(colyseus.sdk.reconnect(token)).rejects.toThrow();
    });
  });

  describe("délai de jeu", () => {
    it("l'échéance de la décision en cours est publiée", async () => {
      useTiming({ turnSeconds: 60 });
      const before = Date.now();
      const { room } = await fullTable();
      expect(room.state.turnDeadline).toBeGreaterThan(before + 55_000);
      expect(room.state.turnDeadline).toBeLessThanOrEqual(Date.now() + 60_000);
    });

    it("sans action à temps, le serveur passe à la place du joueur", async () => {
      useTiming({ turnSeconds: 0.2 });
      const { room } = await fullTable();
      const seat = room.state.currentSeat;
      await waitFor(() => room.state.bids.length >= 1);
      expect(room.state.bids[0]).toMatchObject({ seat, bid: "pass" });
    });

    it("une action à temps relance le délai pour le joueur suivant", async () => {
      useTiming({ turnSeconds: 60 });
      const { room, clients } = await fullTable();
      const first = room.state.turnDeadline;
      const seat = room.state.currentSeat;
      await new Promise((resolve) => setTimeout(resolve, 20));
      clients.find((c) => playerOf(room, c).seat === seat)!.send("bid", { bid: "pass" });
      await room.waitForMessage("bid");
      expect(room.state.currentSeat).not.toBe(seat);
      expect(room.state.turnDeadline).toBeGreaterThan(first);
    });

    it("si personne ne joue, la donne se termine et la suivante commence", async () => {
      useTiming({ turnSeconds: 0.01, scoringSeconds: 0.01 });
      const { room } = await fullTable();
      // Tout le monde passe : redonne, encore et encore… jusqu'à la prochaine donne.
      await waitFor(() => room.state.dealNumber >= 3, 10_000);
      expect(room.state.phase).toBe("bidding");
    });
  });

  describe("aucun message répété ne repousse l'échéance", () => {
    it("un joueur prêt qui renvoie « ready » en boucle ne retarde pas la donne suivante", async () => {
      useTiming({ turnSeconds: 0.01, scoringSeconds: 0.5 });
      const { room, clients } = await fullTable();
      const seat = room.state.currentSeat;
      const taker = clients.find((c) => playerOf(room, c).seat === seat)!;
      taker.send("bid", { bid: "guardWithout" });
      await room.waitForMessage("bid");
      await waitFor(() => room.state.phase === "scoring", 10_000);

      const errors: string[] = [];
      taker.onMessage("error", (e: { code: string }) => errors.push(e.code));
      taker.send("ready");
      await room.waitForMessage("ready");
      const spam = setInterval(() => taker.send("ready"), 100);
      try {
        // Sans correctif, la table restait bloquée en fin de donne tant que le spam durait.
        await waitFor(() => room.state.dealNumber === 2, 3000);
      } finally {
        clearInterval(spam);
      }
      expect(room.state.phase).toBe("bidding");
      expect(errors).toContain("alreadyReady");
    });

    it("le départ d'un autre joueur ne redonne pas un délai complet au joueur attendu", async () => {
      useTiming({ turnSeconds: 60 });
      const { room, clients } = await fullTable();
      const deadline = room.state.turnDeadline;
      const seat = room.state.currentSeat;
      const other = clients.find((c) => playerOf(room, c).seat !== seat)!;

      await new Promise((resolve) => setTimeout(resolve, 20));
      await other.leave();
      await waitFor(() => playerOf(room, other).abandoned);
      expect(room.state.currentSeat).toBe(seat);
      expect(room.state.turnDeadline).toBe(deadline);
    });
  });

  describe("abandon", () => {
    it("quitter une partie en cours : le siège reste, marqué abandonné", async () => {
      const { room, clients } = await fullTable();
      const player = playerOf(room, clients[1]!);
      await clients[1]!.leave();
      await waitFor(() => player.abandoned);
      expect(player.connected).toBe(false);
      expect(room.state.players.size).toBe(3);
    });

    it("le siège d'un joueur qui a abandonné est joué automatiquement, vite", async () => {
      useTiming({ turnSeconds: 60, abandonedActionMs: 10 });
      const { room, clients } = await fullTable();
      const seat = room.state.currentSeat;
      const leaver = clients.find((c) => playerOf(room, c).seat === seat)!;

      await leaver.leave();
      await waitFor(() => room.state.bids.length >= 1);
      expect(room.state.bids[0]).toMatchObject({ seat, bid: "pass" });
      // Les autres joueurs gardent leur délai normal.
      expect(room.state.turnDeadline).toBeGreaterThan(Date.now() + 50_000);
    });

    it("une donne entière se joue avec un joueur qui a abandonné", async () => {
      useTiming({ turnSeconds: 0.01, scoringSeconds: 60, abandonedActionMs: 1 });
      const { room, clients } = await fullTable();
      // Le premier à parler prend une Garde sans : la donne se joue jusqu'au bout.
      const seat = room.state.currentSeat;
      const taker = clients.find((c) => playerOf(room, c).seat === seat)!;
      taker.send("bid", { bid: "guardWithout" });
      await room.waitForMessage("bid");
      const leaver = clients.find((c) => c !== taker)!;
      await leaver.leave();

      await waitFor(() => room.state.phase === "scoring", 10_000);
      expect(room.state.result).toBeDefined();
      expect(room.state.tricksPlayed).toBe(24);
    });

    it("en fin de donne, on n'attend pas les joueurs qui ont abandonné", async () => {
      useTiming({ turnSeconds: 0.01, scoringSeconds: 60, abandonedActionMs: 1 });
      const { room, clients } = await fullTable();
      const seat = room.state.currentSeat;
      const taker = clients.find((c) => playerOf(room, c).seat === seat)!;
      taker.send("bid", { bid: "guardWithout" });
      await room.waitForMessage("bid");
      const [leaver, stayer] = clients.filter((c) => c !== taker);
      await leaver!.leave();
      await waitFor(() => room.state.phase === "scoring", 10_000);

      // Les deux joueurs présents se déclarent prêts ; l'abandonné est compté prêt aussitôt.
      for (const c of [taker, stayer!]) {
        c.send("ready");
        await room.waitForMessage("ready");
      }
      await waitFor(() => room.state.phase === "bidding");
      expect(room.state.dealNumber).toBe(2);
    });

    it("quand tous les joueurs ont abandonné, la table est fermée", async () => {
      const { room, clients } = await fullTable();
      const roomId = room.roomId;
      for (const c of clients) await c.leave();
      // La fermeture est asynchrone : on interroge le matchmaking jusqu'à ce que la table disparaisse.
      let open = true;
      for (let i = 0; i < 100 && open; i++) {
        open = (await matchMaker.query({ roomId })).length > 0;
        if (open) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(open).toBe(false);
    });
  });
});
