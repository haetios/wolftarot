import { describe, expect, it } from "vitest";

import { EXCUSE, cardId, createDeck, suitCard, trump, type Card } from "../../src/engine/cards.js";
import {
  DEFAULT_HAND_ORDER,
  DEFAULT_SETTINGS,
  HAND_GROUPS,
  handGroup,
  isHandOrder,
  parseHandOrder,
  sortHand,
  type HandOrder,
} from "../../src/profiles/hand-order.js";

const ids = (cards: readonly Card[]) => cards.map(cardId);

describe("ordre de base de la main : modèle et validation", () => {
  it("l'ordre par défaut est valide", () => {
    expect(isHandOrder(DEFAULT_HAND_ORDER)).toBe(true);
    expect(DEFAULT_SETTINGS.handOrder).toBe(DEFAULT_HAND_ORDER);
    expect([...DEFAULT_HAND_ORDER.groups].sort()).toEqual([...HAND_GROUPS].sort());
  });

  it("accepte toute permutation des six familles, dans les deux sens", () => {
    const order = {
      groups: ["trumps", "hearts", "spades", "excuse", "diamonds", "clubs"],
      direction: "descending",
    };
    expect(parseHandOrder(order)).toEqual(order);
    // Copie : modifier la valeur reçue ne change pas le résultat.
    const parsed = parseHandOrder(order)!;
    order.groups[0] = "oops";
    expect(parsed.groups[0]).toBe("trumps");
  });

  it("accepte un JSON relu (comme une valeur venue de la base)", () => {
    expect(parseHandOrder(JSON.parse(JSON.stringify(DEFAULT_HAND_ORDER)))).toEqual(
      DEFAULT_HAND_ORDER,
    );
  });

  it("refuse les valeurs invalides", () => {
    const groups = [...DEFAULT_HAND_ORDER.groups];
    const invalid: unknown[] = [
      null,
      undefined,
      "ascending",
      42,
      [],
      groups,
      {},
      { groups },
      { direction: "ascending" },
      { groups, direction: "up" },
      { groups, direction: 1 },
      { groups, direction: "ascending", extra: true },
      { groups: groups.slice(0, 5), direction: "ascending" },
      { groups: [...groups, "trumps"], direction: "ascending" },
      { groups: [...groups.slice(0, 5), "spades"], direction: "ascending" },
      { groups: [...groups.slice(0, 5), "jokers"], direction: "ascending" },
      { groups: [...groups.slice(0, 5), null], direction: "ascending" },
      { groups: "spades,hearts,clubs,diamonds,trumps,excuse", direction: "ascending" },
    ];
    for (const value of invalid) {
      expect(parseHandOrder(value), JSON.stringify(value)).toBeNull();
      expect(isHandOrder(value)).toBe(false);
    }
  });
});

describe("ordre de base de la main : tri", () => {
  const hand: Card[] = [
    trump(21),
    suitCard("hearts", 14),
    EXCUSE,
    suitCard("spades", 1),
    trump(1),
    suitCard("diamonds", 7),
    suitCard("hearts", 2),
    suitCard("clubs", 12),
    trump(9),
    suitCard("spades", 11),
  ];

  it("ordre par défaut : ♠ ♥ ♣ ♦, atouts puis Excuse, valeurs croissantes", () => {
    expect(ids(sortHand(hand))).toEqual([
      "spades-1",
      "spades-11",
      "hearts-2",
      "hearts-14",
      "clubs-12",
      "diamonds-7",
      "trump-1",
      "trump-9",
      "trump-21",
      "excuse",
    ]);
  });

  it("atouts et Excuse en tête, valeurs décroissantes", () => {
    const order: HandOrder = {
      groups: ["excuse", "trumps", "hearts", "clubs", "diamonds", "spades"],
      direction: "descending",
    };
    expect(ids(sortHand(hand, order))).toEqual([
      "excuse",
      "trump-21",
      "trump-9",
      "trump-1",
      "hearts-14",
      "hearts-2",
      "clubs-12",
      "diamonds-7",
      "spades-11",
      "spades-1",
    ]);
  });

  it("atouts entre deux couleurs, Excuse à l'autre bout", () => {
    const order: HandOrder = {
      groups: ["excuse", "diamonds", "spades", "trumps", "hearts", "clubs"],
      direction: "ascending",
    };
    expect(ids(sortHand(hand, order)).join(" ")).toBe(
      "excuse diamonds-7 spades-1 spades-11 trump-1 trump-9 trump-21 hearts-2 hearts-14 clubs-12",
    );
  });

  it("ne modifie pas la main reçue", () => {
    const copy = [...hand];
    sortHand(hand);
    expect(hand).toEqual(copy);
  });

  it("le paquet entier se range famille par famille, dans l'ordre choisi", () => {
    const deck = createDeck();
    for (const order of [
      DEFAULT_HAND_ORDER,
      { groups: [...HAND_GROUPS].reverse(), direction: "descending" } as HandOrder,
    ]) {
      const sorted = sortHand(deck, order);
      expect(sorted).toHaveLength(78);
      // Les familles apparaissent en blocs, dans l'ordre de `groups`.
      const blocks = sorted.map(handGroup).filter((group, i, all) => group !== all[i - 1]);
      expect(blocks).toEqual(order.groups);
      // Dans chaque famille, les valeurs suivent le sens choisi.
      const trumps = sorted.filter((card) => card.kind === "trump").map((card) => card.rank);
      const expected = Array.from({ length: 21 }, (_, i) => i + 1);
      expect(trumps).toEqual(order.direction === "ascending" ? expected : expected.reverse());
    }
  });
});
