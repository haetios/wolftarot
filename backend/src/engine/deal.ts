import { DECK_SIZE, createDeck, type Card } from "./cards.js";
import { cryptoRng, shuffle, type Rng } from "./random.js";

export const PLAYER_COUNTS = [3, 4, 5] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];

export type DealConfig = {
  /** Nombre de cartes dans chaque main. */
  readonly handSize: number;
  /** Nombre de cartes au chien. */
  readonly dogSize: number;
};

/**
 * Règles FFT :
 * - 3 joueurs : 24 cartes chacun, chien de 6 ;
 * - 4 joueurs : 18 cartes chacun, chien de 6 ;
 * - 5 joueurs : 15 cartes chacun, chien de 3.
 */
export const DEAL_CONFIGS: Readonly<Record<PlayerCount, DealConfig>> = {
  3: { handSize: 24, dogSize: 6 },
  4: { handSize: 18, dogSize: 6 },
  5: { handSize: 15, dogSize: 3 },
};

export type Deal = {
  /** Une main par joueur, dans l'ordre des sièges. */
  readonly hands: Card[][];
  /** Le chien. */
  readonly dog: Card[];
};

export function isPlayerCount(value: unknown): value is PlayerCount {
  return PLAYER_COUNTS.includes(value as PlayerCount);
}

/**
 * Mélange un paquet complet et le distribue : une main par joueur, puis le chien.
 *
 * Le paquet est mélangé uniformément, donc découper le paquet en blocs donne la même
 * répartition que la distribution « 3 par 3 » d'une table réelle.
 */
export function dealCards(playerCount: PlayerCount, rng: Rng = cryptoRng): Deal {
  if (!isPlayerCount(playerCount)) {
    throw new RangeError(
      `Nombre de joueurs invalide : ${String(playerCount)} (attendu : 3, 4 ou 5)`,
    );
  }
  const { handSize, dogSize } = DEAL_CONFIGS[playerCount];
  const deck = shuffle(createDeck(), rng);

  const hands = Array.from({ length: playerCount }, (_, seat) =>
    deck.slice(seat * handSize, (seat + 1) * handSize),
  );
  const dog = deck.slice(playerCount * handSize, playerCount * handSize + dogSize);

  return { hands, dog };
}

/**
 * Petit sec : le Petit est le seul atout de la main, et le joueur n'a pas l'Excuse.
 * La donne est alors annulée et redistribuée.
 */
export function hasPetitSec(hand: readonly Card[]): boolean {
  const trumps = hand.filter((card) => card.kind === "trump");
  const hasExcuse = hand.some((card) => card.kind === "excuse");
  return trumps.length === 1 && trumps[0]!.rank === 1 && !hasExcuse;
}

/** Sièges ayant le Petit sec (vide si la donne est valable). Le chien n'est pas concerné. */
export function seatsWithPetitSec(deal: Deal): number[] {
  return deal.hands.flatMap((hand, seat) => (hasPetitSec(hand) ? [seat] : []));
}

/** Vérifie qu'une configuration couvre exactement le paquet (utile aux tests). */
export function configCoversDeck(playerCount: PlayerCount): boolean {
  const { handSize, dogSize } = DEAL_CONFIGS[playerCount];
  return playerCount * handSize + dogSize === DECK_SIZE;
}
