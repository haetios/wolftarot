import { describe, expect, it } from "vitest";

import {
  EXCUSE,
  KING,
  QUEEN,
  cardId,
  createDeck,
  suitCard,
  trump,
  type Card,
} from "../../src/engine/cards.js";
import { dealCards } from "../../src/engine/deal.js";
import { IllegalActionError } from "../../src/engine/errors.js";
import {
  assertLegalPlay,
  getLegalCards,
  highestTrump,
  leadSuit,
} from "../../src/engine/legal-moves.js";
import { seededRng, shuffle } from "../../src/engine/random.js";

const ids = (cards: readonly Card[]) => cards.map(cardId).sort();

const h = (rank: number) => suitCard("hearts", rank as typeof KING);
const s = (rank: number) => suitCard("spades", rank as typeof KING);
const c = (rank: number) => suitCard("clubs", rank as typeof KING);

describe("leadSuit", () => {
  it("est null pour un pli vide ou ne contenant que l'Excuse", () => {
    expect(leadSuit([])).toBeNull();
    expect(leadSuit([EXCUSE])).toBeNull();
  });

  it("est fixée par la première carte qui n'est pas l'Excuse", () => {
    expect(leadSuit([h(3), trump(5)])).toBe("hearts");
    expect(leadSuit([EXCUSE, s(9)])).toBe("spades");
    expect(leadSuit([trump(2), h(3)])).toBe("trump");
  });
});

describe("highestTrump", () => {
  it("donne le plus fort atout joué, ou 0", () => {
    expect(highestTrump([h(3), h(10)])).toBe(0);
    expect(highestTrump([h(3), trump(7), trump(15), trump(9)])).toBe(15);
  });
});

