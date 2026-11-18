import { describe, expect, it } from "vitest";

import { EXCUSE, KING, QUEEN, cardId, suitCard, trump, type Card } from "../../src/engine/cards.js";
import { CONTRACTS } from "../../src/engine/bidding.js";
import { DEAL_CONFIGS, dealCards } from "../../src/engine/deal.js";
import {
  discardableCards,
  dogPointsOwner,
  isDogRevealed,
  makeDiscard,
  takeDog,
} from "../../src/engine/dog.js";
import { IllegalActionError } from "../../src/engine/errors.js";
import { callKing, revealOnDogShown } from "../../src/engine/king-call.js";
import { seededRng } from "../../src/engine/random.js";

const ids = (cards: readonly Card[]) => cards.map(cardId).sort();

/** Vérifie qu'une action lève une IllegalActionError avec le bon code. */
function expectIllegal(action: () => unknown, code: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(IllegalActionError);
    expect((error as IllegalActionError).code).toBe(code);
    return;
  }
  expect.fail(`Une IllegalActionError "${code}" était attendue`);
}

describe("isDogRevealed / dogPointsOwner", () => {
  it.each([
    ["small", true, "attack"],
    ["guard", true, "attack"],
    ["guardWithout", false, "attack"],
    ["guardAgainst", false, "defense"],
  ] as const)("%s : chien montré = %s, points pour %s", (contract, revealed, owner) => {
    expect(isDogRevealed(contract)).toBe(revealed);
    expect(dogPointsOwner(contract)).toBe(owner);
  });
});

describe("takeDog", () => {
  const hand = [suitCard("hearts", 2)];
  const dog = [suitCard("spades", 3), trump(5)];

  it("en Petite et en Garde, le preneur ajoute le chien à sa main", () => {
    expect(ids(takeDog("small", hand, dog))).toEqual(ids([...hand, ...dog]));
    expect(ids(takeDog("guard", hand, dog))).toEqual(ids([...hand, ...dog]));
  });

  it.each(["guardWithout", "guardAgainst"] as const)(
    "en %s, le chien n'est pas pris en main",
    (contract) => {
      expectIllegal(() => takeDog(contract, hand, dog), "dogNotTaken");
    },
  );

  it("tous les contrats sont couverts", () => {
    expect(CONTRACTS.filter(isDogRevealed)).toEqual(["small", "guard"]);
  });
});

describe("discardableCards", () => {
  it("exclut les Rois, les bouts et les atouts quand il y a assez de cartes de couleur", () => {
    const hand = [
      suitCard("hearts", KING),
      suitCard("hearts", QUEEN),
      suitCard("clubs", 4),
      trump(1),
      trump(21),
      EXCUSE,
      trump(10),
    ];
    expect(ids(discardableCards(hand, 2))).toEqual(
      ids([suitCard("hearts", QUEEN), suitCard("clubs", 4)]),
    );
  });

  it("autorise les atouts (hors bouts) s'il n'y a pas assez de cartes de couleur", () => {
    const hand = [suitCard("hearts", KING), suitCard("clubs", 4), trump(1), trump(10), trump(11)];
    expect(ids(discardableCards(hand, 3))).toEqual(
      ids([suitCard("clubs", 4), trump(10), trump(11)]),
    );
  });
});

