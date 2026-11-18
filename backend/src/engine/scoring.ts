import { HANDFUL_BONUS, type Announcement } from "./announcements.js";
import { cardId, countPoints, isOudler, type Card } from "./cards.js";
import type { Contract } from "./bidding.js";
import type { PlayerCount } from "./deal.js";
import { campCards, campOf, type Camp, type CampCards, type PlayState } from "./play.js";

/**
 * Comptage et marque d'une donne, d'après le règlement FFT (donnes libres) :
 * marque du contrat, puis primes de poignée, de petit au bout et de chelem.
 */

/** Points à réaliser par l'attaque selon le nombre de bouts dans ses plis (0, 1, 2 ou 3). */
export const REQUIRED_POINTS = [56, 51, 41, 36] as const;

/** Coefficient du contrat : Prise ×1, Garde ×2, Garde sans ×4, Garde contre ×6. */
export const CONTRACT_MULTIPLIERS: Readonly<Record<Contract, number>> = {
  small: 1,
  guard: 2,
  guardWithout: 4,
  guardAgainst: 6,
};

/** Valeur arbitraire de tout contrat, ajoutée à l'écart. */
export const CONTRACT_BASE = 25;

export function requiredPoints(oudlers: number): number {
  const required = REQUIRED_POINTS[oudlers];
  if (required === undefined) throw new RangeError(`Nombre de bouts invalide : ${oudlers}`);
  return required;
}

/**
 * Le demi-point va toujours au camp gagnant (règlement FFT) :
 * 40,5 avec 2 bouts → 40 (chute de 1) ; 41,5 avec 2 bouts → 42 (passe de 1).
 */
export function roundAttackPoints(points: number, required: number): number {
  if (Number.isInteger(points)) return points;
  return points > required ? Math.ceil(points) : Math.floor(points);
}

export type Tally = {
  readonly attackCards: Card[];
  readonly defenseCards: Card[];
  /** Points de l'attaque, avant arrondi (peut être un demi-point). */
  readonly attackPoints: number;
  readonly attackOudlers: number;
};

export type TallyInput = {
  readonly contract: Contract;
  readonly campCards: CampCards;
  /** Le chien de départ. */
  readonly dog: readonly Card[];
  /** L'écart du preneur (Petite et Garde), vide sinon. */
  readonly discard: readonly Card[];
};

/**
 * Cartes de chaque camp en fin de donne :
 * - Petite, Garde : l'écart compte pour l'attaque ;
 * - Garde sans : le chien compte pour l'attaque (bouts compris) ;
 * - Garde contre : le chien compte pour la défense.
 */
export function tally({ contract, campCards, dog, discard }: TallyInput): Tally {
  const attackCards = [...campCards.attack];
  const defenseCards = [...campCards.defense];
  if (contract === "small" || contract === "guard") attackCards.push(...discard);
  if (contract === "guardWithout") attackCards.push(...dog);
  if (contract === "guardAgainst") defenseCards.push(...dog);

  // Échange de l'Excuse impossible : le demi-point dû passe quand même à l'autre camp.
  const debt = campCards.unpaidExcuseDebt;
  const adjustment = debt === null ? 0 : debt.to === "attack" ? 0.5 : -0.5;

  return {
    attackCards,
    defenseCards,
    attackPoints: countPoints(attackCards) + adjustment,
    attackOudlers: attackCards.filter(isOudler).length,
  };
}

export type ContractOutcome = {
  readonly required: number;
  /** Points de l'attaque après arrondi du demi-point. */
  readonly points: number;
  readonly fulfilled: boolean;
  /** Points de gain ou de perte (toujours positif). */
  readonly difference: number;
  /**
   * Marque de base d'un défenseur, vue de l'attaque : (25 + écart) × coefficient,
   * positive si le contrat est rempli, négative s'il chute.
   */
  readonly score: number;
};

export function contractOutcome(
  attackPoints: number,
  attackOudlers: number,
  contract: Contract,
): ContractOutcome {
  const required = requiredPoints(attackOudlers);
  const points = roundAttackPoints(attackPoints, required);
  const fulfilled = points >= required;
  const difference = Math.abs(points - required);
  const value = (CONTRACT_BASE + difference) * CONTRACT_MULTIPLIERS[contract];
  return { required, points, fulfilled, difference, score: fulfilled ? value : -value };
}

export type Seats = {
  readonly playerCount: PlayerCount;
  readonly takerSeat: number;
  /** Partenaire à 5 joueurs, `null` si le preneur joue seul (ou à 3 et 4 joueurs). */
  readonly partnerSeat: number | null;
};

/**
 * Marque de chaque joueur, à partir de la marque d'un défenseur (vue de l'attaque) :
 * - chaque défenseur marque −score ;
 * - l'attaque marque le total opposé : à 5 joueurs avec partenaire, 2/3 pour le preneur
 *   et 1/3 pour le partenaire ; sinon tout pour le preneur.
 * La somme des marques est toujours nulle.
 */
