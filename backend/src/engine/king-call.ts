import {
  JACK,
  KING,
  KNIGHT,
  QUEEN,
  SUITS,
  cardId,
  suitCard,
  type Card,
  type SuitCard,
} from "./cards.js";
import type { Deal } from "./deal.js";
import { IllegalActionError } from "./errors.js";

/** Rangs appelables, du plus haut au plus bas. */
const CALLABLE_RANKS = [KING, QUEEN, KNIGHT, JACK] as const;

/**
 * Cartes que le preneur peut appeler (à 5 joueurs), selon les règles FFT :
 * - il appelle un Roi, y compris un Roi qu'il possède (il joue alors seul) ;
 * - s'il possède les 4 Rois, il peut aussi appeler une Dame ;
 * - s'il possède aussi les 4 Dames, un Cavalier ; puis, de même, un Valet.
 */
export function callableCards(takerHand: readonly Card[]): SuitCard[] {
  const held = new Set(takerHand.map(cardId));
  const callable: SuitCard[] = [];
  for (const rank of CALLABLE_RANKS) {
    const cards = SUITS.map((suit) => suitCard(suit, rank));
    callable.push(...cards);
    const holdsAllFour = cards.every((card) => held.has(cardId(card)));
    if (!holdsAllFour) break;
  }
  return callable;
}

/**
 * Où se trouve la carte appelée :
 * - `partner` : dans la main d'un autre joueur, qui devient le partenaire du preneur ;
 * - `taker` : le preneur s'est appelé lui-même, il joue seul contre quatre ;
 * - `dog` : la carte est au chien, le preneur joue seul contre quatre.
 */
export type CalledCardLocation = "partner" | "taker" | "dog";

/**
 * Appel du roi. Connu en entier du serveur seulement : le partenaire reste caché
 * aux autres joueurs tant que `revealed` est faux.
 */
export type KingCall = {
  readonly takerSeat: number;
  readonly calledCard: SuitCard;
  readonly location: CalledCardLocation;
  /** Siège du partenaire, ou `null` si le preneur joue seul. */
  readonly partnerSeat: number | null;
  /** Vrai quand la carte appelée a été jouée : tout le monde connaît alors les équipes. */
  readonly revealed: boolean;
};

export function callKing(deal: Deal, takerSeat: number, calledCard: SuitCard): KingCall {
  if (deal.hands.length !== 5) {
    throw new IllegalActionError("noKingCall", "L'appel du roi ne se fait qu'à 5 joueurs");
  }
  const takerHand = deal.hands[takerSeat];
  if (takerHand === undefined) {
    throw new RangeError(`Siège du preneur invalide : ${takerSeat}`);
  }
  const id = cardId(calledCard);
  if (!callableCards(takerHand).some((card) => cardId(card) === id)) {
    throw new IllegalActionError("illegalCall", `Carte non appelable : ${id}`);
  }

  const holderSeat = deal.hands.findIndex((hand) => hand.some((card) => cardId(card) === id));
  const location: CalledCardLocation =
    holderSeat === -1 ? "dog" : holderSeat === takerSeat ? "taker" : "partner";

  return {
    takerSeat,
    calledCard,
    location,
    partnerSeat: location === "partner" ? holderSeat : null,
    revealed: false,
  };
}

/** À appeler pour chaque carte jouée : la carte appelée révèle le partenaire. */
export function revealOnPlay(call: KingCall, playedCard: Card): KingCall {
  if (call.revealed || cardId(playedCard) !== cardId(call.calledCard)) return call;
  return { ...call, revealed: true };
}

/**
 * À appeler quand le chien est montré (Petite, Garde) : si la carte appelée y est,
 * tout le monde sait que le preneur joue seul.
 */
export function revealOnDogShown(call: KingCall, dog: readonly Card[]): KingCall {
  const id = cardId(call.calledCard);
  if (call.revealed || !dog.some((card) => cardId(card) === id)) return call;
  return { ...call, revealed: true };
}

/** Sièges de l'attaque (preneur, plus le partenaire s'il y en a un). Information serveur. */
export function attackerSeats(call: KingCall): number[] {
  return call.partnerSeat === null ? [call.takerSeat] : [call.takerSeat, call.partnerSeat];
}
