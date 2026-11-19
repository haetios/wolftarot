import { StateView } from "@colyseus/schema";
import {
  CloseCode,
  ErrorCode,
  matchMaker,
  Room,
  ServerError,
  type AuthContext,
  type Client,
  type Delayed,
} from "colyseus";

import {
  canAnnounceHandful,
  firstLeader,
  validateHandful,
  validateSlamAnnouncement,
  type Announcement,
} from "../engine/announcements.js";
import { authenticate, authFailure } from "../auth/authenticate.js";
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
import { discardableCards, isDogRevealed, makeDiscard, takeDog } from "../engine/dog.js";
import { IllegalActionError } from "../engine/errors.js";
import {
  attackerSeats,
  callableCards,
  callKing,
  revealOnDogShown,
  revealOnPlay,
  type KingCall,
} from "../engine/king-call.js";
import {
  isPlayFinished,
  legalCardsForCurrentPlayer,
  playCard,
  startPlay,
  type PlayState,
} from "../engine/play.js";
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
  /**
   * Annonces secondaires (chelem, petit au bout), activées par défaut. Désactivées : on ne garde
   * que les annonces primaires (contrats et poignées). Choisi à la création de toute table ;
   * en partie libre, les joueurs ne sont regroupés qu'avec la même option.
   */
  secondaryAnnouncements?: boolean;
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

