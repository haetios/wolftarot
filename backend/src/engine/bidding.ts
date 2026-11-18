import type { PlayerCount } from "./deal.js";
import { IllegalActionError } from "./errors.js";

/**
 * Contrats, du plus faible au plus fort :
 * - `small` : Petite (ou « Prise ») ;
 * - `guard` : Garde ;
 * - `guardWithout` : Garde sans (le chien) ;
 * - `guardAgainst` : Garde contre (le chien).
 */
export const CONTRACTS = ["small", "guard", "guardWithout", "guardAgainst"] as const;
export type Contract = (typeof CONTRACTS)[number];

export type Bid = Contract | "pass";

export type BidEntry = { readonly seat: number; readonly bid: Bid };

/**
 * État des enchères, immuable : chaque action renvoie un nouvel état.
 * Les sièges sont numérotés dans l'ordre de jeu : le joueur suivant est `(siège + 1) % joueurs`.
 */
export type AuctionState = {
  readonly playerCount: PlayerCount;
  readonly dealer: number;
  /** Siège qui doit parler, ou `null` si les enchères sont terminées. */
  readonly currentSeat: number | null;
  readonly history: readonly BidEntry[];
  /** Enchère la plus haute jusqu'ici. */
  readonly highest: { readonly seat: number; readonly contract: Contract } | null;
};

export type AuctionResult =
  | { readonly kind: "taker"; readonly seat: number; readonly contract: Contract }
  | { readonly kind: "redeal"; readonly reason: "allPassed" };

export function contractRank(contract: Contract): number {
  return CONTRACTS.indexOf(contract);
}

/** Le premier à parler est le joueur qui suit le donneur. */
export function startAuction(playerCount: PlayerCount, dealer: number): AuctionState {
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= playerCount) {
    throw new RangeError(`Donneur invalide : ${dealer}`);
  }
  return {
    playerCount,
    dealer,
    currentSeat: (dealer + 1) % playerCount,
    history: [],
    highest: null,
  };
}

/** Enchères autorisées pour le joueur qui doit parler : passer, ou un contrat strictement supérieur. */
export function legalBids(state: AuctionState): Bid[] {
  if (state.currentSeat === null) return [];
  const minRank = state.highest ? contractRank(state.highest.contract) + 1 : 0;
  return ["pass", ...CONTRACTS.slice(minRank)];
}

/**
 * Règles FFT appliquées :
 * - chaque joueur parle une seule fois, dans l'ordre ;
 * - il passe ou annonce un contrat supérieur au plus haut annoncé ;
 * - une Garde contre termine les enchères (personne ne peut monter plus haut).
 */
export function placeBid(state: AuctionState, seat: number, bid: Bid): AuctionState {
  if (state.currentSeat === null) {
    throw new IllegalActionError("auctionFinished", "Les enchères sont terminées");
  }
  if (seat !== state.currentSeat) {
    throw new IllegalActionError("notYourTurn", `Ce n'est pas au siège ${seat} de parler`);
  }
  if (!legalBids(state).includes(bid)) {
    throw new IllegalActionError("illegalBid", `Enchère interdite : ${bid}`);
  }

  const history = [...state.history, { seat, bid }];
  const highest = bid === "pass" ? state.highest : { seat, contract: bid };
  const everyoneSpoke = history.length === state.playerCount;
  const finished = everyoneSpoke || bid === "guardAgainst";

  return {
    ...state,
    history,
    highest,
    currentSeat: finished ? null : (seat + 1) % state.playerCount,
  };
}

/** Résultat des enchères, ou `null` tant qu'elles ne sont pas terminées. */
export function auctionResult(state: AuctionState): AuctionResult | null {
  if (state.currentSeat !== null) return null;
  if (state.highest === null) return { kind: "redeal", reason: "allPassed" };
  return { kind: "taker", seat: state.highest.seat, contract: state.highest.contract };
}
