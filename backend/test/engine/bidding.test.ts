import { describe, expect, it } from "vitest";

import {
  CONTRACTS,
  auctionResult,
  contractRank,
  legalBids,
  placeBid,
  startAuction,
  type AuctionState,
  type Bid,
} from "../../src/engine/bidding.js";
import { IllegalActionError } from "../../src/engine/errors.js";

/** Joue une suite d'enchères dans l'ordre, à partir du joueur qui doit parler. */
function play(state: AuctionState, bids: Bid[]): AuctionState {
  return bids.reduce((s, bid) => placeBid(s, s.currentSeat!, bid), state);
}

describe("contrats", () => {
  it("sont classés : petite < garde < garde sans < garde contre", () => {
    expect(CONTRACTS).toEqual(["small", "guard", "guardWithout", "guardAgainst"]);
    expect(contractRank("small")).toBeLessThan(contractRank("guard"));
    expect(contractRank("guard")).toBeLessThan(contractRank("guardWithout"));
    expect(contractRank("guardWithout")).toBeLessThan(contractRank("guardAgainst"));
  });
});

describe("startAuction", () => {
  it("fait parler en premier le joueur qui suit le donneur", () => {
    expect(startAuction(4, 0).currentSeat).toBe(1);
    expect(startAuction(4, 3).currentSeat).toBe(0);
    expect(startAuction(5, 4).currentSeat).toBe(0);
  });

  it.each([-1, 4, 1.5])("refuse un donneur invalide (%s)", (dealer) => {
    expect(() => startAuction(4, dealer)).toThrow(RangeError);
  });
});

describe("legalBids", () => {
  it("au départ, tout est permis", () => {
    expect(legalBids(startAuction(4, 0))).toEqual(["pass", ...CONTRACTS]);
  });

  it("après une garde, seuls passer, garde sans et garde contre sont permis", () => {
    const state = play(startAuction(4, 0), ["guard"]);
    expect(legalBids(state)).toEqual(["pass", "guardWithout", "guardAgainst"]);
  });

  it("un passe ne change pas le minimum", () => {
    const state = play(startAuction(4, 0), ["small", "pass"]);
    expect(legalBids(state)).toEqual(["pass", "guard", "guardWithout", "guardAgainst"]);
  });

  it("enchères terminées : plus rien n'est permis", () => {
    const state = play(startAuction(3, 0), ["pass", "pass", "pass"]);
    expect(legalBids(state)).toEqual([]);
  });
});

describe("placeBid", () => {
  it("fait tourner la parole dans l'ordre des sièges", () => {
    let state = startAuction(4, 2);
    expect(state.currentSeat).toBe(3);
    state = placeBid(state, 3, "pass");
    expect(state.currentSeat).toBe(0);
    state = placeBid(state, 0, "small");
    expect(state.currentSeat).toBe(1);
  });

  it("ne modifie pas l'état précédent", () => {
    const before = startAuction(4, 0);
    placeBid(before, 1, "guard");
    expect(before.history).toEqual([]);
    expect(before.highest).toBeNull();
    expect(before.currentSeat).toBe(1);
  });

  it("refuse un joueur qui parle hors de son tour", () => {
    const state = startAuction(4, 0);
    expect(() => placeBid(state, 2, "small")).toThrow(IllegalActionError);
    try {
      placeBid(state, 2, "small");
    } catch (e) {
      expect((e as IllegalActionError).code).toBe("notYourTurn");
    }
  });

  it("refuse une enchère égale ou inférieure à la plus haute", () => {
    const state = play(startAuction(4, 0), ["guard"]);
    expect(() => placeBid(state, 2, "guard")).toThrow(/interdite/);
    expect(() => placeBid(state, 2, "small")).toThrow(IllegalActionError);
  });

  it("refuse une enchère inconnue", () => {
    const state = startAuction(4, 0);
    expect(() => placeBid(state, 1, "chelem" as Bid)).toThrow(IllegalActionError);
  });

  it("refuse toute enchère une fois les enchères terminées", () => {
    const state = play(startAuction(3, 0), ["small", "pass", "pass"]);
    expect(() => placeBid(state, 1, "guard")).toThrow(/terminées/);
  });

  it("chaque joueur ne parle qu'une fois", () => {
    const state = play(startAuction(4, 0), ["small", "guard", "pass", "pass"]);
    expect(state.currentSeat).toBeNull();
    expect(state.history).toHaveLength(4);
  });

  it("une garde contre termine immédiatement les enchères", () => {
    const state = play(startAuction(5, 0), ["small", "guardAgainst"]);
    expect(state.currentSeat).toBeNull();
    expect(auctionResult(state)).toEqual({ kind: "taker", seat: 2, contract: "guardAgainst" });
  });
});

describe("auctionResult", () => {
  it("est null tant que les enchères ne sont pas terminées", () => {
    expect(auctionResult(startAuction(4, 0))).toBeNull();
    expect(auctionResult(play(startAuction(4, 0), ["small", "pass"]))).toBeNull();
  });

  it.each([3, 4, 5] as const)("à %i joueurs, si tout le monde passe : redonne", (players) => {
    const state = play(startAuction(players, 0), Array<Bid>(players).fill("pass"));
    expect(auctionResult(state)).toEqual({ kind: "redeal", reason: "allPassed" });
  });

  it("le preneur est celui qui a annoncé le contrat le plus haut", () => {
    // Donneur 0 : parlent 1, 2, 3, 0.
    const state = play(startAuction(4, 0), ["small", "pass", "guard", "pass"]);
    expect(auctionResult(state)).toEqual({ kind: "taker", seat: 3, contract: "guard" });
  });

  it("le donneur parle en dernier et peut prendre", () => {
    const state = play(startAuction(3, 1), ["pass", "pass", "guardWithout"]);
    expect(auctionResult(state)).toEqual({ kind: "taker", seat: 1, contract: "guardWithout" });
  });
});
