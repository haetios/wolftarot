import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * État synchronisé avec les clients.
 * Les cartes circulent sous forme d'identifiants (`hearts-14`, `trump-21`, `excuse`).
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
});
export type PlayerState = SchemaType<typeof PlayerState>;

export const PlayedCardState = schema({
  seat: t.uint8(),
  card: t.string(),
});
export type PlayedCardState = SchemaType<typeof PlayedCardState>;

/**
 * Phases d'une table. B11 : attente des joueurs, puis distribution et début des enchères.
 * Les phases suivantes (appel du roi, chien, jeu, fin de donne) arrivent en B12.
 */
export type Phase = "waiting" | "bidding";

export const TarotState = schema({
  phase: t.string().default("waiting"),
  playerCount: t.uint8().default(4),
  /** Siège du donneur, −1 avant la première donne. */
  dealer: t.int8().default(-1),
  /** Siège qui doit agir, −1 si personne. */
  currentSeat: t.int8().default(-1),
  /** Joueurs, par sessionId. */
  players: t.map(PlayerState),
  currentTrick: t.array(PlayedCardState),
});
export type TarotState = SchemaType<typeof TarotState>;
