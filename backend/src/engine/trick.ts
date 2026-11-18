import type { Card } from "./cards.js";
import { leadSuit } from "./legal-moves.js";

export type PlayedCard = { readonly seat: number; readonly card: Card };

/**
 * Gagnant d'un pli complet :
 * - le plus fort atout s'il y en a un ;
 * - sinon la plus forte carte de la couleur demandée ;
 * - l'Excuse ne remporte jamais le pli, sauf `excuseWins` (chelem, voir `play.ts`).
 */
export function trickWinner(trick: readonly PlayedCard[], excuseWins = false): number {
  if (trick.length === 0) throw new RangeError("Pli vide");

  if (excuseWins) {
    const excuse = trick.find(({ card }) => card.kind === "excuse");
    if (excuse) return excuse.seat;
  }

  const lead = leadSuit(trick.map(({ card }) => card));
  let best: PlayedCard | undefined;
  let bestScore = -1;
  for (const played of trick) {
    const { card } = played;
    // Les atouts battent toujours la couleur : on les classe au-dessus (100 + rang).
    const score =
      card.kind === "trump"
        ? 100 + card.rank
        : card.kind === "suit" && card.suit === lead
          ? card.rank
          : -1;
    if (score > bestScore) {
      best = played;
      bestScore = score;
    }
  }
  if (best === undefined) throw new RangeError("Pli sans carte gagnante");
  return best.seat;
}
