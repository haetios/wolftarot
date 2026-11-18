import { describe, expect, it } from "vitest";

import { cardId, createDeck } from "../../src/engine/cards.js";
import { cryptoRng, seededRng, shuffle } from "../../src/engine/random.js";

describe("seededRng", () => {
  it("produit la même suite pour la même graine", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = Array.from({ length: 10 }, a);
    const seqB = Array.from({ length: 10 }, b);
    expect(seqA).toEqual(seqB);
  });

  it("produit des suites différentes pour des graines différentes", () => {
    const seqA = Array.from({ length: 10 }, seededRng(1));
    const seqB = Array.from({ length: 10 }, seededRng(2));
    expect(seqA).not.toEqual(seqB);
  });

  it("reste dans [0, 1)", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("cryptoRng", () => {
  it("reste dans [0, 1)", () => {
    for (let i = 0; i < 1_000; i++) {
      const x = cryptoRng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  it("garde exactement les mêmes cartes", () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, seededRng(123));
    expect(shuffled).toHaveLength(78);
    expect(shuffled.map(cardId).sort()).toEqual(deck.map(cardId).sort());
  });

  it("ne modifie pas le tableau d'origine", () => {
    const deck = createDeck();
    const before = deck.map(cardId);
    shuffle(deck, seededRng(123));
    expect(deck.map(cardId)).toEqual(before);
  });

  it("est reproductible avec la même graine", () => {
    const deck = createDeck();
    expect(shuffle(deck, seededRng(99)).map(cardId)).toEqual(
      shuffle(deck, seededRng(99)).map(cardId),
    );
  });

  it("change l'ordre du paquet", () => {
    const deck = createDeck();
    expect(shuffle(deck, seededRng(99)).map(cardId)).not.toEqual(deck.map(cardId));
  });

  it("utilise le RNG crypto par défaut", () => {
    const shuffled = shuffle(createDeck());
    expect(shuffled).toHaveLength(78);
  });

  it("répartit les permutations de façon uniforme", () => {
    // 3 éléments → 6 permutations, chacune attendue ~1/6 du temps.
    // Graine fixe : le test est déterministe, donc jamais instable.
    const rng = seededRng(2024);
    const runs = 60_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < runs; i++) {
      const key = shuffle([1, 2, 3], rng).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(runs / 6 - 500);
      expect(count).toBeLessThan(runs / 6 + 500);
    }
  });

  it("gère les tableaux vides ou d'un seul élément", () => {
    expect(shuffle([], seededRng(1))).toEqual([]);
    expect(shuffle(["a"], seededRng(1))).toEqual(["a"]);
  });
});
