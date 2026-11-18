import { StateView } from "@colyseus/schema";
import {
  ErrorCode,
  matchMaker,
  Room,
  ServerError,
  type AuthContext,
  type Client,
  type CloseCode,
} from "colyseus";

import {
  canAnnounceHandful,
  firstLeader,
  validateHandful,
  validateSlamAnnouncement,
  type Announcement,
} from "../engine/announcements.js";
import { authenticate } from "../auth/authenticate.js";
import type { PlayerIdentity } from "../auth/identity.js";
import { AuthError } from "../auth/verify-token.js";
import {
  CONTRACTS,
  auctionResult,
  placeBid,
  startAuction,
  type AuctionState,
  type Bid,
  type Contract,
} from "../engine/bidding.js";
import { cardId, parseCardId, type Card } from "../engine/cards.js";
import {
  DEAL_CONFIGS,
  dealCards,
  isPlayerCount,
  seatsWithPetitSec,
  type Deal,
  type PlayerCount,
} from "../engine/deal.js";
import { isDogRevealed, makeDiscard, takeDog } from "../engine/dog.js";
import { IllegalActionError } from "../engine/errors.js";
import {
  attackerSeats,
  callKing,
  revealOnDogShown,
  revealOnPlay,
  type KingCall,
} from "../engine/king-call.js";
import { isPlayFinished, playCard, startPlay, type PlayState } from "../engine/play.js";
import { cryptoRng, type Rng } from "../engine/random.js";
import { scoreDeal } from "../engine/scoring.js";
import {
  AnnouncementState,
  BidState,
  DealResultState,
  PlayedCardState,
  PlayerState,
  TarotState,
  type Phase,
} from "./schema/TarotState.js";

export type TarotRoomOptions = {
  /** 3, 4 ou 5 joueurs (4 par défaut). */
  playerCount?: number;
  /**
   * Table privée (`client.create("tarot", { privateTable: true })`) : absente du matchmaking,
   * rejointe par son code avec `client.joinById(code)`. (`private` est un nom réservé par Colyseus.)
   */
  privateTable?: boolean;
};

/** Alphabet des codes de table privée : sans 0/O, 1/I/L, pour se lire et se dicter sans erreur. */
export const PRIVATE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PRIVATE_CODE_LENGTH = 6;

/** Taille de table quand le client ne la précise pas. */
export const DEFAULT_PLAYER_COUNT = 4;

/**
 * Un même compte occupe déjà un siège de cette table (deux onglets, par exemple) : refusé,
 * sinon il verrait deux mains. La reconnexion à son propre siège relève de B17.
 */
export const ALREADY_SEATED = 4090;

/**
 * Normalise les options de matchmaking envoyées par le client (non fiables), **en place** :
 * Colyseus filtre les tables sur `playerCount` (`filterBy` dans `app.config.ts`), et une option
 * absente ne filtrerait rien — le joueur pourrait arriver à une table de n'importe quelle taille.
 * On fixe donc la valeur par défaut avant la recherche de table, et on refuse une valeur invalide.
 */
export function normalizeMatchmakingOptions(options: unknown): void {
  // Le corps de la requête de matchmaking est passé tel quel : une primitive (`"abc"`, `42`),
  // `null` ou un tableau échapperait au filtre `playerCount` (filtre vide → n'importe quelle table).
  if (!isPlainObject(options)) {
    throw new ServerError(
      ErrorCode.MATCHMAKE_INVALID_CRITERIA,
      "Options de matchmaking invalides : un objet est attendu",
    );
  }
  const opts = options;
  if (opts.privateTable !== undefined && typeof opts.privateTable !== "boolean") {
    throw new ServerError(
      ErrorCode.MATCHMAKE_INVALID_CRITERIA,
      "Option privateTable invalide : un booléen est attendu",
    );
  }
  if (opts.playerCount === undefined) {
    opts.playerCount = DEFAULT_PLAYER_COUNT;
  } else if (!isPlayerCount(opts.playerCount)) {
    throw new ServerError(
      ErrorCode.MATCHMAKE_INVALID_CRITERIA,
      `Nombre de joueurs invalide : ${String(opts.playerCount)} (attendu : 3, 4 ou 5)`,
    );
  }
}

