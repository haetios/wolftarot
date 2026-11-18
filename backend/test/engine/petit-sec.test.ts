import { describe, expect, it } from "vitest";

import { EXCUSE, KING, suitCard, trump, type Card } from "../../src/engine/cards.js";
import { dealCards, hasPetitSec, seatsWithPetitSec, type Deal } from "../../src/engine/deal.js";
import { seededRng } from "../../src/engine/random.js";

const plainCards: Card[] = [
  suitCard("hearts", KING),
  suitCard("hearts", 3),
  suitCard("spades", 7),
  suitCard("clubs", 1),
];

describe("hasPetitSec", () => {
  it("vrai si le Petit est le seul atout et qu'il n'y a pas l'Excuse", () => {
    expect(hasPetitSec([...plainCards, trump(1)])).toBe(true);
  });

  it("faux si le joueur a aussi l'Excuse", () => {
    expect(hasPetitSec([...plainCards, trump(1), EXCUSE])).toBe(false);
  });

  it("faux si le joueur a un autre atout", () => {
    expect(hasPetitSec([...plainCards, trump(1), trump(12)])).toBe(false);
  });

  it("faux si le joueur n'a pas le Petit", () => {
    expect(hasPetitSec([...plainCards, trump(5)])).toBe(false);
    expect(hasPetitSec(plainCards)).toBe(false);
  });
});

describe("seatsWithPetitSec", () => {
  it("renvoie les sièges concernés", () => {
    const deal: Deal = {
      hands: [plainCards, [...plainCards, trump(1)], [...plainCards, trump(2)]],
      dog: [],
    };
    expect(seatsWithPetitSec(deal)).toEqual([1]);
  });

  it("ignore le Petit sec au chien", () => {
    const deal: Deal = { hands: [plainCards, [trump(2)]], dog: [trump(1)] };
    expect(seatsWithPetitSec(deal)).toEqual([]);
  });

  it("renvoie une liste vide pour une donne ordinaire", () => {
    // Graine fixe : on cherche une donne sans Petit sec pour vérifier le cas courant.
    const rng = seededRng(5);
    let deal = dealCards(4, rng);
    while (seatsWithPetitSec(deal).length > 0) deal = dealCards(4, rng);
    expect(seatsWithPetitSec(deal)).toEqual([]);
  });

  it("se produit réellement sur des donnes aléatoires (cas rare mais possible)", () => {
    const rng = seededRng(1);
    let found = false;
    for (let i = 0; i < 20_000 && !found; i++) {
      found = seatsWithPetitSec(dealCards(5, rng)).length > 0;
    }
    expect(found).toBe(true);
  });
});
