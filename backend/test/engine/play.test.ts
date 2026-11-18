import { describe, expect, it } from "vitest";

import {
  EXCUSE,
  KING,
  QUEEN,
  cardId,
  countPoints,
  suitCard,
  type Card,
} from "../../src/engine/cards.js";
import { DEAL_CONFIGS, PLAYER_COUNTS, dealCards } from "../../src/engine/deal.js";
import { IllegalActionError } from "../../src/engine/errors.js";
import {
  campCards,
  isPlayFinished,
  legalCardsForCurrentPlayer,
  playCard,
  startPlay,
  type PlayState,
} from "../../src/engine/play.js";
import { seededRng, type Rng } from "../../src/engine/random.js";

const h = (rank: number) => suitCard("hearts", rank as typeof KING);
const s = (rank: number) => suitCard("spades", rank as typeof KING);
const ids = (cards: readonly Card[]) => cards.map(cardId).sort();

/** Joue les cartes dans l'ordre, chacune par le joueur dont c'est le tour. */
function playAll(state: PlayState, cards: Card[]): PlayState {
  return cards.reduce((st, card) => playCard(st, st.currentSeat!, card), state);
}

/** Joue une donne complète en choisissant au hasard parmi les cartes légales. */
function playRandomly(state: PlayState, rng: Rng): PlayState {
  let st = state;
  while (!isPlayFinished(st)) {
    const legal = legalCardsForCurrentPlayer(st);
    st = playCard(st, st.currentSeat!, legal[Math.floor(rng() * legal.length)]!);
  }
  return st;
}

describe("déroulement des plis", () => {
  it("le gagnant d'un pli entame le suivant", () => {
    let state = startPlay({
      hands: [
        [h(2), s(3)],
        [h(KING), s(4)],
        [h(5), s(6)],
      ],
      attackers: [0],
      firstLeader: 0,
    });
    state = playAll(state, [h(2), h(KING), h(5)]);
    expect(state.completedTricks).toHaveLength(1);
    expect(state.completedTricks[0]!.winner).toBe(1);
    expect(state.currentSeat).toBe(1);
    expect(state.currentTrick).toEqual([]);
  });

  it("refuse un joueur hors de son tour", () => {
    const state = startPlay({ hands: [[h(2)], [h(3)], [h(4)]], attackers: [0], firstLeader: 0 });
    expect(() => playCard(state, 1, h(3))).toThrow(IllegalActionError);
  });

  it("refuse une carte interdite", () => {
    let state = startPlay({
      hands: [
        [h(2), s(3)],
        [h(KING), s(4)],
        [h(5), s(6)],
      ],
      attackers: [0],
      firstLeader: 0,
    });
    state = playCard(state, 0, h(2));
    expect(() => playCard(state, 1, s(4))).toThrow(/interdite/);
  });

  it("refuse de jouer une fois la donne terminée", () => {
    const state = playAll(
      startPlay({ hands: [[h(2)], [h(3)], [h(4)]], attackers: [0], firstLeader: 0 }),
      [h(2), h(3), h(4)],
    );
    expect(isPlayFinished(state)).toBe(true);
    expect(() => playCard(state, 2, h(4))).toThrow(/terminée/);
  });

  it("refuse le décompte avant la fin de la donne", () => {
    const state = startPlay({ hands: [[h(2)], [h(3)], [h(4)]], attackers: [0], firstLeader: 0 });
    expect(() => campCards(state)).toThrow(/pas terminée/);
  });

  it("applique la règle de l'entame du premier pli à 5 joueurs", () => {
    const state = startPlay({
      hands: [
        [h(3), s(5)],
        [s(6), s(7)],
        [s(8), s(9)],
        [s(10), h(4)],
        [s(1), s(2)],
      ],
      attackers: [0, 3],
      firstLeader: 0,
      calledCard: h(KING),
    });
    expect(() => playCard(state, 0, h(3))).toThrow(IllegalActionError);
    expect(() => playCard(state, 0, s(5))).not.toThrow();
  });
});

