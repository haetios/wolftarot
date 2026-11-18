import { describe, expect, it } from "vitest";

import {
  EXCUSE,
  KING,
  suitCard,
  trump,
  type Card,
  type TrumpRank,
} from "../../src/engine/cards.js";
import {
  HANDFUL_BONUS,
  HANDFUL_SIZES,
  availableHandfulLevels,
  canAnnounceHandful,
  handfulLevelForSize,
  validateHandful,
  type Announcement,
} from "../../src/engine/announcements.js";
import { IllegalActionError } from "../../src/engine/errors.js";
import { playCard, startPlay } from "../../src/engine/play.js";

/** Les atouts de `from` à `to` inclus. */
const trumps = (from: number, to: number): Card[] =>
  Array.from({ length: to - from + 1 }, (_, i) => trump((from + i) as TrumpRank));

const h = (rank: number) => suitCard("hearts", rank as typeof KING);

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

describe("seuils et primes (règlement FFT)", () => {
  it("seuils de poignée selon le nombre de joueurs", () => {
    expect(HANDFUL_SIZES).toEqual({
      3: { single: 13, double: 15, triple: 18 },
      4: { single: 10, double: 13, triple: 15 },
      5: { single: 8, double: 10, triple: 13 },
    });
  });

  it("primes : 20, 30, 40", () => {
    expect(HANDFUL_BONUS).toEqual({ single: 20, double: 30, triple: 40 });
  });

  it("handfulLevelForSize retrouve le niveau, ou null", () => {
    expect(handfulLevelForSize(4, 10)).toBe("single");
    expect(handfulLevelForSize(4, 13)).toBe("double");
    expect(handfulLevelForSize(4, 15)).toBe("triple");
    expect(handfulLevelForSize(4, 11)).toBeNull();
    expect(handfulLevelForSize(5, 8)).toBe("single");
    expect(handfulLevelForSize(3, 18)).toBe("triple");
  });
});

describe("availableHandfulLevels", () => {
  it("dépend du nombre d'atouts (Excuse comprise)", () => {
    expect(availableHandfulLevels(4, trumps(1, 9))).toEqual([]);
    expect(availableHandfulLevels(4, [...trumps(1, 9), EXCUSE])).toEqual(["single"]);
    expect(availableHandfulLevels(4, trumps(1, 14))).toEqual(["single", "double"]);
    expect(availableHandfulLevels(4, trumps(1, 15))).toEqual(["single", "double", "triple"]);
    expect(availableHandfulLevels(5, trumps(1, 8))).toEqual(["single"]);
  });
});

describe("validateHandful", () => {
  it("accepte une poignée simple à 4 joueurs (10 atouts)", () => {
    const hand = [...trumps(1, 10), h(KING)];
    expect(validateHandful({ playerCount: 4, seat: 2, hand, cards: trumps(1, 10) })).toEqual({
      kind: "handful",
      seat: 2,
      level: "single",
      cards: trumps(1, 10),
    });
  });

  it("avec 11 ou 12 atouts, le joueur en cache et montre exactement 10", () => {
    const hand = trumps(1, 12);
    expect(validateHandful({ playerCount: 4, seat: 0, hand, cards: trumps(3, 12) }).level).toBe(
      "single",
    );
    expectIllegal(
      () => validateHandful({ playerCount: 4, seat: 0, hand, cards: trumps(1, 11) }),
      "wrongHandfulSize",
    );
  });

  it("accepte les poignées double et triple", () => {
    expect(
      validateHandful({ playerCount: 4, seat: 0, hand: trumps(1, 13), cards: trumps(1, 13) }).level,
    ).toBe("double");
    expect(
      validateHandful({ playerCount: 4, seat: 0, hand: trumps(1, 15), cards: trumps(1, 15) }).level,
    ).toBe("triple");
  });

  it("applique les seuils à 3 et 5 joueurs", () => {
    expect(
      validateHandful({ playerCount: 3, seat: 0, hand: trumps(1, 13), cards: trumps(1, 13) }).level,
    ).toBe("single");
    expect(
      validateHandful({ playerCount: 5, seat: 0, hand: trumps(1, 8), cards: trumps(1, 8) }).level,
    ).toBe("single");
    expectIllegal(
      () => validateHandful({ playerCount: 3, seat: 0, hand: trumps(1, 10), cards: trumps(1, 10) }),
      "wrongHandfulSize",
    );
  });

  it("l'Excuse peut remplacer un atout manquant si le joueur n'a pas d'autre atout", () => {
    const hand = [...trumps(1, 9), EXCUSE];
    expect(validateHandful({ playerCount: 4, seat: 0, hand, cards: hand }).level).toBe("single");
  });

  it("refuse l'Excuse si le joueur cache un atout", () => {
    const hand = [...trumps(1, 10), EXCUSE];
    expectIllegal(
      () => validateHandful({ playerCount: 4, seat: 0, hand, cards: [...trumps(1, 9), EXCUSE] }),
      "excuseWithHiddenTrump",
    );
  });

  it("refuse une carte de couleur", () => {
    const hand = [...trumps(1, 9), h(2)];
    expectIllegal(
      () => validateHandful({ playerCount: 4, seat: 0, hand, cards: hand }),
      "notTrump",
    );
  });

  it("refuse un atout que le joueur n'a pas", () => {
    expectIllegal(
      () => validateHandful({ playerCount: 4, seat: 0, hand: trumps(1, 10), cards: trumps(2, 11) }),
      "cardNotInHand",
    );
  });

  it("refuse le même atout deux fois", () => {
    const cards = [...trumps(1, 9), trump(1)];
    expectIllegal(
      () => validateHandful({ playerCount: 4, seat: 0, hand: trumps(1, 10), cards }),
      "duplicateCard",
    );
  });

  it("le preneur peut remontrer les atouts écartés (4 Rois et 15 atouts)", () => {
    const hand = trumps(1, 14);
    const discardedTrumps = [trump(15)];
    expect(
      validateHandful({ playerCount: 4, seat: 0, hand, cards: trumps(1, 15), discardedTrumps })
        .level,
    ).toBe("triple");
  });
});

describe("canAnnounceHandful", () => {
  const state = startPlay({
    hands: [
      [h(2), h(3)],
      [h(4), h(5)],
      [h(6), h(7)],
    ],
    attackers: [0],
    firstLeader: 0,
  });

  it("autorisée au joueur dont c'est le tour, avant sa première carte", () => {
    expect(canAnnounceHandful(state, 0, [])).toBe(true);
  });

  it("refusée hors de son tour", () => {
    expect(canAnnounceHandful(state, 1, [])).toBe(false);
  });

  it("autorisée au joueur suivant pendant le premier pli, refusée à celui qui a joué", () => {
    const after = playCard(state, 0, h(2));
    expect(canAnnounceHandful(after, 1, [])).toBe(true);
    expect(canAnnounceHandful(after, 0, [])).toBe(false);
  });

  it("refusée après le premier pli", () => {
    let st = state;
    for (const card of [h(2), h(4), h(6)]) st = playCard(st, st.currentSeat!, card);
    expect(canAnnounceHandful(st, st.currentSeat!, [])).toBe(false);
  });

  it("une seule poignée par joueur", () => {
    const announced: Announcement[] = [
      { kind: "handful", seat: 0, level: "single", cards: trumps(1, 10) },
    ];
    expect(canAnnounceHandful(state, 0, announced)).toBe(false);
  });
});