/**
 * Client authentifié : `client.auth` est l'identité renvoyée par `TarotRoom.onAuth`.
 * Elle reste côté serveur (ni le jeton ni l'identifiant Supabase ne sont synchronisés).
 */
export type TarotClient = Client<{ auth: PlayerIdentity }>;

/** Délai pendant lequel le siège d'un joueur déconnecté lui reste réservé. */
const RECONNECTION_SECONDS = 30;

const BIDS: readonly Bid[] = ["pass", ...CONTRACTS];

/** Donne en cours, connue du serveur seul. Le schéma n'en montre que la partie publique. */
type DealContext = {
  deal: Deal;
  /** Mains actuelles par siège : source de vérité, recopiée dans le schéma. */
  hands: Card[][];
  auction: AuctionState;
  contract: Contract | null;
  takerSeat: number;
  kingCall: KingCall | null;
  discard: Card[];
  shownTrumps: Card[];
  announcements: Announcement[];
  play: PlayState | null;
};

export class TarotRoom extends Room<{ state: TarotState; client: TarotClient }> {
  state = new TarotState();

  private ctx: DealContext | null = null;
  /** Compte Supabase (`sub`) assis à chaque session : connu du serveur seul. */
  private userIdBySession = new Map<string, string>();
  private rng: Rng = cryptoRng;

