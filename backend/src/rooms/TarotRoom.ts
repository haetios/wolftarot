import { StateView } from "@colyseus/schema";
import { Room, type Client, type CloseCode } from "colyseus";

import { cardId } from "../engine/cards.js";
import { dealCards, isPlayerCount, type Deal, type PlayerCount } from "../engine/deal.js";
import { cryptoRng, type Rng } from "../engine/random.js";
import { PlayerState, TarotState, type Phase } from "./schema/TarotState.js";

export type TarotRoomOptions = {
  /** 3, 4 ou 5 joueurs (4 par défaut). */
  playerCount?: number;
};

export type JoinOptions = {
  /** Pseudo provisoire, en attendant l'authentification Supabase (B13). */
  name?: string;
};

/** Délai pendant lequel le siège d'un joueur déconnecté lui reste réservé. */
const RECONNECTION_SECONDS = 30;

export class TarotRoom extends Room<{ state: TarotState }> {
  state = new TarotState();

  /** Donne en cours, connue du serveur seul. */
  private deal: Deal | null = null;
  private rng: Rng = cryptoRng;

  onCreate(options: TarotRoomOptions = {}) {
    const playerCount = options.playerCount ?? 4;
    if (!isPlayerCount(playerCount)) {
      throw new Error(`Nombre de joueurs invalide : ${String(playerCount)} (attendu : 3, 4 ou 5)`);
    }
    this.maxClients = playerCount;
    this.state.playerCount = playerCount;
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const seat = this.freeSeat();
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.seat = seat;
    player.name = cleanName(options.name) ?? `Joueur ${seat + 1}`;
    this.state.players.set(client.sessionId, player);

    // Le joueur voit les champs privés (`.view()`) de son propre état, et de personne d'autre.
    const view = new StateView();
    view.add(player);
    client.view = view;

    if (this.state.players.size === this.state.playerCount) {
      void this.lock();
      this.startDeal();
    }
  }

  onDrop(client: Client, _code: CloseCode) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    // Non attendu : le framework appelle ensuite onReconnect() ou onLeave().
    // Le catch évite une promesse rejetée non gérée quand la room se ferme.
    this.allowReconnection(client, RECONNECTION_SECONDS).catch(() => {});
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client, _code: CloseCode) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.phase === "waiting") {
      // Avant le début de la partie, le siège est libéré pour un autre joueur.
      this.state.players.delete(client.sessionId);
      void this.unlock();
    } else {
      // Partie en cours : le siège reste occupé (abandon et remplacement : B17).
      player.connected = false;
    }
  }

  private get phase(): Phase {
    return this.state.phase as Phase;
  }

  /** Plus petit siège libre. */
  private freeSeat(): number {
    const taken = new Set([...this.state.players.values()].map((p) => p.seat));
    for (let seat = 0; seat < this.state.playerCount; seat++) {
      if (!taken.has(seat)) return seat;
    }
    throw new Error("Table complète");
  }

  private playerAt(seat: number): PlayerState | undefined {
    return [...this.state.players.values()].find((p) => p.seat === seat);
  }

  /** Table complète : on tire un donneur au hasard, on distribue et les enchères commencent. */
  private startDeal() {
    const playerCount = this.state.playerCount as PlayerCount;
    const dealer = Math.floor(this.rng() * playerCount);
    this.deal = dealCards(playerCount, this.rng);

    this.deal.hands.forEach((hand, seat) => {
      const player = this.playerAt(seat);
      if (!player) return;
      player.hand.clear();
      player.hand.push(...hand.map(cardId));
      player.handSize = hand.length;
    });

    this.state.dealer = dealer;
    this.state.currentSeat = (dealer + 1) % playerCount;
    this.state.phase = "bidding" satisfies Phase;
  }
}

/** Pseudo nettoyé (texte libre venant du client), ou `undefined` s'il est vide. */
function cleanName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : undefined;
}
