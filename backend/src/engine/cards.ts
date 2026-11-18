/**
 * Cartes du Tarot français : 56 cartes de couleur, 21 atouts et l'Excuse (78 cartes).
 * Logique pure, sans dépendance à Colyseus.
 */

/** Les quatre couleurs : pique, cœur, carreau, trèfle. */
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** Valeur d'une carte de couleur : 1 à 10, puis Valet (11), Cavalier (12), Dame (13), Roi (14). */
export type SuitRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export const JACK = 11;
export const KNIGHT = 12;
export const QUEEN = 13;
export const KING = 14;

/** Numéro d'un atout : 1 (le Petit) à 21. */
export type TrumpRank =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;

export type SuitCard = { readonly kind: "suit"; readonly suit: Suit; readonly rank: SuitRank };
export type TrumpCard = { readonly kind: "trump"; readonly rank: TrumpRank };
export type ExcuseCard = { readonly kind: "excuse" };
export type Card = SuitCard | TrumpCard | ExcuseCard;

export const DECK_SIZE = 78;
/** Total des points du paquet. */
export const TOTAL_POINTS = 91;

export function suitCard(suit: Suit, rank: SuitRank): SuitCard {
  return { kind: "suit", suit, rank };
}

export function trump(rank: TrumpRank): TrumpCard {
  return { kind: "trump", rank };
}

export const EXCUSE: ExcuseCard = { kind: "excuse" };

/** Identifiant stable et lisible : `hearts-14`, `trump-21`, `excuse`. */
export function cardId(card: Card): string {
  switch (card.kind) {
    case "suit":
      return `${card.suit}-${card.rank}`;
    case "trump":
      return `trump-${card.rank}`;
    case "excuse":
      return "excuse";
  }
}

/** Les trois bouts (oudlers) : le Petit (atout 1), le 21 d'atout et l'Excuse. */
export function isOudler(card: Card): boolean {
  return card.kind === "excuse" || (card.kind === "trump" && (card.rank === 1 || card.rank === 21));
}

/**
 * Points d'une carte :
 * bouts 4,5 · Roi 4,5 · Dame 3,5 · Cavalier 2,5 · Valet 1,5 · toute autre carte 0,5.
 */
export function cardPoints(card: Card): number {
  if (isOudler(card)) return 4.5;
  if (card.kind === "suit") {
    switch (card.rank) {
      case KING:
        return 4.5;
      case QUEEN:
        return 3.5;
      case KNIGHT:
        return 2.5;
      case JACK:
        return 1.5;
    }
  }
  return 0.5;
}

/** Somme des points d'un ensemble de cartes. */
export function countPoints(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + cardPoints(card), 0);
}

/** Paquet complet de 78 cartes, dans un ordre fixe (couleurs, puis atouts, puis l'Excuse). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= KING; rank++) {
      deck.push(suitCard(suit, rank as SuitRank));
    }
  }
  for (let rank = 1; rank <= 21; rank++) {
    deck.push(trump(rank as TrumpRank));
  }
  deck.push(EXCUSE);
  return deck;
}
