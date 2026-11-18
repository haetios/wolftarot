import { describe, expect, it } from "vitest";

import {
  cardId,
  EXCUSE,
  KING,
  QUEEN,
  countPoints,
  suitCard,
  trump,
  type Card,
} from "../../src/engine/cards.js";
import type { Contract } from "../../src/engine/bidding.js";
import { PLAYER_COUNTS, dealCards } from "../../src/engine/deal.js";
import {
  campCards,
  isPlayFinished,
  legalCardsForCurrentPlayer,
  playCard,
  startPlay,
  type CampCards,
  type PlayState,
} from "../../src/engine/play.js";
import { seededRng } from "../../src/engine/random.js";
import {
  CONTRACT_MULTIPLIERS,
  contractOutcome,
  distributeScore,
  requiredPoints,
  roundAttackPoints,
  scoreDeal,
  tally,
} from "../../src/engine/scoring.js";

const h = (rank: number) => suitCard("hearts", rank as typeof KING);
const noDebt = { unpaidExcuseDebt: null };
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("requiredPoints", () => {
  it.each([
    [0, 56],
    [1, 51],
    [2, 41],
    [3, 36],
  ])("avec %i bout(s) : %i points", (oudlers, points) => {
    expect(requiredPoints(oudlers)).toBe(points);
  });

  it("refuse un nombre de bouts impossible", () => {
    expect(() => requiredPoints(4)).toThrow(RangeError);
  });
});

describe("CONTRACT_MULTIPLIERS", () => {
  it("Prise ×1, Garde ×2, Garde sans ×4, Garde contre ×6", () => {
    expect(CONTRACT_MULTIPLIERS).toEqual({ small: 1, guard: 2, guardWithout: 4, guardAgainst: 6 });
  });
});

describe("roundAttackPoints (exemples du règlement FFT)", () => {
  it("40,5 points avec 2 bouts : le demi-point va à la défense (40)", () => {
    expect(roundAttackPoints(40.5, 41)).toBe(40);
  });

  it("41,5 points avec 2 bouts : le demi-point va au preneur (42)", () => {
    expect(roundAttackPoints(41.5, 41)).toBe(42);
  });

  it("un nombre entier n'est pas modifié", () => {
    expect(roundAttackPoints(41, 41)).toBe(41);
  });
});

describe("contractOutcome (exemples du règlement FFT, hors primes)", () => {
  it("Garde, 49 points avec 2 bouts : passe de 8 → (25 + 8) × 2 = 66", () => {
    expect(contractOutcome(49, 2, "guard")).toEqual({
      required: 41,
      points: 49,
      fulfilled: true,
      difference: 8,
      score: 66,
    });
  });

  it("Garde sans gagnée de 4 → (25 + 4) × 4 = 116", () => {
    expect(contractOutcome(45, 2, "guardWithout").score).toBe(116);
  });

  it("Prise chutée de 7 → −(25 + 7) = −32", () => {
    expect(contractOutcome(34, 2, "small")).toMatchObject({ fulfilled: false, score: -32 });
  });

  it("Garde gagnée de 11 → (25 + 11) × 2 = 72", () => {
    expect(contractOutcome(52, 2, "guard").score).toBe(72);
  });

  it("Garde, 87 points avec 2 bouts (exemple du chelem) → (25 + 46) × 2 = 142", () => {
    expect(contractOutcome(87, 2, "guard").score).toBe(142);
  });

  it("contrat juste fait : gagné, 25 × coefficient", () => {
    expect(contractOutcome(56, 0, "guardAgainst")).toMatchObject({
      fulfilled: true,
      difference: 0,
      score: 150,
    });
  });

  it("le demi-point est arrondi avant le calcul de l'écart", () => {
    expect(contractOutcome(40.5, 2, "small")).toMatchObject({ points: 40, score: -26 });
    expect(contractOutcome(41.5, 2, "small")).toMatchObject({ points: 42, score: 26 });
  });
});

describe("distributeScore", () => {
  it("4 joueurs (exemple FFT) : chaque défenseur −106, le preneur +318", () => {
    expect(distributeScore(106, { playerCount: 4, takerSeat: 2, partnerSeat: null })).toEqual([
      -106, -106, 318, -106,
    ]);
  });

  it("4 joueurs, contrat chuté : chaque défenseur +42, le preneur −126", () => {
    expect(distributeScore(-42, { playerCount: 4, takerSeat: 0, partnerSeat: null })).toEqual([
      -126, 42, 42, 42,
    ]);
  });

  it("3 joueurs : le preneur marque deux fois la marque d'un défenseur", () => {
    expect(distributeScore(50, { playerCount: 3, takerSeat: 1, partnerSeat: null })).toEqual([
      -50, 100, -50,
    ]);
  });

  it("5 joueurs avec partenaire : 2/3 pour le preneur, 1/3 pour le partenaire", () => {
    expect(distributeScore(60, { playerCount: 5, takerSeat: 0, partnerSeat: 3 })).toEqual([
      120, -60, -60, 60, -60,
    ]);
  });

  it("5 joueurs, preneur seul : il encaisse tout (4 fois)", () => {
    expect(distributeScore(-30, { playerCount: 5, takerSeat: 4, partnerSeat: null })).toEqual([
      30, 30, 30, 30, -120,
    ]);
  });

  it("la somme des marques est toujours nulle", () => {
    for (const playerCount of PLAYER_COUNTS) {
      for (const score of [26, -26, 150, -582]) {
        const partnerSeat = playerCount === 5 ? 1 : null;
        expect(sum(distributeScore(score, { playerCount, takerSeat: 0, partnerSeat }))).toBe(0);
      }
    }
  });
});