describe("getLegalCards", () => {
  it("à l'entame, toutes les cartes sont jouables", () => {
    const hand = [h(1), s(KING), trump(4), EXCUSE];
    expect(ids(getLegalCards(hand, []))).toEqual(ids(hand));
  });

  describe("couleur demandée", () => {
    it("il faut fournir, sans obligation de monter (Excuse toujours permise)", () => {
      const hand = [h(2), h(QUEEN), s(5), trump(10), EXCUSE];
      expect(ids(getLegalCards(hand, [h(KING)]))).toEqual(ids([h(2), h(QUEEN), EXCUSE]));
    });

    it("sans la couleur, il faut couper", () => {
      const hand = [s(5), c(7), trump(3), trump(18)];
      expect(ids(getLegalCards(hand, [h(KING)]))).toEqual(ids([trump(3), trump(18)]));
    });

    it("si un atout a déjà coupé, il faut surcouper", () => {
      const hand = [s(5), trump(3), trump(12), trump(18)];
      expect(ids(getLegalCards(hand, [h(KING), trump(10)]))).toEqual(ids([trump(12), trump(18)]));
    });

    it("si on ne peut pas surcouper, il faut quand même couper (sous-couper)", () => {
      const hand = [s(5), trump(3), trump(4)];
      expect(ids(getLegalCards(hand, [h(KING), trump(10)]))).toEqual(ids([trump(3), trump(4)]));
    });

    it("sans la couleur ni atout, toute carte est jouable (pisser)", () => {
      const hand = [s(5), c(KING), EXCUSE];
      expect(ids(getLegalCards(hand, [h(KING), trump(10)]))).toEqual(ids(hand));
    });

    it("l'Excuse en entame : la carte suivante fixe la couleur", () => {
      const hand = [h(2), s(5), trump(10)];
      expect(ids(getLegalCards(hand, [EXCUSE]))).toEqual(ids(hand));
      expect(ids(getLegalCards(hand, [EXCUSE, s(KING)]))).toEqual(ids([s(5)]));
    });
  });

  describe("atout demandé", () => {
    it("il faut monter si possible", () => {
      const hand = [h(2), trump(5), trump(14), trump(20), EXCUSE];
      expect(ids(getLegalCards(hand, [trump(9), trump(12)]))).toEqual(
        ids([trump(14), trump(20), EXCUSE]),
      );
    });

    it("si on ne peut pas monter, n'importe quel atout", () => {
      const hand = [h(2), trump(5), trump(8)];
      expect(ids(getLegalCards(hand, [trump(12)]))).toEqual(ids([trump(5), trump(8)]));
    });

    it("sans atout, toute carte est jouable", () => {
      const hand = [h(2), s(QUEEN), EXCUSE];
      expect(ids(getLegalCards(hand, [trump(12)]))).toEqual(ids(hand));
    });

    it("après une entame du Petit, il faut monter comme pour tout atout", () => {
      const hand = [h(2), trump(2), trump(21)];
      expect(ids(getLegalCards(hand, [trump(1)]))).toEqual(ids([trump(2), trump(21)]));
    });
  });

  describe("l'Excuse", () => {
    it("est jouable dans tous les cas", () => {
      const hand = [h(2), trump(5), EXCUSE];
      for (const trick of [[], [h(KING)], [s(KING)], [trump(3)], [s(KING), trump(21)]]) {
        expect(ids(getLegalCards(hand, trick))).toContain("excuse");
      }
    });

    it("n'est jamais obligatoire quand on a une autre carte jouable", () => {
      const hand = [h(2), EXCUSE];
      expect(getLegalCards(hand, [h(KING)])).toHaveLength(2);
    });
  });

  describe("à 5 joueurs, entame du premier pli", () => {
    const called = h(KING);

    it("interdit d'entamer dans la couleur du Roi appelé", () => {
      const hand = [h(3), h(QUEEN), s(5), trump(7), EXCUSE];
      expect(ids(getLegalCards(hand, [], { calledCardOnFirstLead: called }))).toEqual(
        ids([s(5), trump(7), EXCUSE]),
      );
    });

    it("autorise d'entamer avec le Roi appelé lui-même", () => {
      const hand = [h(3), h(KING), s(5)];
      expect(ids(getLegalCards(hand, [], { calledCardOnFirstLead: called }))).toEqual(
        ids([h(KING), s(5)]),
      );
    });

    it("si la main n'a que la couleur appelée, tout reste jouable", () => {
      const hand = [h(3), h(4), EXCUSE];
      expect(ids(getLegalCards(hand, [], { calledCardOnFirstLead: called }))).toEqual(ids(hand));
    });

    it("ne s'applique pas une fois la couleur fixée", () => {
      const hand = [h(3), s(5)];
      expect(ids(getLegalCards(hand, [h(9)], { calledCardOnFirstLead: called }))).toEqual(
        ids([h(3)]),
      );
    });
  });

  it("propriétés sur des milliers de situations aléatoires", () => {
    // Les cartes légales sont toujours dans la main, jamais vides, et contiennent l'Excuse si on l'a.
    const rng = seededRng(77);
    for (let i = 0; i < 2_000; i++) {
      const deal = dealCards(4, rng);
      const hand = deal.hands[0]!;
      const trick = shuffle(createDeck(), rng)
        .filter((card) => !hand.some((x) => cardId(x) === cardId(card)))
        .slice(0, i % 4);
      const legal = getLegalCards(hand, trick);
      const handIds = new Set(hand.map(cardId));
      expect(legal.length).toBeGreaterThan(0);
      expect(legal.every((card) => handIds.has(cardId(card)))).toBe(true);
      if (handIds.has("excuse")) expect(legal.map(cardId)).toContain("excuse");
    }
  });
});

describe("assertLegalPlay", () => {
  const hand = [h(2), s(5), trump(10)];

  it("accepte une carte légale", () => {
    expect(() => assertLegalPlay(hand, [h(KING)], h(2))).not.toThrow();
  });

  it("refuse une carte interdite (code illegalCard)", () => {
    expect(() => assertLegalPlay(hand, [h(KING)], trump(10))).toThrow(IllegalActionError);
    expect(() => assertLegalPlay(hand, [h(KING)], trump(10))).toThrow(/interdite/);
  });

  it("refuse une carte absente de la main (code cardNotInHand)", () => {
    expect(() => assertLegalPlay(hand, [], c(QUEEN))).toThrow(/absente/);
  });
});
