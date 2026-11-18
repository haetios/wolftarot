import { describe, expect, it } from "vitest";

import { cardId, createDeck } from "../../src/engine/cards.js";
import {
  DEAL_CONFIGS,
  PLAYER_COUNTS,
  configCoversDeck,
  dealCards,
  isPlayerCount,
  type PlayerCount,
} from "../../src/engine/deal.js";
import { seededRng } from "../../src/engine/random.js";

describe("DEAL_CONFIGS", () => {
  it.each([
    [3, 24, 6],
    [4, 18, 6],
    [5, 15, 3],
  ] as const)("%i joueurs : %i cartes par main, chien de %i", (players, handSize, dogSize) => {
    expect(DEAL_CONFIGS[players]).toEqual({ handSize, dogSize });
  });

  it.each(PLAYER_COUNTS)("à %i joueurs, mains + chien = 78 cartes", (players) => {
    expect(configCoversDeck(players)).toBe(true);
  });
});

describe("dealCards", () => {
  const allCardIds = createDeck().map(cardId).sort();

  describe.each(PLAYER_COUNTS)("à %i joueurs", (players) => {
    const { handSize, dogSize } = DEAL_CONFIGS[players];
    const deal = dealCards(players, seededRng(players));

    it("donne une main par joueur, de la bonne taille", () => {
      expect(deal.hands).toHaveLength(players);
      for (const hand of deal.hands) {
        expect(hand).toHaveLength(handSize);
      }
    });

    it("met le bon nombre de cartes au chien", () => {
      expect(deal.dog).toHaveLength(dogSize);
    });

    it("distribue chaque carte du paquet une seule fois", () => {
      const dealt = [...deal.hands.flat(), ...deal.dog].map(cardId).sort();
      expect(dealt).toEqual(allCardIds);
    });
  });

  it("est reproductible avec la même graine", () => {
    expect(dealCards(4, seededRng(10))).toEqual(dealCards(4, seededRng(10)));
  });

  it("donne des mains différentes avec des graines différentes", () => {
    expect(dealCards(4, seededRng(10))).not.toEqual(dealCards(4, seededRng(11)));
  });

  it("fonctionne avec le RNG par défaut", () => {
    const deal = dealCards(5);
    expect(deal.hands).toHaveLength(5);
    expect(deal.dog).toHaveLength(3);
  });

  it("chaque siège reçoit en moyenne autant de bouts (pas de biais de distribution)", () => {
    // 3 bouts pour 78 cartes : à 4 joueurs, chaque main de 18 en reçoit 3 × 18/78 ≈ 0,69 en moyenne.
    const rng = seededRng(2024);
    const runs = 20_000;
    const oudlerIds = new Set(["trump-1", "trump-21", "excuse"]);
    const perSeat = [0, 0, 0, 0];
    let inDog = 0;
    for (let i = 0; i < runs; i++) {
      const deal = dealCards(4, rng);
      deal.hands.forEach((hand, seat) => {
        perSeat[seat]! += hand.filter((c) => oudlerIds.has(cardId(c))).length;
      });
      inDog += deal.dog.filter((c) => oudlerIds.has(cardId(c))).length;
    }
    for (const total of perSeat) {
      expect(total / runs).toBeCloseTo((3 * 18) / 78, 1);
    }
    expect(inDog / runs).toBeCloseTo((3 * 6) / 78, 1);
  });

  it.each([0, 2, 6, 4.5, Number.NaN])("refuse un nombre de joueurs invalide (%s)", (players) => {
    expect(() => dealCards(players as PlayerCount, seededRng(1))).toThrow(RangeError);
  });
});

describe("isPlayerCount", () => {
  it("accepte 3, 4 et 5 uniquement", () => {
    expect([3, 4, 5].every(isPlayerCount)).toBe(true);
    expect([2, 6, "4", null, undefined].some(isPlayerCount)).toBe(false);
  });
});
