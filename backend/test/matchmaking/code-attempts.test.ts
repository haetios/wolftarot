import { describe, expect, it } from "vitest";

import {
  AttemptLimiter,
  CODE_FAILURE_WINDOW_MS,
  MAX_CODE_FAILURES,
} from "../../src/matchmaking/code-attempts.js";

describe("AttemptLimiter (5 codes erronés par minute et par compte)", () => {
  const make = () => {
    let now = 1_000_000;
    const limiter = new AttemptLimiter(MAX_CODE_FAILURES, CODE_FAILURE_WINDOW_MS, () => now);
    return { limiter, advance: (ms: number) => (now += ms) };
  };

  it("réglages : 5 échecs sur une minute", () => {
    expect(MAX_CODE_FAILURES).toBe(5);
    expect(CODE_FAILURE_WINDOW_MS).toBe(60_000);
  });

  it("bloque au 5e échec, pas avant", () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i++) {
      limiter.recordFailure("alice");
      expect(limiter.isBlocked("alice")).toBe(false);
    }
    limiter.recordFailure("alice");
    expect(limiter.isBlocked("alice")).toBe(true);
  });

  it("chaque compte a son propre compteur", () => {
    const { limiter } = make();
    for (let i = 0; i < 5; i++) limiter.recordFailure("alice");
    expect(limiter.isBlocked("alice")).toBe(true);
    expect(limiter.isBlocked("bob")).toBe(false);
  });

  it("fenêtre glissante : les échecs de plus d'une minute sont oubliés", () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 5; i++) {
      limiter.recordFailure("alice");
      advance(10_000);
    }
    // Échecs à t = 0, 10, 20, 30, 40 s ; on est à t = 50 s.
    expect(limiter.isBlocked("alice")).toBe(true);
    advance(10_001); // t ≈ 60 s : le premier échec sort de la fenêtre.
    expect(limiter.isBlocked("alice")).toBe(false);
    limiter.recordFailure("alice");
    expect(limiter.isBlocked("alice")).toBe(true);
    advance(CODE_FAILURE_WINDOW_MS);
    expect(limiter.isBlocked("alice")).toBe(false);
  });

  it("reset oublie tout", () => {
    const { limiter } = make();
    for (let i = 0; i < 5; i++) limiter.recordFailure("alice");
    limiter.reset();
    expect(limiter.isBlocked("alice")).toBe(false);
  });
});
