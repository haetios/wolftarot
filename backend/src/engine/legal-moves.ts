import { cardId, type Card, type Suit, type SuitCard } from "./cards.js";
import { IllegalActionError } from "./errors.js";

/** Couleur demandée dans un pli : une couleur, l'atout, ou `null` si rien ne l'a encore fixée. */
export type LeadSuit = Suit | "trump" | null;

/**
 * La couleur demandée est fixée par la première carte qui n'est pas l'Excuse.
 * (Si l'entame est l'Excuse, c'est la carte suivante qui fixe la couleur.)
 */
export function leadSuit(trick: readonly Card[]): LeadSuit {
  const first = trick.find((card) => card.kind !== "excuse");
  if (first === undefined) return null;
  return first.kind === "trump" ? "trump" : first.suit;
}

/** Plus fort atout déjà joué dans le pli (0 s'il n'y en a pas). */
export function highestTrump(trick: readonly Card[]): number {
  return trick.reduce((max, card) => (card.kind === "trump" ? Math.max(max, card.rank) : max), 0);
}

export type LegalMoveOptions = {
  /**
   * À 5 joueurs, pour l'entame du premier pli uniquement : la carte appelée.
   * On ne peut pas entamer dans sa couleur, sauf en jouant la carte appelée elle-même.
   */
  readonly calledCardOnFirstLead?: SuitCard;
};

/** Atouts de la main ; s'il faut monter et que c'est possible, seulement les atouts plus forts. */
function trumpsToPlay(hand: readonly Card[], trick: readonly Card[]): Card[] {
  const trumps = hand.filter((card) => card.kind === "trump");
  const toBeat = highestTrump(trick);
  const higher = trumps.filter((card) => card.kind === "trump" && card.rank > toBeat);
  return higher.length > 0 ? higher : trumps;
}

/**
 * Cartes que le joueur peut jouer, selon les règles FFT :
 * - l'Excuse est toujours jouable, jamais obligatoire ;
 * - à l'entame, toute carte est jouable ;
 * - couleur demandée : il faut fournir (sans obligation de monter) ;
 * - sinon il faut couper, et surcouper si possible (sinon sous-couper) ;
 * - atout demandé : il faut monter si possible, sinon jouer un atout quelconque ;
 * - sans carte de la couleur ni atout : toute carte est jouable.
 */
export function getLegalCards(
  hand: readonly Card[],
  trick: readonly Card[],
  options: LegalMoveOptions = {},
): Card[] {
  const excuse = hand.filter((card) => card.kind === "excuse");
  const lead = leadSuit(trick);

  if (lead === null) {
    const called = options.calledCardOnFirstLead;
    if (called === undefined) return [...hand];
    const allowed = hand.filter(
      (card) =>
        card.kind !== "suit" || card.suit !== called.suit || cardId(card) === cardId(called),
    );
    // Main entièrement dans la couleur appelée : pas d'autre choix possible.
    return allowed.some((card) => card.kind !== "excuse") ? allowed : [...hand];
  }

  if (lead !== "trump") {
    const followers = hand.filter((card) => card.kind === "suit" && card.suit === lead);
    if (followers.length > 0) return [...followers, ...excuse];
  }

  const trumps = trumpsToPlay(hand, trick);
  if (trumps.length > 0) return [...trumps, ...excuse];

  return [...hand];
}

/** Vérifie qu'une carte peut être jouée ; lève une `IllegalActionError` sinon. */
export function assertLegalPlay(
  hand: readonly Card[],
  trick: readonly Card[],
  card: Card,
  options: LegalMoveOptions = {},
): void {
  const id = cardId(card);
  if (!hand.some((c) => cardId(c) === id)) {
    throw new IllegalActionError("cardNotInHand", `Carte absente de la main : ${id}`);
  }
  if (!getLegalCards(hand, trick, options).some((c) => cardId(c) === id)) {
    throw new IllegalActionError("illegalCard", `Carte interdite dans ce pli : ${id}`);
  }
}
