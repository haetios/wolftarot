import { countPoints, isOudler, type Card } from "./cards.js";
import type { Contract } from "./bidding.js";
import type { PlayerCount } from "./deal.js";
import type { CampCards } from "./play.js";

/**
 * Comptage et marque d'une donne, d'après le règlement FFT (donnes libres).
 * Les primes (poignée, petit au bout, chelem) viendront en B9/B10.
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

export type DealScore = Tally &
  ContractOutcome & {
    /** Marque de chaque joueur, par siège. */
    readonly playerScores: number[];
  };

export function scoreDeal(input: TallyInput & Seats): DealScore {
  const counted = tally(input);
  const outcome = contractOutcome(counted.attackPoints, counted.attackOudlers, input.contract);
  return { ...counted, ...outcome, playerScores: distributeScore(outcome.score, input) };
}