export function distributeScore(score: number, seats: Seats): number[] {
  const { playerCount, takerSeat, partnerSeat } = seats;
  const attackers = partnerSeat === null ? [takerSeat] : [takerSeat, partnerSeat];
  const defenders = playerCount - attackers.length;
  const attackTotal = score * defenders;

  return Array.from({ length: playerCount }, (_, seat) => {
    if (seat === takerSeat) return partnerSeat === null ? attackTotal : (attackTotal * 2) / 3;
    if (seat === partnerSeat) return attackTotal / 3;
    return -score;
  });
}

/** Prime de petit au bout, avant multiplication par le coefficient du contrat. */
export const PETIT_AU_BOUT_BONUS = 10;

/** Primes de chelem (non multipliées). */
export const SLAM_BONUS = {
  /** Chelem annoncé et réalisé. */
  announcedAndMade: 400,
  /** Chelem non annoncé mais réalisé. */
  madeNotAnnounced: 200,
  /** Chelem annoncé mais non réalisé : déduit du total de l'attaque. */
  announcedNotMade: 200,
  /** Chelem infligé par la défense : prime pour chaque défenseur. */
  madeByDefense: 200,
} as const;

/** Camp qui a remporté tous les plis, ou `null`. */
export function slamCamp(play: PlayState): Camp | null {
  const camps = new Set(play.completedTricks.map((trick) => campOf(play, trick.winner)));
  if (camps.size !== 1) return null;
  return [...camps][0]!;
}

/**
 * Camp qui mène le Petit au bout, ou `null` : le camp qui remporte le dernier pli,
 * si ce pli contient le Petit. En cas de chelem où l'Excuse est jouée en dernier,
 * le Petit est considéré au bout s'il est joué à l'avant-dernier pli.
 */
export function petitAuBoutCamp(play: PlayState): Camp | null {
  const tricks = play.completedTricks;
  const last = tricks[tricks.length - 1];
  if (last === undefined) return null;

  const lead = last.cards[0];
  const excuseWonLastTrick = lead?.card.kind === "excuse" && last.winner === lead.seat;
  const boutTrick = excuseWonLastTrick ? tricks[tricks.length - 2] : last;
  if (boutTrick === undefined) return null;

  const hasPetit = boutTrick.cards.some(({ card }) => cardId(card) === "trump-1");
  return hasPetit ? campOf(play, boutTrick.winner) : null;
}

/** Primes vues de l'attaque, par défenseur (positives : la défense paie ; négatives : elle reçoit). */
export type Bonuses = {
  /** Poignées : la prime revient au camp qui gagne la donne, quel que soit l'annonceur. */
  readonly handful: number;
  /** Petit au bout : 10 × coefficient, au camp qui le mène, quel que soit le résultat. */
  readonly petitAuBout: number;
  readonly slam: number;
};

export type BonusInput = {
  readonly contract: Contract;
  readonly fulfilled: boolean;
  readonly announcements: readonly Announcement[];
  readonly play: PlayState;
};

export function computeBonuses({ contract, fulfilled, announcements, play }: BonusInput): Bonuses {
  const winnerSign = fulfilled ? 1 : -1;
  const handful = announcements.reduce(
    (total, a) => (a.kind === "handful" ? total + HANDFUL_BONUS[a.level] * winnerSign : total),
    0,
  );

  const petitCamp = petitAuBoutCamp(play);
  const petitValue = PETIT_AU_BOUT_BONUS * CONTRACT_MULTIPLIERS[contract];
  const petitAuBout =
    petitCamp === "attack" ? petitValue : petitCamp === "defense" ? -petitValue : 0;

  const announced = announcements.some((a) => a.kind === "slam");
  const made = slamCamp(play);
  let slam = 0;
  if (made === "attack") {
    slam += announced ? SLAM_BONUS.announcedAndMade : SLAM_BONUS.madeNotAnnounced;
  } else if (announced) {
    slam -= SLAM_BONUS.announcedNotMade;
  }
  if (made === "defense") slam -= SLAM_BONUS.madeByDefense;

  return { handful, petitAuBout, slam };
}

export type DealScore = Tally &
  ContractOutcome & {
    readonly bonuses: Bonuses;
    /** Marque d'un défenseur, vue de l'attaque, primes comprises. */
    readonly total: number;
    /** Marque de chaque joueur, par siège. */
    readonly playerScores: number[];
  };

export type ScoreDealInput = Seats & {
  readonly contract: Contract;
  /** Donne terminée. */
  readonly play: PlayState;
  readonly dog: readonly Card[];
  /** L'écart du preneur (Petite et Garde), vide sinon. */
  readonly discard: readonly Card[];
  readonly announcements: readonly Announcement[];
};

export function scoreDeal(input: ScoreDealInput): DealScore {
  const counted = tally({ ...input, campCards: campCards(input.play) });
  const outcome = contractOutcome(counted.attackPoints, counted.attackOudlers, input.contract);
  const bonuses = computeBonuses({ ...input, fulfilled: outcome.fulfilled });
  const total = outcome.score + bonuses.handful + bonuses.petitAuBout + bonuses.slam;
  return { ...counted, ...outcome, bonuses, total, playerScores: distributeScore(total, input) };
}