describe("tally", () => {
  const camps: CampCards = {
    attack: [h(KING), h(2)],
    defense: [h(QUEEN), h(3)],
    ...noDebt,
  };
  const dog: Card[] = [trump(21), h(4)];
  const discard: Card[] = [h(5), h(6)];

  it.each<[Contract, string[], string[]]>([
    ["small", ["hearts-14", "hearts-2", "hearts-5", "hearts-6"], ["hearts-13", "hearts-3"]],
    ["guard", ["hearts-14", "hearts-2", "hearts-5", "hearts-6"], ["hearts-13", "hearts-3"]],
    ["guardWithout", ["hearts-14", "hearts-2", "trump-21", "hearts-4"], ["hearts-13", "hearts-3"]],
    ["guardAgainst", ["hearts-14", "hearts-2"], ["hearts-13", "hearts-3", "trump-21", "hearts-4"]],
  ])("%s : chien et écart vont au bon camp", (contract, attack, defense) => {
    const result = tally({
      contract,
      campCards: camps,
      dog,
      discard: contract === "small" || contract === "guard" ? discard : [],
    });
    expect(result.attackCards.map(cardId)).toEqual(attack);
    expect(result.defenseCards.map(cardId)).toEqual(defense);
  });

  it("en Garde sans, un bout au chien compte pour le preneur", () => {
    const result = tally({ contract: "guardWithout", campCards: camps, dog, discard: [] });
    expect(result.attackOudlers).toBe(1);
  });

  it("en Garde contre, un bout au chien compte pour la défense", () => {
    const result = tally({ contract: "guardAgainst", campCards: camps, dog, discard: [] });
    expect(result.attackOudlers).toBe(0);
  });

  it("échange de l'Excuse impossible : le demi-point passe quand même (l'Excuse vaut 4)", () => {
    const result = tally({
      contract: "guard",
      campCards: {
        attack: [h(KING), h(2)],
        defense: [EXCUSE],
        unpaidExcuseDebt: { from: "defense", to: "attack" },
      },
      dog: [],
      discard: [],
    });
    expect(result.attackPoints).toBe(4.5 + 0.5 + 0.5);
  });
});

describe("campCards : chelem subi par le camp de l'Excuse", () => {
  it("la défense garde l'Excuse mais doit le demi-point d'échange", () => {
    let state = startPlay({
      hands: [
        [h(KING), h(QUEEN)],
        [EXCUSE, h(2)],
        [h(3), h(4)],
      ],
      attackers: [0],
      firstLeader: 0,
    });
    for (const card of [h(KING), EXCUSE, h(3), h(QUEEN), h(2), h(4)]) {
      state = playCard(state, state.currentSeat!, card);
    }
    const camps = campCards(state);
    expect(camps.defense).toEqual([EXCUSE]);
    expect(camps.unpaidExcuseDebt).toEqual({ from: "defense", to: "attack" });
    // 4,5 + 3,5 + 3 × 0,5 = 9,5 en cartes, + 0,5 dû par la défense.
    expect(tally({ contract: "guard", campCards: camps, dog: [], discard: [] }).attackPoints).toBe(
      10,
    );
  });
});

describe("scoreDeal sur des donnes complètes aléatoires", () => {
  function playRandomly(state: PlayState, rng: () => number): PlayState {
    let st = state;
    while (!isPlayFinished(st)) {
      const legal = legalCardsForCurrentPlayer(st);
      st = playCard(st, st.currentSeat!, legal[Math.floor(rng() * legal.length)]!);
    }
    return st;
  }

  it.each(PLAYER_COUNTS)(
    "à %i joueurs : 91 points au total et marques de somme nulle",
    (players) => {
      const rng = seededRng(players * 7);
      const contracts: Contract[] = ["guardWithout", "guardAgainst"];
      for (let i = 0; i < 200; i++) {
        const deal = dealCards(players, rng);
        const takerSeat = i % players;
        // Partenaire à 5 joueurs une donne sur deux, preneur seul sinon.
        const partnerSeat = players === 5 && i % 2 === 0 ? (takerSeat + 1) % players : null;
        const attackers = partnerSeat === null ? [takerSeat] : [takerSeat, partnerSeat];
        // Garde sans / contre : pas d'écart à simuler, le chien est compté tel quel.
        const contract = contracts[i % 2]!;
        const state = playRandomly(
          startPlay({ hands: deal.hands, attackers, firstLeader: 0 }),
          rng,
        );

        const result = scoreDeal({
          contract,
          campCards: campCards(state),
          dog: deal.dog,
          discard: [],
          playerCount: players,
          takerSeat,
          partnerSeat,
        });

        const defensePoints = 91 - result.attackPoints;
        expect(result.attackPoints).toBeGreaterThanOrEqual(0);
        expect(countPoints(result.attackCards) + countPoints(result.defenseCards)).toBe(91);
        expect(defensePoints).toBeGreaterThanOrEqual(0);
        expect(sum(result.playerScores)).toBe(0);
        expect(Math.abs(result.score)).toBeGreaterThanOrEqual(25 * CONTRACT_MULTIPLIERS[contract]);
        expect(result.fulfilled).toBe(result.score > 0);
      }
    },
  );
});
