import { describe, expect, it } from "vitest";

import {
  EXCUSE,
  JACK,
  KING,
  KNIGHT,
  QUEEN,
  SUITS,
  cardId,
  suitCard,
  trump,
  type Card,
} from "../../src/engine/cards.js";
import { dealCards, type Deal } from "../../src/engine/deal.js";
import { IllegalActionError } from "../../src/engine/errors.js";
import {
  attackerSeats,
  callKing,
  callableCards,
  revealOnPlay,
} from "../../src/engine/king-call.js";
import { seededRng } from "../../src/engine/random.js";

const allOfRank = (rank: number) => SUITS.map((suit) => suitCard(suit, rank as typeof KING));
const ids = (cards: readonly Card[]) => cards.map(cardId).sort();

/** Donne à 5 joueurs construite à la main (seules les cartes utiles au test). */
function deal5(hands: Card[][], dog: Card[] = []): Deal {
  return { hands, dog };
}

describe("callableCards", () => {
  it("sans les 4 Rois : les 4 Rois sont appelables", () => {
    const hand = [suitCard("hearts", KING), trump(3)];
    expect(ids(callableCards(hand))).toEqual(ids(allOfRank(KING)));
  });

  it("avec les 4 Rois : Rois et Dames", () => {
    const hand = [...allOfRank(KING), trump(3)];
    expect(ids(callableCards(hand))).toEqual(ids([...allOfRank(KING), ...allOfRank(QUEEN)]));
  });

  it("avec les 4 Rois et les 4 Dames : jusqu'aux Cavaliers", () => {
    const hand = [...allOfRank(KING), ...allOfRank(QUEEN)];
    expect(ids(callableCards(hand))).toEqual(
      ids([...allOfRank(KING), ...allOfRank(QUEEN), ...allOfRank(KNIGHT)]),
    );
  });

  it("avec tous les Rois, Dames et Cavaliers : jusqu'aux Valets, jamais plus bas", () => {
    const hand = [
      ...allOfRank(KING),
      ...allOfRank(QUEEN),
      ...allOfRank(KNIGHT),
      ...allOfRank(JACK),
    ];
    expect(callableCards(hand)).toHaveLength(16);
  });
});

describe("callKing", () => {
  const taker = [suitCard("spades", KING), trump(21), EXCUSE];
  const other = (card: Card): Card[] => [card, trump(2)];

  it("trouve le partenaire qui a le Roi appelé", () => {
    const deal = deal5([
      taker,
      other(suitCard("hearts", 5)),
      other(suitCard("hearts", KING)),
      other(trump(4)),
      other(trump(5)),
    ]);
    const call = callKing(deal, 0, suitCard("hearts", KING));
    expect(call).toMatchObject({ location: "partner", partnerSeat: 2, revealed: false });
    expect(attackerSeats(call)).toEqual([0, 2]);
  });

  it("le preneur peut s'appeler lui-même : il joue seul", () => {
    const deal = deal5([taker, [trump(5)], [trump(6)], [trump(7)], [trump(8)]]);
    const call = callKing(deal, 0, suitCard("spades", KING));
    expect(call).toMatchObject({ location: "taker", partnerSeat: null });
    expect(attackerSeats(call)).toEqual([0]);
  });

  it("si le Roi appelé est au chien, le preneur joue seul", () => {
    const deal = deal5(
      [taker, [trump(5)], [trump(6)], [trump(7)], [trump(8)]],
      [suitCard("clubs", KING)],
    );
    const call = callKing(deal, 0, suitCard("clubs", KING));
    expect(call).toMatchObject({ location: "dog", partnerSeat: null });
    expect(attackerSeats(call)).toEqual([0]);
  });

  it("refuse d'appeler une Dame sans avoir les 4 Rois", () => {
    const deal = deal5([taker, [], [], [], []]);
    expect(() => callKing(deal, 0, suitCard("hearts", QUEEN))).toThrow(IllegalActionError);
  });

  it("accepte une Dame quand le preneur a les 4 Rois", () => {
    const deal = deal5([allOfRank(KING), [suitCard("hearts", QUEEN)], [], [], []]);
    expect(callKing(deal, 0, suitCard("hearts", QUEEN)).partnerSeat).toBe(1);
  });

  it("refuse l'appel en dehors d'une partie à 5", () => {
    const deal = dealCards(4, seededRng(1));
    expect(() => callKing(deal, 0, suitCard("hearts", KING))).toThrow(/5 joueurs/);
  });

  it("refuse un siège de preneur invalide", () => {
    const deal = deal5([taker, [], [], [], []]);
    expect(() => callKing(deal, 7, suitCard("hearts", KING))).toThrow(RangeError);
  });

  it("fonctionne sur une vraie donne aléatoire", () => {
    const deal = dealCards(5, seededRng(3));
    const call = callKing(deal, 0, suitCard("diamonds", KING));
    const holder = [...deal.hands, deal.dog].findIndex((cards) =>
      cards.some((c) => cardId(c) === "diamonds-14"),
    );
    const expected = holder === 5 ? null : holder === 0 ? null : holder;
    expect(call.partnerSeat).toBe(expected);
  });
});

describe("revealOnPlay", () => {
  const deal = deal5([
    [suitCard("spades", 3)],
    [suitCard("hearts", KING)],
    [trump(3)],
    [trump(4)],
    [trump(5)],
  ]);
  const call = callKing(deal, 0, suitCard("hearts", KING));

  it("le partenaire reste caché tant que le Roi n'est pas joué", () => {
    const after = revealOnPlay(revealOnPlay(call, trump(3)), suitCard("hearts", 1));
    expect(after.revealed).toBe(false);
  });

  it("jouer le Roi appelé révèle le partenaire", () => {
    const after = revealOnPlay(call, suitCard("hearts", KING));
    expect(after.revealed).toBe(true);
    expect(after.partnerSeat).toBe(1);
  });

  it("ne modifie pas l'état précédent et reste révélé ensuite", () => {
    const revealed = revealOnPlay(call, suitCard("hearts", KING));
    expect(call.revealed).toBe(false);
    expect(revealOnPlay(revealed, trump(4)).revealed).toBe(true);
  });
});
