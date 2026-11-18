import { describe, expect, it } from "vitest";

import {
  firstLeader,
  validateSlamAnnouncement,
  type Announcement,
} from "../../src/engine/announcements.js";
import { EXCUSE, KING, suitCard, trump, type Card } from "../../src/engine/cards.js";
import type { Contract } from "../../src/engine/bidding.js";
import { IllegalActionError } from "../../src/engine/errors.js";
import { playCard, startPlay, type PlayState } from "../../src/engine/play.js";
import {
  computeBonuses,
  contractOutcome,
  distributeScore,
  petitAuBoutCamp,
  scoreDeal,
  slamCamp,
} from "../../src/engine/scoring.js";

const h = (rank: number) => suitCard("hearts", rank as typeof KING);

/**
 * Donne terminée construite à la main : seuls comptent les plis (cartes et gagnant)
 * et les sièges de l'attaque.
 */
function finishedPlay(
  attackers: number[],
  tricks: { cards: [number, Card][]; winner: number }[],
): PlayState {
  return {
    hands: [],
    attackers,
    calledCard: null,
    currentTrick: [],
    currentSeat: null,
    completedTricks: tricks.map(({ cards, winner }) => ({
      cards: cards.map(([seat, card]) => ({ seat, card })),
      winner,
    })),
  };
}

/** Plis ordinaires gagnés par `winner`, sans Petit ni Excuse. */
const plainTricks = (count: number, winner: number) =>
  Array.from({ length: count }, () => ({ cards: [[winner, h(2)]] as [number, Card][], winner }));

/** Marque totale d'un défenseur, vue de l'attaque (contrat + primes). */
function total(
  points: number,
  oudlers: number,
  contract: Contract,
  announcements: Announcement[],
  play: PlayState,
) {
  const outcome = contractOutcome(points, oudlers, contract);
  const b = computeBonuses({ contract, fulfilled: outcome.fulfilled, announcements, play });
  return outcome.score + b.handful + b.petitAuBout + b.slam;
}

const handful = (seat: number): Announcement => ({
  kind: "handful",
  seat,
  level: "single",
  cards: [],
});

// À 4 joueurs, preneur au siège 0, défense aux sièges 1, 2 et 3.
const petitByAttack = finishedPlay(
  [0],
  [
    ...plainTricks(17, 1),
    {
      cards: [
        [0, trump(1)],
        [1, h(3)],
      ],
      winner: 0,
    },
  ],
);
const petitByDefense = finishedPlay(
  [0],
  [
    ...plainTricks(17, 0),
    {
      cards: [
        [0, h(3)],
        [1, trump(1)],
      ],
      winner: 1,
    },
  ],
);
const noPetit = finishedPlay([0], [...plainTricks(17, 1), ...plainTricks(1, 0)]);

describe("exemples du règlement FFT (4 joueurs, primes comprises)", () => {
  it("Garde, poignée simple, petit au bout, 49 points avec 2 bouts : +106 (preneur +318)", () => {
    const score = total(49, 2, "guard", [handful(0)], petitByAttack);
    expect(score).toBe(106);
    expect(distributeScore(score, { playerCount: 4, takerSeat: 0, partnerSeat: null })).toEqual([
      318, -106, -106, -106,
    ]);
  });

  it("Garde sans gagnée de 4, petit au bout pris par la défense : 116 − 40 = +76", () => {
    expect(total(45, 2, "guardWithout", [], petitByDefense)).toBe(76);
  });

  it("Prise chutée de 7, poignée du preneur, petit au bout mené par le preneur : −42", () => {
    expect(total(34, 2, "small", [handful(0)], petitByAttack)).toBe(-42);
  });

  it("Garde gagnée de 11, poignée présentée par la défense : +92", () => {
    expect(total(52, 2, "guard", [handful(2)], noPetit)).toBe(92);
  });

  it("Garde, chelem annoncé et réussi, poignée, petit au bout, 87 points : +582", () => {
    const slam = finishedPlay(
      [0],
      [
        ...plainTricks(17, 0),
        {
          cards: [
            [0, trump(1)],
            [1, h(3)],
          ],
          winner: 0,
        },
      ],
    );
    const announcements: Announcement[] = [handful(0), { kind: "slam", seat: 0 }];
    expect(total(87, 2, "guard", announcements, slam)).toBe(582);
  });
});