/** Le joueur a été retiré de la table (éjecté, ou siège abandonné) : il ne peut pas y revenir. */
export const SEAT_LOST = 4091;

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
  if (opts.secondaryAnnouncements === undefined) {
    // Valeur par défaut fixée avant la recherche de table, comme `playerCount` (filtre complet).
    opts.secondaryAnnouncements = true;
  } else if (typeof opts.secondaryAnnouncements !== "boolean") {
    throw new ServerError(
      ErrorCode.MATCHMAKE_INVALID_CRITERIA,
      "Option secondaryAnnouncements invalide : un booléen est attendu",
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

/** Délais de la table, fixés côté serveur (jamais par une option du client). */
export type TarotTiming = {
  /** Siège réservé à un joueur après une coupure, pour qu'il se reconnecte. */
  reconnectionSeconds: number;
  /** Temps laissé à un joueur pour chaque décision (enchère, appel, écart, carte). */
  turnSeconds: number;
  /**
   * Temps laissé en fin de donne pour se déclarer prêt. Passé ce délai, un joueur qui n'est pas
   * prêt est éjecté de la table (message `kicked`) et compté comme ayant abandonné : son siège
   * est joué automatiquement (puis par un bot, B18).
   */
  scoringSeconds: number;
  /** Délai avant de jouer à la place d'un joueur qui a abandonné (laisse voir le coup). */
  abandonedActionMs: number;
};

export const DEFAULT_TIMING: Readonly<TarotTiming> = {
  reconnectionSeconds: 60,
  turnSeconds: 60,
  scoringSeconds: 60,
  abandonedActionMs: 800,
};

/** Message envoyé au joueur éjecté juste avant la fermeture de sa connexion. */
export type KickedMessage = { reason: "notReady" };

/**
 * Source des donnes. Par défaut : distribution aléatoire (`dealCards`). Remplaçable par les
 * tests (donne construite à la main) et, plus tard, par les donnes préfaites de l'entraînement.
 */
export type DealSource = (playerCount: PlayerCount, rng: Rng) => Deal;
export const randomDeals: DealSource = (playerCount, rng) => dealCards(playerCount, rng);

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
  /** Minuteur de la décision en cours (voir `scheduleDeadline`). */
  private deadlineTimer: Delayed | null = null;
  /** Décision couverte par le minuteur en cours (voir `scheduleDeadline`). */
  private deadlineKey: string | null = null;
  /** Nombre d'actions réussies (humaines ou automatiques) : une nouvelle action = une nouvelle décision. */
  private actionCount = 0;

  /** Délais utilisés par les tables créées ensuite (modifiables par les tests). */
  static timing: TarotTiming = { ...DEFAULT_TIMING };
  /** Source des donnes des tables créées ensuite (remplacée par les tests). */
  static dealSource: DealSource = randomDeals;
  private readonly dealSource: DealSource = TarotRoom.dealSource;
  private readonly timing: TarotTiming = { ...TarotRoom.timing };

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
    // Tables privées, pour chaque joueur, avant le début : choisir sa place.
    chooseSeat: (client: Client, message: unknown) =>
      this.handle(client, (seat) => this.onChooseSeat(seat, field(message, "seat"))),
  };

  async onCreate(options: TarotRoomOptions = {}) {
    const playerCount = options.playerCount ?? DEFAULT_PLAYER_COUNT;
    if (!isPlayerCount(playerCount)) {
      throw new Error(`Nombre de joueurs invalide : ${String(playerCount)} (attendu : 3, 4 ou 5)`);
    }
    this.maxClients = playerCount;
    this.state.playerCount = playerCount;
    this.state.secondaryAnnouncements = options.secondaryAnnouncements !== false;

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
      throw authFailure(error);
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
    // Pseudo lu dans la table `profiles` (voir `resolvePlayerIdentity`).
    player.name = identity.name;
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
      this.scheduleDeadline();
    }
  }

  onDrop(client: Client, _code: CloseCode) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    // Un joueur éjecté ou qui a abandonné ne récupère pas son siège.
    if (player?.abandoned) return;
    // Non attendu : le framework appelle ensuite onReconnect() ou onLeave().
    // Le catch évite une promesse rejetée non gérée quand la room se ferme.
    // Si le délai expire, Colyseus appelle onLeave() : le joueur est alors considéré comme
    // ayant abandonné. S'il revient à temps, il retrouve son siège, son identité (`client.auth`)
    // et sa vue (sa main), que Colyseus recopie sur la nouvelle connexion.
    this.allowReconnection(client, this.timing.reconnectionSeconds).catch(() => {});
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player?.abandoned) {
      // Éjecté pendant sa coupure (fin de donne écoulée) : la reconnexion ouverte au moment de la
      // coupure ne lui rend pas son siège. Colyseus refuse alors la reconnexion avec cette erreur.
      throw new ServerError(SEAT_LOST, "Vous avez été retiré de cette table");
    }
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
      // Partie en cours : le siège reste occupé et sera joué automatiquement.
      player.connected = false;
      player.abandoned = true;
      if ([...this.state.players.values()].every((p) => p.abandoned)) {
        // Plus aucun joueur : inutile de jouer la partie toute seule.
        this.clearDeadline();
        void this.disconnect();
        return;
      }
      // Si c'était à lui d'agir, on n'attend pas la fin de son délai.
      this.scheduleDeadline();
    }
  }

  onDispose() {
    this.clearDeadline();
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
    if (!this.state.secondaryAnnouncements) {
      throw new IllegalActionError(
        "secondaryAnnouncementsDisabled",
        "Les annonces secondaires (chelem, petit au bout) sont désactivées à cette table",
      );
    }
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

  /**
   * Table privée : un joueur choisit sa place (siège libre) tant que la partie n'a pas commencé,
   * par exemple pour qu'une équipe s'entraîne avec des places fixes. L'hôte garde son rôle.
   */
  private onChooseSeat(seat: number, raw: unknown) {
    if (!this.state.isPrivate) {
      throw new IllegalActionError("notPrivate", "Réservé aux tables privées");
    }
    if (this.phase !== "waiting") {
      throw new IllegalActionError("wrongPhase", "La partie a déjà commencé");
    }
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw >= this.playerCount) {
      throw new IllegalActionError(
        "invalidSeat",
        `Place invalide : ${String(raw)} (attendu : 0 à ${this.playerCount - 1})`,
      );
    }
    if (raw === seat) return;
    if (this.playerAt(raw)) {
      throw new IllegalActionError("seatTaken", `La place ${raw} est déjà prise`);
    }
    this.playerAt(seat)!.seat = raw;
    if (this.state.hostSeat === seat) this.state.hostSeat = raw;
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
    if (player.ready) {
      // Refusé, pour qu'un « prêt » répété ne compte pas comme une action (voir scheduleDeadline).
      throw new IllegalActionError("alreadyReady", "Vous êtes déjà prêt");
    }
    player.ready = true;
    if ([...this.state.players.values()].every((p) => p.ready)) {
      this.startDeal(this.nextDealer());
    }
  }

  // ─── Enchaînement des phases ────────────────────────────────────────────

  /** Distribue une nouvelle donne. Petit sec : la donne est annulée et le joueur suivant redonne. */
  private startDeal(dealer: number) {
    const playerCount = this.playerCount;
    let deal = this.dealSource(playerCount, this.rng);
    let petitSec = seatsWithPetitSec(deal);
    while (petitSec.length > 0) {
      this.broadcast("redeal", { reason: "petitSec", seats: petitSec });
      dealer = (dealer + 1) % playerCount;
      deal = this.dealSource(playerCount, this.rng);
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
      // Sans annonces secondaires, pas de chelem : l'Excuse au dernier pli change toujours de camp.
      slamExcuseRule: this.state.secondaryAnnouncements,
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
      secondaryAnnouncements: this.state.secondaryAnnouncements,
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
      return;
    }
    this.actionCount++;
    this.scheduleDeadline();
  }

  // ─── Délais de jeu ──────────────────────────────────────────────────────

  private clearDeadline() {
    this.deadlineTimer?.clear();
    this.deadlineTimer = null;
    this.deadlineKey = null;
    this.state.turnDeadline = 0;
  }

  /**
   * Programme l'échéance de la décision en cours. À l'expiration, le serveur joue un coup
   * par défaut (`autoAct`). Un joueur qui a abandonné est joué après un court délai.
   *
   * L'échéance n'est reprogrammée que si la décision attendue a changé (nouvelle action, nouvelle
   * phase, nouvelle donne) ou si le délai doit raccourcir (le joueur attendu vient d'abandonner).
   * Sinon, rien ne la repousse : aucun message répété ne peut bloquer la table.
   */
  private scheduleDeadline() {
    if (this.ctx === null) {
      this.clearDeadline();
      return;
    }

    let delay: number;
    let key: string;
    let action: () => void;
    if (this.phase === "scoring") {
      const waiting = [...this.state.players.values()].filter((p) => !p.ready);
      if (waiting.length === 0) {
        this.clearDeadline();
        return;
      }
      const onlyAbandoned = waiting.every((p) => p.abandoned);
      delay = onlyAbandoned ? this.timing.abandonedActionMs : this.timing.scoringSeconds * 1000;
      // Une seule échéance pour toute la fin de donne : les « prêt » ne la repoussent pas.
      key = `scoring:${this.state.dealNumber}:${onlyAbandoned}`;
      action = () => {
        for (const player of waiting) {
          // Le dernier « prêt » lance la donne suivante : on s'arrête là.
          if (this.phase !== "scoring") break;
          if (player.ready) continue;
          if (!player.abandoned) this.ejectNotReady(player);
          this.onReady(player.seat);
        }
      };
    } else {
      const seat = this.state.currentSeat;
      const player = this.playerAt(seat);
      if (seat < 0 || !player) {
        this.clearDeadline();
        return;
      }
      delay = player.abandoned ? this.timing.abandonedActionMs : this.timing.turnSeconds * 1000;
      key = `${this.state.dealNumber}:${this.phase}:${seat}:${this.actionCount}:${player.abandoned}`;
      action = () => this.autoAct(seat);
    }

    if (key === this.deadlineKey && this.deadlineTimer !== null) return;
    this.clearDeadline();
    this.deadlineKey = key;
    this.state.turnDeadline = Date.now() + delay;
    this.deadlineTimer = this.clock.setTimeout(() => {
      this.deadlineTimer = null;
      this.deadlineKey = null;
      try {
        action();
      } catch (error) {
        // Un coup par défaut est toujours légal ; une erreur ici serait un bug du serveur.
        console.error("Coup automatique impossible :", error);
      }
      this.actionCount++;
      this.scheduleDeadline();
    }, delay);
  }

  /**
   * Fin de donne : le joueur ne s'est pas déclaré prêt à temps. Il est éjecté (fermeture
   * « consentie » : pas de reconnexion automatique) et son siège compte comme abandonné.
   */
  private ejectNotReady(player: PlayerState) {
    player.abandoned = true;
    player.connected = false;
    const client = this.clients.find((c) => c.sessionId === player.sessionId);
    if (!client) return;
    client.send("kicked", { reason: "notReady" } satisfies KickedMessage);
    client.leave(CloseCode.CONSENTED);
  }

  /** Coup par défaut, sûr et légal, joué à la place du siège qui devait agir. */
  private autoAct(seat: number) {
    const ctx = this.ctx;
    if (ctx === null || seat !== this.state.currentSeat) return;
    const hand = ctx.hands[seat] ?? [];
    switch (this.phase) {
      case "bidding":
        this.onBid(seat, "pass");
        break;
      case "calling":
        this.onCallKing(seat, cardId(callableCards(hand)[0]!));
        break;
      case "discarding": {
        const { dogSize } = DEAL_CONFIGS[this.playerCount];
        this.onDiscard(seat, discardableCards(hand, dogSize).slice(0, dogSize).map(cardId));
        break;
      }
      case "playing":
        this.onPlay(seat, cardId(legalCardsForCurrentPlayer(ctx.play!)[0]!));
        break;
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
