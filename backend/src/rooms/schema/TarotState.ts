import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * État synchronisé avec les clients.
 * Les cartes circulent sous forme d'identifiants (`hearts-14`, `trump-21`, `excuse`).
 * Ne figure ici que ce que les joueurs ont le droit de voir : l'écart du preneur et le
 * partenaire (tant que le Roi appelé n'est pas joué) restent connus du serveur seul.
 */

export const PlayerState = schema({
  sessionId: t.string(),
  /** Siège dans l'ordre de jeu (0 à joueurs − 1). */
  seat: t.uint8(),
  name: t.string(),
  connected: t.boolean().default(true),
  /** Nombre de cartes en main : public, pour que chacun voie la taille des mains adverses. */
  handSize: t.uint8().default(0),
  /** Main du joueur : envoyée uniquement à son propriétaire (voir `TarotRoom.onJoin`). */
  hand: t.array("string").view(),
  /** Score cumulé depuis le début de la table. */
  score: t.int32().default(0),
  /** Prêt pour la donne suivante (phase `scoring`). */
  ready: t.boolean().default(false),
});
export type PlayerState = SchemaType<typeof PlayerState>;

export const PlayedCardState = schema({
  seat: t.uint8(),
  card: t.string(),
});
export type PlayedCardState = SchemaType<typeof PlayedCardState>;

export const BidState = schema({
  seat: t.uint8(),
  /** `pass`, `small`, `guard`, `guardWithout` ou `guardAgainst`. */
  bid: t.string(),
});
export type BidState = SchemaType<typeof BidState>;

export const AnnouncementState = schema({
  seat: t.uint8(),
  /** `handful` ou `slam`. */
  kind: t.string(),
  /** Poignée : `single`, `double` ou `triple` ; vide pour le chelem. */
  level: t.string().default(""),
  /** Poignée : atouts montrés à tous. */
  cards: t.array("string"),
});
export type AnnouncementState = SchemaType<typeof AnnouncementState>;

/** Résultat de la dernière donne (phase `scoring`). */
export const DealResultState = schema({
  attackPoints: t.number(),
  attackOudlers: t.uint8(),
  required: t.uint8(),
  fulfilled: t.boolean(),
  difference: t.number(),
  /** Marque du contrat (vue de l'attaque, par défenseur), puis les primes. */
  contractScore: t.int32(),
  handfulBonus: t.int32(),
  petitAuBoutBonus: t.int32(),
  slamBonus: t.int32(),
  total: t.int32(),
  /** Marque de la donne pour chaque siège. */
  playerScores: t.array("int32"),
});
export type DealResultState = SchemaType<typeof DealResultState>;

/**
 * Phases d'une table :
 * `waiting` → `bidding` → `calling` (5 joueurs) → `discarding` (Petite, Garde) → `playing`
 * → `scoring` → nouvelle donne (`bidding`).
 */
export type Phase = "waiting" | "bidding" | "calling" | "discarding" | "playing" | "scoring";

export const TarotState = schema({
  phase: t.string().default("waiting"),
  playerCount: t.uint8().default(4),
  /** Numéro de la donne (1 pour la première). */
  dealNumber: t.uint16().default(0),
  /** Siège du donneur, −1 avant la première donne. */
  dealer: t.int8().default(-1),
  /** Siège qui doit agir, −1 si personne (ou tout le monde, en phase `scoring`). */
  currentSeat: t.int8().default(-1),
  /** Joueurs, par sessionId. */
  players: t.map(PlayerState),

  bids: t.array(BidState),
  /** Contrat du preneur, vide pendant les enchères. */
  contract: t.string().default(""),
  takerSeat: t.int8().default(-1),
  /** 5 joueurs : carte appelée par le preneur. */
  calledCard: t.string().default(""),
  /** 5 joueurs : partenaire, −1 tant qu'il n'est pas révélé (ou si le preneur joue seul). */
  partnerSeat: t.int8().default(-1),
  /** Chien montré à tous (Petite et Garde) ; vide sinon. */
  dog: t.array("string"),
  /** Atouts que le preneur a dû écarter : ils sont montrés. */
  shownTrumps: t.array("string"),
  announcements: t.array(AnnouncementState),

  currentTrick: t.array(PlayedCardState),
  /** Dernier pli complet, et son gagnant, pour l'affichage. */
  lastTrick: t.array(PlayedCardState),
  lastTrickWinner: t.int8().default(-1),
  tricksPlayed: t.uint8().default(0),

  /** Résultat de la donne, renseigné en phase `scoring`. */
  result: t.ref(DealResultState).optional(),
});
export type TarotState = SchemaType<typeof TarotState>;