describe("petitAuBoutCamp", () => {
  it("le camp qui fait le dernier pli avec le Petit", () => {
    expect(petitAuBoutCamp(petitByAttack)).toBe("attack");
    expect(petitAuBoutCamp(petitByDefense)).toBe("defense");
  });

  it("null si le Petit n'est pas au dernier pli", () => {
    expect(petitAuBoutCamp(noPetit)).toBeNull();
    const petitBefore = finishedPlay(
      [0],
      [{ cards: [[0, trump(1)]], winner: 0 }, ...plainTricks(1, 0)],
    );
    expect(petitAuBoutCamp(petitBefore)).toBeNull();
  });

  it("chelem avec l'Excuse jouée en dernier : le Petit au bout est à l'avant-dernier pli", () => {
    const play = finishedPlay(
      [0],
      [
        ...plainTricks(16, 0),
        {
          cards: [
            [0, trump(1)],
            [1, h(3)],
          ],
          winner: 0,
        },
        {
          cards: [
            [0, EXCUSE],
            [1, h(4)],
          ],
          winner: 0,
        },
      ],
    );
    expect(petitAuBoutCamp(play)).toBe("attack");
  });

  it("Excuse jouée en dernier sans chelem : on regarde le dernier pli", () => {
    const play = finishedPlay(
      [0],
      [
        {
          cards: [
            [0, trump(1)],
            [1, h(3)],
          ],
          winner: 0,
        },
        {
          cards: [
            [1, h(5)],
            [0, EXCUSE],
          ],
          winner: 1,
        },
      ],
    );
    expect(petitAuBoutCamp(play)).toBeNull();
  });

  it("la prime est multipliée par le coefficient du contrat", () => {
    const bonus = (contract: Contract) =>
      computeBonuses({ contract, fulfilled: true, announcements: [], play: petitByAttack })
        .petitAuBout;
    expect([bonus("small"), bonus("guard"), bonus("guardWithout"), bonus("guardAgainst")]).toEqual([
      10, 20, 40, 60,
    ]);
  });
});

describe("chelem", () => {
  const attackSlam = finishedPlay([0], plainTricks(18, 0));
  const defenseSlam = finishedPlay([0], plainTricks(18, 2));
  const mixed = finishedPlay([0], [...plainTricks(17, 0), ...plainTricks(1, 1)]);
  const slam = (play: PlayState, announced: boolean, fulfilled = true) =>
    computeBonuses({
      contract: "guard",
      fulfilled,
      announcements: announced ? [{ kind: "slam", seat: 0 }] : [],
      play,
    }).slam;

  it("slamCamp : le camp qui a fait tous les plis, ou null", () => {
    expect(slamCamp(attackSlam)).toBe("attack");
    expect(slamCamp(defenseSlam)).toBe("defense");
    expect(slamCamp(mixed)).toBeNull();
  });

  it("annoncé et réalisé : +400", () => {
    expect(slam(attackSlam, true)).toBe(400);
  });

  it("non annoncé mais réalisé : +200", () => {
    expect(slam(attackSlam, false)).toBe(200);
  });

  it("annoncé mais non réalisé : −200", () => {
    expect(slam(mixed, true)).toBe(-200);
  });

  it("infligé par la défense : +200 pour chaque défenseur", () => {
    expect(slam(defenseSlam, false, false)).toBe(-200);
  });

  it("pas de chelem : pas de prime", () => {
    expect(slam(mixed, false)).toBe(0);
  });
});

describe("primes de poignée", () => {
  it("vont au camp gagnant, quel que soit l'annonceur, sans coefficient", () => {
    const bonus = (fulfilled: boolean, announcements: Announcement[]) =>
      computeBonuses({ contract: "guardAgainst", fulfilled, announcements, play: noPetit }).handful;
    expect(bonus(true, [handful(0)])).toBe(20);
    expect(bonus(false, [handful(0)])).toBe(-20);
    expect(bonus(true, [handful(1)])).toBe(20);
    expect(
      bonus(true, [
        { kind: "handful", seat: 0, level: "triple", cards: [] },
        { kind: "handful", seat: 1, level: "double", cards: [] },
      ]),
    ).toBe(70);
  });
});

describe("annonce du chelem", () => {
  it("seul le preneur peut la faire, une seule fois", () => {
    expect(validateSlamAnnouncement(2, 2, [])).toEqual({ kind: "slam", seat: 2 });
    expect(() => validateSlamAnnouncement(1, 2, [])).toThrow(IllegalActionError);
    expect(() => validateSlamAnnouncement(2, 2, [{ kind: "slam", seat: 2 }])).toThrow(/déjà/);
  });

  it("l'entame revient au preneur, quel que soit le donneur", () => {
    expect(firstLeader(4, 0, [])).toBe(1);
    expect(firstLeader(4, 3, [])).toBe(0);
    expect(firstLeader(4, 0, [{ kind: "slam", seat: 3 }])).toBe(3);
  });
});

describe("scoreDeal sur une vraie donne jouée (chelem annoncé, Excuse en dernier)", () => {
  it("compte le contrat, le chelem et le petit au bout", () => {
    const announcements: Announcement[] = [{ kind: "slam", seat: 0 }];
    let state = startPlay({
      hands: [
        [trump(1), EXCUSE],
        [h(2), h(3)],
        [h(4), h(5)],
      ],
      attackers: [0],
      firstLeader: firstLeader(3, 2, announcements),
    });
    for (const card of [trump(1), h(2), h(4), EXCUSE, h(3), h(5)]) {
      state = playCard(state, state.currentSeat!, card);
    }

    expect(slamCamp(state)).toBe("attack");
    expect(petitAuBoutCamp(state)).toBe("attack");

    const result = scoreDeal({
      contract: "guard",
      play: state,
      dog: [],
      discard: [],
      announcements,
      playerCount: 3,
      takerSeat: 0,
      partnerSeat: null,
    });
    expect(result.bonuses).toEqual({ handful: 0, petitAuBout: 20, slam: 400 });
    expect(result.total).toBe(result.score + 420);
    expect(result.playerScores.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
