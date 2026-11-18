import { cardId, type Card } from "./cards.js";
import type { PlayerCount } from "./deal.js";
import { IllegalActionError } from "./errors.js";
import type { PlayState } from "./play.js";

/**
 * Annonces formelles (hors contrat, géré par les enchères) : la poignée et le chelem.
 * Le petit au bout n'est pas une annonce : c'est une prime automatique (voir `scoring.ts`).
 */

/** Poignée simple, double ou triple. */
export const HANDFUL_LEVELS = ["single", "double", "triple"] as const;
export type HandfulLevel = (typeof HANDFUL_LEVELS)[number];

/**
 * Nombre exact d'atouts à montrer (règlement FFT) :
 * - 3 joueurs : 13, 15, 18 ;
 * - 4 joueurs : 10, 13, 15 ;
 * - 5 joueurs : 8, 10, 13.
 */
export const HANDFUL_SIZES: Readonly<Record<PlayerCount, Readonly<Record<HandfulLevel, number>>>> =
  {
    3: { single: 13, double: 15, triple: 18 },
    4: { single: 10, double: 13, triple: 15 },
    5: { single: 8, double: 10, triple: 13 },
  };

/** Prime de poignée, quel que soit le contrat ; elle revient au camp qui gagne la donne. */
export const HANDFUL_BONUS: Readonly<Record<HandfulLevel, number>> = {
  single: 20,
  double: 30,
  triple: 40,
};

export type HandfulAnnouncement = {
  readonly kind: "handful";
  readonly seat: number;
  readonly level: HandfulLevel;
  /** Atouts montrés à tous (l'Excuse peut en faire partie). */
  readonly cards: readonly Card[];
};

/** Chelem annoncé par le preneur. */
export type SlamAnnouncement = {
  readonly kind: "slam";
  readonly seat: number;
};

export type Announcement = HandfulAnnouncement | SlamAnnouncement;

/**
 * Le chelem est demandé par le preneur, après les enchères (et l'écart) et avant la première
 * carte de la donne. Une seule fois.
 */
export function validateSlamAnnouncement(
  seat: number,
  takerSeat: number,
  announcements: readonly Announcement[],
): SlamAnnouncement {
  if (seat !== takerSeat) {
    throw new IllegalActionError("notTaker", "Seul le preneur peut demander le chelem");
  }
  if (announcements.some((a) => a.kind === "slam")) {
    throw new IllegalActionError("slamAlreadyAnnounced", "Le chelem est déjà demandé");
  }
  return { kind: "slam", seat };
}

/**
 * Joueur qui entame le premier pli : celui qui suit le donneur, sauf si le chelem
 * est demandé (l'entame revient alors au preneur, quel que soit le donneur).
 */
export function firstLeader(
  playerCount: PlayerCount,
  dealer: number,
  announcements: readonly Announcement[],
): number {
  const slam = announcements.find((a) => a.kind === "slam");
  return slam !== undefined ? slam.seat : (dealer + 1) % playerCount;
}

/** Le niveau de poignée correspondant à un nombre de cartes montrées, ou `null`. */
export function handfulLevelForSize(playerCount: PlayerCount, size: number): HandfulLevel | null {
  const sizes = HANDFUL_SIZES[playerCount];
  return HANDFUL_LEVELS.find((level) => sizes[level] === size) ?? null;
}

/** Niveaux de poignée que ce joueur peut présenter, d'après ses atouts (Excuse comprise). */
export function availableHandfulLevels(
  playerCount: PlayerCount,
  hand: readonly Card[],
): HandfulLevel[] {
  const count = hand.filter((card) => card.kind === "trump" || card.kind === "excuse").length;
  return HANDFUL_LEVELS.filter((level) => HANDFUL_SIZES[playerCount][level] <= count);
}

/**
 * Moment autorisé : juste avant de jouer sa première carte, c'est-à-dire pendant le premier pli,
 * quand c'est son tour et qu'il n'a pas encore joué. Une seule poignée par joueur.
 */
export function canAnnounceHandful(
  state: PlayState,
  seat: number,
  announcements: readonly Announcement[],
): boolean {
  return (
    state.completedTricks.length === 0 &&
    state.currentSeat === seat &&
    !state.currentTrick.some((played) => played.seat === seat) &&
    !announcements.some((a) => a.kind === "handful" && a.seat === seat)
  );
}

export type HandfulInput = {
  readonly playerCount: PlayerCount;
  readonly seat: number;
  readonly hand: readonly Card[];
  readonly cards: readonly Card[];
  /**
   * Preneur uniquement : atouts qu'il a dû écarter. Le règlement impose de les remontrer
   * avec la poignée (cas du preneur à 4 Rois et 15 atouts).
   */
  readonly discardedTrumps?: readonly Card[];
};

/**
 * Valide une poignée et renvoie l'annonce. Règles FFT :
 * - uniquement des atouts (et éventuellement l'Excuse) que le joueur possède ;
 * - exactement 10, 13 ou 15 cartes à 4 joueurs (voir `HANDFUL_SIZES`) ;
 * - l'Excuse remplace un atout manquant : la montrer implique de n'avoir aucun autre atout,
 *   donc tous les atouts du joueur doivent alors être montrés.
 */
export function validateHandful(input: HandfulInput): HandfulAnnouncement {
  const { playerCount, seat, hand, cards, discardedTrumps = [] } = input;
  const pool = [...hand, ...discardedTrumps];
  const poolIds = new Set(pool.map(cardId));
  const ids = cards.map(cardId);

  if (new Set(ids).size !== ids.length) {
    throw new IllegalActionError("duplicateCard", "Une carte est montrée deux fois");
  }
  const notTrump = cards.find((card) => card.kind === "suit");
  if (notTrump !== undefined) {
    throw new IllegalActionError(
      "notTrump",
      `Une poignée ne contient que des atouts : ${cardId(notTrump)}`,
    );
  }
  const missing = ids.find((id) => !poolIds.has(id));
  if (missing !== undefined) {
    throw new IllegalActionError("cardNotInHand", `Carte absente de la main : ${missing}`);
  }

  const level = handfulLevelForSize(playerCount, cards.length);
  if (level === null) {
    const sizes = Object.values(HANDFUL_SIZES[playerCount]).join(", ");
    throw new IllegalActionError(
      "wrongHandfulSize",
      `Une poignée compte exactement ${sizes} atouts (reçu : ${cards.length})`,
    );
  }

  if (ids.includes("excuse")) {
    const shown = new Set(ids);
    const hidden = pool.find((card) => card.kind === "trump" && !shown.has(cardId(card)));
    if (hidden !== undefined) {
      throw new IllegalActionError(
        "excuseWithHiddenTrump",
        "L'Excuse ne peut remplacer un atout que si le joueur n'en a pas d'autre",
      );
    }
  }

  return { kind: "handful", seat, level, cards: [...cards] };
}