describe("makeDiscard", () => {
  // Main de 18 + 6 cartes du chien à 4 joueurs, simplifiée : seules les cartes utiles.
  const hand: Card[] = [
    suitCard("hearts", KING),
    suitCard("hearts", 2),
    suitCard("hearts", 3),
    suitCard("clubs", 5),
    suitCard("clubs", QUEEN),
    trump(1),
    trump(8),
    trump(9),
    EXCUSE,
  ];

  it("retire les cartes écartées de la main", () => {
    const discard = [suitCard("hearts", 2), suitCard("clubs", 5)];
    const result = makeDiscard(hand, discard, 2);
    expect(ids(result.discard)).toEqual(ids(discard));
    expect(result.hand).toHaveLength(hand.length - 2);
    expect(ids(result.hand)).not.toContain("hearts-2");
    expect(result.shownTrumps).toEqual([]);
  });

  it("refuse un écart de la mauvaise taille", () => {
    expectIllegal(() => makeDiscard(hand, [suitCard("hearts", 2)], 2), "wrongDiscardSize");
  });

  it("refuse une carte absente de la main", () => {
    expectIllegal(
      () => makeDiscard(hand, [suitCard("hearts", 2), suitCard("spades", 7)], 2),
      "cardNotInHand",
    );
  });

  it("refuse la même carte deux fois", () => {
    expectIllegal(
      () => makeDiscard(hand, [suitCard("hearts", 2), suitCard("hearts", 2)], 2),
      "duplicateCard",
    );
  });

  it("refuse un Roi", () => {
    expectIllegal(
      () => makeDiscard(hand, [suitCard("hearts", KING), suitCard("hearts", 2)], 2),
      "kingInDiscard",
    );
  });

  it.each([trump(1), EXCUSE])("refuse un bout (%o)", (oudler) => {
    expectIllegal(() => makeDiscard(hand, [oudler, suitCard("hearts", 2)], 2), "oudlerInDiscard");
  });

  it("refuse un atout tant qu'il reste assez de cartes de couleur", () => {
    expectIllegal(() => makeDiscard(hand, [trump(8), suitCard("hearts", 2)], 2), "trumpInDiscard");
  });

  it("accepte des atouts en dernier recours, et les montre", () => {
    // 4 cartes de couleur écartables (hors Roi) pour un écart de 6 : 2 atouts obligatoires.
    const bigHand = [...hand, trump(12), trump(13)];
    const discard = [
      suitCard("hearts", 2),
      suitCard("hearts", 3),
      suitCard("clubs", 5),
      suitCard("clubs", QUEEN),
      trump(8),
      trump(9),
    ];
    const result = makeDiscard(bigHand, discard, 6);
    expect(ids(result.shownTrumps)).toEqual(ids([trump(8), trump(9)]));
  });

  it("refuse un atout de trop même en dernier recours", () => {
    const bigHand = [...hand, trump(12), trump(13)];
    const discard = [
      suitCard("hearts", 2),
      suitCard("hearts", 3),
      suitCard("clubs", 5),
      trump(8),
      trump(9),
      trump(12),
    ];
    expectIllegal(() => makeDiscard(bigHand, discard, 6), "trumpInDiscard");
  });

  it("fonctionne sur une vraie donne (4 joueurs, Garde)", () => {
    const deal = dealCards(4, seededRng(8));
    const { dogSize, handSize } = DEAL_CONFIGS[4];
    const withDog = takeDog("guard", deal.hands[0]!, deal.dog);
    const discard = discardableCards(withDog, dogSize).slice(0, dogSize);
    const result = makeDiscard(withDog, discard, dogSize);
    expect(result.hand).toHaveLength(handSize);
    expect(result.discard).toHaveLength(dogSize);
  });
});

describe("revealOnDogShown (5 joueurs)", () => {
  const hands: Card[][] = [[suitCard("spades", 3)], [trump(2)], [trump(3)], [trump(4)], [trump(5)]];

  it("révèle que le preneur est seul si le Roi appelé est dans le chien montré", () => {
    const dog = [suitCard("hearts", KING), trump(6), trump(7)];
    const call = callKing({ hands, dog }, 0, suitCard("hearts", KING));
    expect(revealOnDogShown(call, dog).revealed).toBe(true);
  });

  it("ne révèle rien si le Roi appelé n'est pas au chien", () => {
    const withKing = [...hands];
    withKing[1] = [suitCard("hearts", KING)];
    const dog = [trump(6), trump(7), trump(8)];
    const call = callKing({ hands: withKing, dog }, 0, suitCard("hearts", KING));
    expect(revealOnDogShown(call, dog).revealed).toBe(false);
  });
});