describe("règles de l'Excuse", () => {
  it("avant le dernier pli : elle reste à son camp, qui donne une carte à 0,5 en échange", () => {
    // Le siège 0 (attaque) joue l'Excuse sur un pli remporté par la défense.
    const state = playAll(
      startPlay({
        hands: [
          [EXCUSE, h(KING)],
          [h(QUEEN), h(5)],
          [h(3), h(4)],
        ],
        attackers: [0],
        firstLeader: 1,
      }),
      [h(QUEEN), h(3), EXCUSE, h(5), h(4), h(KING)],
    );
    const { attack, defense } = campCards(state);
    expect(ids(attack)).toContain("excuse");
    expect(attack).toHaveLength(3); // Excuse, Roi, une carte basse
    expect(defense).toHaveLength(3); // Dame, 3, et la carte d'échange
    expect(countPoints(attack)).toBe(9.5);
    expect(countPoints(defense)).toBe(4.5);
  });

  it("au dernier pli : elle change de camp", () => {
    const state = playAll(
      startPlay({
        hands: [
          [h(2), EXCUSE],
          [h(KING), h(5)],
          [h(3), h(4)],
        ],
        attackers: [0],
        firstLeader: 1,
      }),
      [h(KING), h(3), h(2), h(5), h(4), EXCUSE],
    );
    const { attack, defense } = campCards(state);
    expect(attack).toEqual([]);
    expect(ids(defense)).toContain("excuse");
  });

  it("chelem : entamée au dernier pli, elle remporte le pli", () => {
    const state = playAll(
      startPlay({
        hands: [
          [h(KING), EXCUSE],
          [h(QUEEN), h(5)],
          [h(3), h(4)],
        ],
        attackers: [0],
        firstLeader: 0,
      }),
      [h(KING), h(QUEEN), h(3), EXCUSE, h(5), h(4)],
    );
    expect(state.completedTricks[1]!.winner).toBe(0);
    const { attack, defense } = campCards(state);
    expect(attack).toHaveLength(6);
    expect(defense).toEqual([]);
  });

  it("le camp qui a perdu un pli ne bénéficie pas de la règle du chelem", () => {
    const state = playAll(
      startPlay({
        hands: [
          [h(2), EXCUSE],
          [h(KING), h(5)],
          [h(3), h(4)],
        ],
        attackers: [0],
        firstLeader: 1,
      }),
      // Le siège 1 (défense) gagne le 1er pli et entame le dernier : l'Excuse n'est pas entamée.
      [h(KING), h(3), h(2), h(5), h(4), EXCUSE],
    );
    expect(state.completedTricks[1]!.winner).toBe(1);
  });
});

describe("donnes complètes aléatoires", () => {
  it.each(PLAYER_COUNTS)("à %i joueurs : 300 donnes jouées jusqu'au bout", (players) => {
    const { handSize, dogSize } = DEAL_CONFIGS[players];
    const rng = seededRng(players * 1000);

    for (let i = 0; i < 300; i++) {
      const deal = dealCards(players, rng);
      const taker = i % players;
      const attackers = players === 5 ? [taker, (taker + 2) % players] : [taker];
      const state = playRandomly(
        startPlay({ hands: deal.hands, attackers, firstLeader: (i + 1) % players }),
        rng,
      );

      // Autant de plis que de cartes par main, chacun avec une carte par joueur.
      expect(state.completedTricks).toHaveLength(handSize);
      for (const trick of state.completedTricks) {
        expect(trick.cards).toHaveLength(players);
        expect(new Set(trick.cards.map((c) => c.seat)).size).toBe(players);
      }

      // Toutes les cartes des mains sont jouées une fois et réparties entre les deux camps.
      const { attack, defense } = campCards(state);
      expect(attack.length + defense.length).toBe(78 - dogSize);
      expect(ids([...attack, ...defense])).toEqual(ids(deal.hands.flat()));
      expect(countPoints(attack) + countPoints(defense)).toBe(91 - countPoints(deal.dog));
    }
  });
});
