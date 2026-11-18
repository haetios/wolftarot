import { getRandomValues } from "node:crypto";

/** Générateur aléatoire : renvoie un nombre dans [0, 1). Injectable pour rendre les tests déterministes. */
export type Rng = () => number;

/**
 * RNG par défaut, basé sur `crypto` : le mélange d'une vraie partie ne doit pas être prévisible
 * (contrairement à `Math.random`, dont l'état peut être reconstitué).
 */
export const cryptoRng: Rng = () => {
  const [value] = getRandomValues(new Uint32Array(1));
  return value! / 2 ** 32;
};

/**
 * RNG déterministe (mulberry32) : même graine, même suite de nombres.
 * Pour les tests et les donnes reproductibles, jamais pour une vraie partie en ligne.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Mélange de Fisher-Yates. Renvoie un nouveau tableau, l'entrée n'est pas modifiée. */
export function shuffle<T>(items: readonly T[], rng: Rng = cryptoRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
