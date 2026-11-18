import { describe, expect, it } from "vitest";

import { EXCUSE, KING, QUEEN, suitCard, trump, type Card } from "../../src/engine/cards.js";
import { trickWinner } from "../../src/engine/trick.js";

const h = (rank: number) => suitCard("hearts", rank as typeof KING);
const s = (rank: number) => suitCard("spades", rank as typeof KING);

/** Pli dont les cartes sont jouées par les sièges 0, 1, 2… */
const trick = (...cards: Card[]) => cards.map((card, seat) => ({ seat, card }));

describe("trickWinner", () => {
  it("la plus forte carte de la couleur demandée gagne", () => {
    expect(trickWinner(trick(h(3), h(QUEEN), h(KING), h(1)))).toBe(2);
  });

  it("une carte d'une autre couleur ne gagne jamais (défausse)", () => {
    expect(trickWinner(trick(h(3), s(KING), h(4)))).toBe(2);
  });

  it("un atout bat la couleur, le plus fort atout gagne", () => {
    expect(trickWinner(trick(h(KING), trump(2), trump(15), trump(9)))).toBe(2);
  });

  it("le Petit bat toute carte de couleur", () => {
    expect(trickWinner(trick(h(KING), trump(1), h(QUEEN)))).toBe(1);
  });

  it("à l'atout, le plus fort atout gagne", () => {
    expect(trickWinner(trick(trump(5), trump(21), trump(20)))).toBe(1);
  });

  it("l'Excuse ne gagne jamais un pli ordinaire", () => {
    expect(trickWinner(trick(EXCUSE, h(2), h(5)))).toBe(2);
    expect(trickWinner(trick(h(2), EXCUSE, s(KING)))).toBe(0);
  });

  it("l'Excuse gagne si `excuseWins` (chelem au dernier pli)", () => {
    expect(trickWinner(trick(EXCUSE, trump(21), h(KING)), true)).toBe(0);
  });

  it("refuse un pli vide", () => {
    expect(() => trickWinner([])).toThrow(RangeError);
  });
});
