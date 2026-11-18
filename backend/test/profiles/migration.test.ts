import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_HAND_ORDER, HAND_GROUPS, SORT_DIRECTIONS } from "../../src/profiles/hand-order.js";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN_SOURCE,
} from "../../src/profiles/username.js";

/**
 * Les règles du pseudo et de l'ordre de la main existent en deux exemplaires : en TypeScript
 * (validation avant envoi, frontend) et en SQL (garantie finale, `supabase/migrations/`).
 * Ce test lit les migrations et vérifie que les deux restent identiques.
 */

const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), "utf8"))
  .join("\n");

function capture(pattern: RegExp): string[] {
  const match = pattern.exec(sql);
  expect(match, `motif introuvable dans les migrations : ${pattern}`).not.toBeNull();
  return match!.slice(1);
}

describe("migrations SQL : mêmes règles qu'en TypeScript", () => {
  it("pseudo : même motif et mêmes longueurs", () => {
    const [pattern] = capture(/username ~ '([^']+)'/);
    expect(pattern).toBe(USERNAME_PATTERN_SOURCE);
    const [min, max] = capture(/char_length\(username\) between (\d+) and (\d+)/);
    expect(Number(min)).toBe(USERNAME_MIN_LENGTH);
    expect(Number(max)).toBe(USERNAME_MAX_LENGTH);
  });

  it("ordre de la main : même valeur par défaut", () => {
    const [literal] = capture(/hand_order jsonb not null\s+default '([^']+)'::jsonb/);
    expect(JSON.parse(literal!)).toEqual(DEFAULT_HAND_ORDER);
  });

  it("ordre de la main : mêmes familles et mêmes sens", () => {
    const [groups] = capture(/is not distinct from array\[([^\]]+)\]/);
    const sqlGroups = groups!.split(",").map((g) => g.trim().replace(/^'|'$/g, ""));
    expect(sqlGroups).toEqual([...HAND_GROUPS].sort());
    const [directions] = capture(/->> 'direction'\) not in \(([^)]+)\)/);
    const sqlDirections = directions!.split(",").map((d) => d.trim().replace(/^'|'$/g, ""));
    expect(sqlDirections).toEqual([...SORT_DIRECTIONS]);
  });
});
