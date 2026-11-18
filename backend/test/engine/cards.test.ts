import { describe, expect, it } from "vitest";

import {
  DECK_SIZE,
  EXCUSE,
  KING,
  KNIGHT,
  JACK,
  QUEEN,
  SUITS,
  TOTAL_POINTS,
  cardId,
  cardPoints,
  countPoints,
  createDeck,
  isOudler,
  parseCardId,
  suitCard,
  trump,
} from "../../src/engine/cards.js";

describe("parseCardId", () => {
  it("retrouve chaque carte du paquet à partir de son identifiant", () => {
    for (const card of createDeck()) {
      expect(parseCardId(cardId(card))).toEqual(card);
    }
  });

  it.each([
    "",
    "hearts",
    "hearts-0",
    "hearts-15",
    "trump-0",
    "trump-22",
    "trump-01",
    "Hearts-1",
    "excuse ",
    "stars-3",
    42,
    null,
    undefined,
    { kind: "excuse" },
  ])("refuse une valeur invalide (%o)", (value) => {
    expect(parseCardId(value)).toBeNull();
  });
});

describe("createDeck", () => {
  const deck = createDeck();

  it("contient 78 cartes", () => {
    expect(deck).toHaveLength(DECK_SIZE);
    expect(DECK_SIZE).toBe(78);
  });

  it("contient chaque carte une seule fois", () => {
    expect(new Set(deck.map(cardId)).size).toBe(78);
  });

  it("contient 14 cartes par couleur, 21 atouts et l'Excuse", () => {
    for (const suit of SUITS) {
      expect(deck.filter((c) => c.kind === "suit" && c.suit === suit)).toHaveLength(14);
    }
    expect(deck.filter((c) => c.kind === "trump")).toHaveLength(21);
    expect(deck.filter((c) => c.kind === "excuse")).toHaveLength(1);
  });

  it("renvoie un nouveau paquet à chaque appel", () => {
    expect(createDeck()).not.toBe(createDeck());
    expect(createDeck()).toEqual(createDeck());
  });
});

describe("cardId", () => {
  it("donne un identifiant lisible", () => {
    expect(cardId(suitCard("hearts", KING))).toBe("hearts-14");
    expect(cardId(trump(21))).toBe("trump-21");
    expect(cardId(EXCUSE)).toBe("excuse");
  });
});

describe("isOudler", () => {
  it("reconnaît exactement les trois bouts : le Petit, le 21 et l'Excuse", () => {
    const oudlers = createDeck().filter(isOudler).map(cardId);
    expect(oudlers.sort()).toEqual(["excuse", "trump-1", "trump-21"]);
  });

  it("ne considère pas les autres atouts ni les cartes de couleur comme des bouts", () => {
    expect(isOudler(trump(2))).toBe(false);
    expect(isOudler(trump(20))).toBe(false);
    expect(isOudler(suitCard("spades", 1))).toBe(false);
  });
});

describe("cardPoints", () => {
  it.each([
    ["Petit", trump(1), 4.5],
    ["21 d'atout", trump(21), 4.5],
    ["Excuse", EXCUSE, 4.5],
    ["Roi", suitCard("clubs", KING), 4.5],
    ["Dame", suitCard("clubs", QUEEN), 3.5],
    ["Cavalier", suitCard("clubs", KNIGHT), 2.5],
    ["Valet", suitCard("clubs", JACK), 1.5],
    ["10 de couleur", suitCard("clubs", 10), 0.5],
    ["As de couleur", suitCard("clubs", 1), 0.5],
    ["atout ordinaire", trump(15), 0.5],
  ] as const)("%s vaut %d", (_name, card, points) => {
    expect(cardPoints(card)).toBe(points);
  });

  it("le paquet complet vaut 91 points", () => {
    expect(countPoints(createDeck())).toBe(TOTAL_POINTS);
    expect(TOTAL_POINTS).toBe(91);
  });

  it("un ensemble vide vaut 0 point", () => {
    expect(countPoints([])).toBe(0);
  });
});
