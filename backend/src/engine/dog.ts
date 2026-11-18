import { KING, cardId, isOudler, type Card } from "./cards.js";
import type { Contract } from "./bidding.js";
import { IllegalActionError } from "./errors.js";

/**
 * Le chien est montré à tous puis pris par le preneur en Petite et en Garde.
 * En Garde sans et Garde contre, personne ne le voit et le preneur ne le prend pas.
 */
export function isDogRevealed(contract: Contract): boolean {
  return contract === "small" || contract === "guard";
}

/**
 * Camp qui comptera les points du chien en fin de donne :
 * - Petite, Garde : l'écart du preneur compte pour l'attaque ;
 * - Garde sans : le chien compte pour l'attaque ;
 * - Garde contre : le chien compte pour la défense.
 */
export function dogPointsOwner(contract: Contract): "attack" | "defense" {
  return contract === "guardAgainst" ? "defense" : "attack";
}

/** Le preneur ajoute le chien à sa main (Petite et Garde uniquement). */
export function takeDog(
  contract: Contract,
  takerHand: readonly Card[],
  dog: readonly Card[],
): Card[] {
  if (!isDogRevealed(contract)) {
    throw new IllegalActionError(
      "dogNotTaken",
      "En Garde sans ou Garde contre, le chien n'est pas pris",
    );
  }
  return [...takerHand, ...dog];
}

const isKing = (card: Card) => card.kind === "suit" && card.rank === KING;

/** Cartes de couleur autres que les Rois : elles peuvent toujours être écartées. */
function plainCards(hand: readonly Card[]): Card[] {
  return hand.filter((card) => card.kind === "suit" && !isKing(card));
}

/**
 * Cartes que le preneur peut mettre à l'écart :
 * - jamais un Roi ni un bout (le Petit, le 21, l'Excuse) ;
 * - des atouts seulement en dernier recours, s'il n'a pas assez d'autres cartes.
 */
export function discardableCards(hand: readonly Card[], discardSize: number): Card[] {
  const plain = plainCards(hand);
  if (plain.length >= discardSize) return plain;
  const trumps = hand.filter((card) => card.kind === "trump" && !isOudler(card));
  return [...plain, ...trumps];
}

export type DiscardResult = {
  /** Main du preneur après l'écart. */
  readonly hand: Card[];
  /** Cartes écartées (cachées, comptées pour l'attaque en fin de donne). */
  readonly discard: Card[];
  /** Atouts écartés : ils doivent être montrés aux autres joueurs. */
  readonly shownTrumps: Card[];
};

/**
 * Valide et applique l'écart. `hand` est la main du preneur après avoir pris le chien ;
 * il écarte autant de cartes qu'il y en avait au chien.
 */
export function makeDiscard(
  hand: readonly Card[],
  discard: readonly Card[],
  discardSize: number,
): DiscardResult {
  if (discard.length !== discardSize) {
    throw new IllegalActionError(
      "wrongDiscardSize",
      `L'écart doit compter ${discardSize} cartes (reçu : ${discard.length})`,
    );
  }

  const discardIds = discard.map(cardId);
  if (new Set(discardIds).size !== discardIds.length) {
    throw new IllegalActionError("duplicateCard", "Une carte est écartée deux fois");
  }
  const handIds = new Set(hand.map(cardId));
  const missing = discardIds.find((id) => !handIds.has(id));
  if (missing !== undefined) {
    throw new IllegalActionError("cardNotInHand", `Carte absente de la main : ${missing}`);
  }

  for (const card of discard) {
    if (isKing(card)) {
      throw new IllegalActionError("kingInDiscard", "Un Roi ne peut pas être écarté");
    }
    if (isOudler(card)) {
      throw new IllegalActionError("oudlerInDiscard", "Un bout ne peut pas être écarté");
    }
  }

  const shownTrumps = discard.filter((card) => card.kind === "trump");
  const maxTrumps = Math.max(0, discardSize - plainCards(hand).length);
  if (shownTrumps.length > maxTrumps) {
    throw new IllegalActionError(
      "trumpInDiscard",
      "Un atout ne peut être écarté que si le preneur n'a pas assez d'autres cartes",
    );
  }

  const discarded = new Set(discardIds);
  return {
    hand: hand.filter((card) => !discarded.has(cardId(card))),
    discard: [...discard],
    shownTrumps,
  };
}
