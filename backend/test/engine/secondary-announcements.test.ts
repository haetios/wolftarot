import { describe, expect, it } from "vitest";

import type { Announcement } from "../../src/engine/announcements.js";
import { EXCUSE, KING, QUEEN, suitCard, trump, type Card } from "../../src/engine/cards.js";
import { campCards, playCard, startPlay, type PlayState } from "../../src/engine/play.js";
import { computeBonuses, scoreDeal } from "../../src/engine/scoring.js";

const h = (rank: number) => suitCard("hearts", rank as typeof KING);

/** Chelem de l'attaque (siège 0), Excuse entamée au dernier pli, Petit à l'avant-dernier. */
function slamWithExcuseLast(slamExcuseRule: boolean): PlayState {
  let state = startPlay({
    hands: [
      [trump(1), EXCUSE],
      [h(2), h(3)],
      [h(4), h(5)],
    ],
    attackers: [0],
    firstLeader: 0,
    slamExcuseRule,
  });
  for (const card of [trump(1), h(2), h(4), EXCUSE, h(3), h(5)] as Card[]) {
    state = playCard(state, state.currentSeat!, card);
  }
  return state;
}

describe("annonces secondaires désactivées (B17.4)", () => {
  it("règle FFT active par défaut : l'Excuse entamée au dernier pli remporte le chelem", () => {
    const state = slamWithExcuseLast(true);
    expect(state.completedTricks[1]!.winner).toBe(0);
    expect(campCards(state).defense).toEqual([]);
  });

  it("sans annonces secondaires : pas de chelem, l'Excuse au dernier pli change de camp", () => {
    const state = slamWithExcuseLast(false);
    expect(state.completedTricks[1]!.winner).not.toBe(0);
    expect(campCards(state).defense).toContainEqual(EXCUSE);
  });

  it("ni prime de chelem ni prime de petit au bout ; la poignée reste", () => {
    const state = slamWithExcuseLast(true);
    const announcements: Announcement[] = [
      { kind: "slam", seat: 0 },
      { kind: "handful", seat: 0, level: "single", cards: [] },
    ];
    const on = computeBonuses({ contract: "guard", fulfilled: true, announcements, play: state });
    expect(on.slam).toBe(400);
    expect(on.petitAuBout).toBe(20);

    const off = computeBonuses({
      contract: "guard",
      fulfilled: true,
      announcements,
      play: state,
      secondaryAnnouncements: false,
    });
    expect(off).toEqual({ handful: 20, petitAuBout: 0, slam: 0 });
  });

  it("le score de la donne n'inclut aucune prime secondaire", () => {
    const state = slamWithExcuseLast(false);
    const result = scoreDeal({
      contract: "guard",
      play: state,
      dog: [h(QUEEN)],
      discard: [],
      announcements: [],
      playerCount: 3,
      takerSeat: 0,
      partnerSeat: null,
      secondaryAnnouncements: false,
    });
    expect(result.bonuses).toEqual({ handful: 0, petitAuBout: 0, slam: 0 });
    expect(result.total).toBe(result.score);
  });
});