  /** Messages des clients. Toute action refusée par les règles renvoie un message `error`. */
  messages = {
    bid: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onBid(seat, field(message, "bid"))),
    callKing: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onCallKing(seat, field(message, "card"))),
    discard: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onDiscard(seat, field(message, "cards"))),
    announceHandful: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onAnnounceHandful(seat, field(message, "cards"))),
    announceSlam: (client: Client) => this.handle(client, (seat) => this.onAnnounceSlam(seat)),
    play: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onPlay(seat, field(message, "card"))),
    ready: (client: Client) => this.handle(client, (seat) => this.onReady(seat)),
    // Tables privées, réservé à l'hôte, avant le début de la partie.
    setPlayerCount: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onSetPlayerCount(seat, field(message, "playerCount"))),
    start: (client: Client) => this.handle(client, (seat) => this.onStart(seat)),
  };

  async onCreate(options: TarotRoomOptions = {}) {
    const playerCount = options.playerCount ?? DEFAULT_PLAYER_COUNT;
    if (!isPlayerCount(playerCount)) {
      throw new Error(`Nombre de joueurs invalide : ${String(playerCount)} (attendu : 3, 4 ou 5)`);
    }
    this.maxClients = playerCount;
    this.state.playerCount = playerCount;

    if (options.privateTable === true) {
      // Le code est l'identifiant de la room : on le rejoint avec `joinById(code)`.
      this.roomId = await this.uniquePrivateCode();
      await this.setPrivate(true);
      this.state.isPrivate = true;
      this.state.code = this.roomId;
    }
  }

  /**
   * Authentification, appelée par le matchmaking avant toute réservation de siège (création
   * comme connexion) : le jeton Supabase arrive dans l'en-tête `Authorization: Bearer`
   * (`client.auth.token = jwt` côté SDK). Une connexion sans jeton valide est refusée avec
   * le code `AUTH_FAILED` et un message `Authentification refusée (<raison>) : …`.
   * L'identité renvoyée devient `client.auth`.
   */
  static async onAuth(
    token: string | undefined,
    options: unknown,
    _context: AuthContext,
  ): Promise<PlayerIdentity> {
    try {
      const identity = await authenticate(token);
      // Appelé par le matchmaking avant la recherche de table, avec le même objet d'options.
      normalizeMatchmakingOptions(options);
      return identity;
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      throw new ServerError(
        ErrorCode.AUTH_FAILED,
        `Authentification refusée (${error.reason}) : ${error.message}`,
      );
    }
  }

  /** Les options de connexion sont ignorées : l'identité et le pseudo viennent du jeton. */
  onJoin(client: TarotClient) {
    // Par sécurité : un client arrivé sans passer par `onAuth` n'a pas d'identité.
    const identity = client.auth;
    if (!identity) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "Authentification refusée : identité absente");
    }

    if ([...this.userIdBySession.values()].includes(identity.id)) {
      throw new ServerError(ALREADY_SEATED, "Vous êtes déjà assis à cette table");
    }

    const seat = this.freeSeat();
    this.userIdBySession.set(client.sessionId, identity.id);
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.seat = seat;
    // Pseudo de repli si le profil est illisible (Supabase injoignable) ou, sans profils
    // configurés, si `user_metadata` n'en donne pas (voir `resolvePlayerIdentity`).
    player.name = identity.name ?? `Joueur ${seat + 1}`;
    this.state.players.set(client.sessionId, player);

    // Le joueur voit les champs privés (`.view()`) de son propre état, et de personne d'autre.
    const view = new StateView();
    view.add(player);
    client.view = view;

    if (this.state.isPrivate) {
      // Le créateur de la table privée (premier arrivé) en est l'hôte ; il lance la partie.
      if (this.state.hostSeat === -1) this.state.hostSeat = seat;
      return;
    }
    if (this.state.players.size === this.state.playerCount) {
      void this.lock();
      this.startDeal(Math.floor(this.rng() * this.state.playerCount));
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
      this.userIdBySession.delete(client.sessionId);
      void this.unlock();
      // L'hôte part avant le début : le joueur restant au plus petit siège devient l'hôte.
      if (this.state.isPrivate && player.seat === this.state.hostSeat) {
        const seats = [...this.state.players.values()].map((p) => p.seat);
        this.state.hostSeat = seats.length > 0 ? Math.min(...seats) : -1;
      }
    } else {
      // Partie en cours : le siège reste occupé (abandon et remplacement : B17).
      player.connected = false;
    }
  }

  // ─── Actions des joueurs ────────────────────────────────────────────────

  private onBid(seat: number, raw: unknown) {
    const ctx = this.expectPhase("bidding");
    if (typeof raw !== "string" || !BIDS.includes(raw as Bid)) {
      throw new IllegalActionError("invalidBid", `Enchère inconnue : ${String(raw)}`);
    }
    const bid = raw as Bid;
    ctx.auction = placeBid(ctx.auction, seat, bid);
    this.state.bids.push(makeBid(seat, bid));
    this.state.currentSeat = ctx.auction.currentSeat ?? -1;

    const result = auctionResult(ctx.auction);
    if (result === null) return;
    if (result.kind === "redeal") {
      this.broadcast("redeal", { reason: "allPassed" });
      this.startDeal(this.nextDealer());
      return;
    }

    ctx.contract = result.contract;
    ctx.takerSeat = result.seat;
    this.state.contract = result.contract;
    this.state.takerSeat = result.seat;

    if (this.state.playerCount === 5) {
      this.setPhase("calling", result.seat);
    } else {
      this.afterKingCall(ctx);
    }
  }

  private onCallKing(seat: number, raw: unknown) {
    const ctx = this.expectPhase("calling");
    this.expectSeat(seat, ctx.takerSeat);
    const card = parseCard(raw);
    if (card.kind !== "suit") {
      throw new IllegalActionError("illegalCall", "Seule une carte de couleur peut être appelée");
    }
    ctx.kingCall = callKing({ hands: ctx.hands, dog: ctx.deal.dog }, ctx.takerSeat, card);
    this.state.calledCard = cardId(card);
    this.afterKingCall(ctx);
  }

  private onDiscard(seat: number, raw: unknown) {
    const ctx = this.expectPhase("discarding");
    this.expectSeat(seat, ctx.takerSeat);
    const { dogSize } = DEAL_CONFIGS[this.playerCount];
    const result = makeDiscard(ctx.hands[seat]!, parseCards(raw), dogSize);

    ctx.hands[seat] = result.hand;
    ctx.discard = result.discard;
    ctx.shownTrumps = result.shownTrumps;
    this.state.shownTrumps.push(...result.shownTrumps.map(cardId));
    this.syncHand(seat);
    this.startPlaying(ctx);
  }

  private onAnnounceSlam(seat: number) {
    const ctx = this.expectPhase("playing");
    const play = ctx.play!;
    if (play.completedTricks.length > 0 || play.currentTrick.length > 0) {
      throw new IllegalActionError("tooLate", "Le chelem se demande avant la première carte");
    }
    const announcement = validateSlamAnnouncement(seat, ctx.takerSeat, ctx.announcements);
    ctx.announcements.push(announcement);
    this.state.announcements.push(makeAnnouncement(announcement));
    // L'entame revient au preneur : on recommence le jeu de la carte (aucune carte jouée).
    this.startPlaying(ctx);
  }

  private onAnnounceHandful(seat: number, raw: unknown) {
    const ctx = this.expectPhase("playing");
    const play = ctx.play!;
    if (!canAnnounceHandful(play, seat, ctx.announcements)) {
      throw new IllegalActionError(
        "cannotAnnounceHandful",
        "La poignée s'annonce juste avant de jouer sa première carte",
      );
    }
    const announcement = validateHandful({
      playerCount: this.playerCount,
      seat,
      hand: play.hands[seat] ?? [],
      cards: parseCards(raw),
      discardedTrumps: seat === ctx.takerSeat ? ctx.shownTrumps : [],
    });
    ctx.announcements.push(announcement);
    this.state.announcements.push(makeAnnouncement(announcement));
  }

  private onPlay(seat: number, raw: unknown) {
    const ctx = this.expectPhase("playing");
    const card = parseCard(raw);
    const play = playCard(ctx.play!, seat, card);
    ctx.play = play;
    ctx.hands = play.hands.map((hand) => [...hand]);
    this.syncHand(seat);

    if (ctx.kingCall) {
      ctx.kingCall = revealOnPlay(ctx.kingCall, card);
      if (ctx.kingCall.revealed && ctx.kingCall.partnerSeat !== null) {
        this.state.partnerSeat = ctx.kingCall.partnerSeat;
      }
    }

    if (play.currentTrick.length > 0) {
      this.state.currentTrick.push(makePlayedCard(seat, card));
    } else {
      // Le pli vient d'être complété : on l'affiche comme « dernier pli ».
      const trick = play.completedTricks[play.completedTricks.length - 1]!;
      this.state.currentTrick.clear();
      this.state.lastTrick.clear();
      this.state.lastTrick.push(...trick.cards.map((c) => makePlayedCard(c.seat, c.card)));
      this.state.lastTrickWinner = trick.winner;
      this.state.tricksPlayed = play.completedTricks.length;
    }
    this.state.currentSeat = play.currentSeat ?? -1;

    if (isPlayFinished(play)) this.finishDeal(ctx);
  }

  /** Table privée : l'hôte choisit 3, 4 ou 5 joueurs tant que la partie n'a pas commencé. */
  private onSetPlayerCount(seat: number, raw: unknown) {
    this.expectHostBeforeStart(seat);
    if (!isPlayerCount(raw)) {
      throw new IllegalActionError(
        "invalidPlayerCount",
        `Nombre de joueurs invalide : ${String(raw)} (attendu : 3, 4 ou 5)`,
      );
    }
    const players = [...this.state.players.values()].sort((a, b) => a.seat - b.seat);
    if (players.length > raw) {
      throw new IllegalActionError(
        "tooManyPlayers",
        `${players.length} joueurs sont déjà assis : impossible de passer à ${raw}`,
      );
    }
    // Aucune carte distribuée : on peut renuméroter les sièges sans trou (0, 1, 2…),
    // pour qu'ils restent tous valides avec la nouvelle taille. L'hôte suit son siège.
    const hostSessionId = players.find((p) => p.seat === this.state.hostSeat)?.sessionId;
    players.forEach((player, index) => {
      player.seat = index;
      if (player.sessionId === hostSessionId) this.state.hostSeat = index;
    });

    this.state.playerCount = raw;
    this.maxClients = raw;
    // Une table pleine est verrouillée par Colyseus : on la rouvre s'il reste des places.
    if (players.length < raw) void this.unlock();
  }

  /** Table privée : l'hôte lance la partie, une fois tous les sièges occupés. */
  private onStart(seat: number) {
    this.expectHostBeforeStart(seat);
    if (this.state.players.size < this.state.playerCount) {
      throw new IllegalActionError(
        "tableNotFull",
        `La table attend encore ${this.state.playerCount - this.state.players.size} joueur(s)`,
      );
    }
    void this.lock();
    this.startDeal(Math.floor(this.rng() * this.state.playerCount));
  }

  private expectHostBeforeStart(seat: number) {
    if (!this.state.isPrivate) {
      throw new IllegalActionError("notPrivate", "Réservé aux tables privées");
    }
    if (this.phase !== "waiting") {
      throw new IllegalActionError("wrongPhase", "La partie a déjà commencé");
    }
    if (seat !== this.state.hostSeat) {
      throw new IllegalActionError("notHost", "Seul l'hôte de la table peut faire cela");
    }
  }

  private onReady(seat: number) {
    this.expectPhase("scoring");
    const player = this.playerAt(seat)!;
    player.ready = true;
    if ([...this.state.players.values()].every((p) => p.ready)) {
      this.startDeal(this.nextDealer());
    }
  }

  // ─── Enchaînement des phases ────────────────────────────────────────────

  /** Distribue une nouvelle donne. Petit sec : la donne est annulée et le joueur suivant redonne. */
  private startDeal(dealer: number) {
    const playerCount = this.playerCount;
    let deal = dealCards(playerCount, this.rng);
    let petitSec = seatsWithPetitSec(deal);
    while (petitSec.length > 0) {
      this.broadcast("redeal", { reason: "petitSec", seats: petitSec });
      dealer = (dealer + 1) % playerCount;
      deal = dealCards(playerCount, this.rng);
      petitSec = seatsWithPetitSec(deal);
    }

    this.ctx = {
      deal,
      hands: deal.hands.map((hand) => [...hand]),
      auction: startAuction(playerCount, dealer),
      contract: null,
      takerSeat: -1,
      kingCall: null,
      discard: [],
      shownTrumps: [],
      announcements: [],
      play: null,
    };

    const s = this.state;
    s.bids.clear();
    s.contract = "";
    s.takerSeat = -1;
    s.calledCard = "";
    s.partnerSeat = -1;
    s.dog.clear();
    s.shownTrumps.clear();
    s.announcements.clear();
    s.currentTrick.clear();
    s.lastTrick.clear();
    s.lastTrickWinner = -1;
    s.tricksPlayed = 0;
    s.result = undefined;
    for (const player of s.players.values()) player.ready = false;
    for (let seat = 0; seat < playerCount; seat++) this.syncHand(seat);

    s.dealer = dealer;
    s.dealNumber += 1;
    this.setPhase("bidding", this.ctx.auction.currentSeat ?? -1);
  }

  /** Après les enchères (et l'appel du roi à 5) : chien montré et écart, ou jeu direct. */
  private afterKingCall(ctx: DealContext) {
    const contract = ctx.contract!;
    if (!isDogRevealed(contract)) {
      this.startPlaying(ctx);
      return;
    }
    const dog = ctx.deal.dog;
    this.state.dog.push(...dog.map(cardId));
    if (ctx.kingCall) ctx.kingCall = revealOnDogShown(ctx.kingCall, dog);
    ctx.hands[ctx.takerSeat] = takeDog(contract, ctx.hands[ctx.takerSeat]!, dog);
    this.syncHand(ctx.takerSeat);
    this.setPhase("discarding", ctx.takerSeat);
  }

  private startPlaying(ctx: DealContext) {
    ctx.play = startPlay({
      hands: ctx.hands,
      attackers: ctx.kingCall ? attackerSeats(ctx.kingCall) : [ctx.takerSeat],
      firstLeader: firstLeader(this.playerCount, this.state.dealer, ctx.announcements),
      calledCard: ctx.kingCall?.calledCard ?? null,
    });
    this.setPhase("playing", ctx.play.currentSeat ?? -1);
  }

  private finishDeal(ctx: DealContext) {
    const score = scoreDeal({
      contract: ctx.contract!,
      play: ctx.play!,
      dog: ctx.deal.dog,
      discard: ctx.discard,
      announcements: ctx.announcements,
      playerCount: this.playerCount,
      takerSeat: ctx.takerSeat,
      partnerSeat: ctx.kingCall?.partnerSeat ?? null,
    });

    const result = new DealResultState();
    result.attackPoints = score.attackPoints;
    result.attackOudlers = score.attackOudlers;
    result.required = score.required;
    result.fulfilled = score.fulfilled;
    result.difference = score.difference;
    result.contractScore = score.score;
    result.handfulBonus = score.bonuses.handful;
    result.petitAuBoutBonus = score.bonuses.petitAuBout;
    result.slamBonus = score.bonuses.slam;
    result.total = score.total;
    result.playerScores.push(...score.playerScores);
    this.state.result = result;

    for (const player of this.state.players.values()) {
      player.score += score.playerScores[player.seat] ?? 0;
      player.ready = false;
    }
    // Fin de donne : les équipes sont connues de tous.
    this.state.partnerSeat = ctx.kingCall?.partnerSeat ?? -1;
    this.setPhase("scoring", -1);
  }

  // ─── Outils ─────────────────────────────────────────────────────────────

  /** Exécute une action ; une règle enfreinte est renvoyée au seul client fautif. */
  private handle(client: Client, action: (seat: number) => void) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    try {
      action(player.seat);
    } catch (error) {
      if (!(error instanceof IllegalActionError)) throw error;
      client.send("error", { code: error.code, message: error.message });
    }
  }

  private expectPhase(phase: Phase): DealContext {
    if (this.phase !== phase || this.ctx === null) {
      throw new IllegalActionError("wrongPhase", `Action impossible en phase ${this.phase}`);
    }
    return this.ctx;
  }

  private expectSeat(seat: number, expected: number) {
    if (seat !== expected) {
      throw new IllegalActionError("notYourTurn", `Ce n'est pas au siège ${seat} d'agir`);
    }
  }

  private setPhase(phase: Phase, currentSeat: number) {
    this.state.phase = phase;
    this.state.currentSeat = currentSeat;
  }

  private get phase(): Phase {
    return this.state.phase as Phase;
  }

  private get playerCount(): PlayerCount {
    return this.state.playerCount as PlayerCount;
  }

  private nextDealer(): number {
    return (this.state.dealer + 1) % this.playerCount;
  }

  /** Code aléatoire (crypto), unique parmi les tables ouvertes. */
  private async uniquePrivateCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = "";
      for (let i = 0; i < PRIVATE_CODE_LENGTH; i++) {
        code += PRIVATE_CODE_ALPHABET[Math.floor(this.rng() * PRIVATE_CODE_ALPHABET.length)];
      }
      if ((await matchMaker.query({ roomId: code })).length === 0) return code;
    }
    throw new Error("Impossible de générer un code de table privée unique");
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

  /** Recopie la main d'un siège (source de vérité : `ctx.hands`) dans le schéma. */
  private syncHand(seat: number) {
    const player = this.playerAt(seat);
    const hand = this.ctx?.hands[seat] ?? [];
    if (!player) return;
    player.hand.clear();
    player.hand.push(...hand.map(cardId));
    player.handSize = hand.length;
  }
}

/** Objet « simple » (littéral ou JSON analysé) : ni primitive, ni `null`, ni tableau, ni instance. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Champ d'un message client (non fiable : peut être n'importe quoi). */
function field(message: unknown, key: string): unknown {
  return typeof message === "object" && message !== null
    ? (message as Record<string, unknown>)[key]
    : undefined;
}

function parseCard(raw: unknown): Card {
  const card = parseCardId(raw);
  if (card === null) throw new IllegalActionError("invalidCard", `Carte inconnue : ${String(raw)}`);
  return card;
}

function parseCards(raw: unknown): Card[] {
  if (!Array.isArray(raw) || raw.length > 30) {
    throw new IllegalActionError("invalidCard", "Liste de cartes invalide");
  }
  return raw.map(parseCard);
}

function makeBid(seat: number, bid: Bid): BidState {
  const state = new BidState();
  state.seat = seat;
  state.bid = bid;
  return state;
}

function makePlayedCard(seat: number, card: Card): PlayedCardState {
  const state = new PlayedCardState();
  state.seat = seat;
  state.card = cardId(card);
  return state;
}

function makeAnnouncement(announcement: Announcement): AnnouncementState {
  const state = new AnnouncementState();
  state.seat = announcement.seat;
  state.kind = announcement.kind;
  if (announcement.kind === "handful") {
    state.level = announcement.level;
    state.cards.push(...announcement.cards.map(cardId));
  }
  return state;
}
