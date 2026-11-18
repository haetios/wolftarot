import { describe, expect, it } from "vitest";

import { cleanName, nameFromClaims, resolvePlayerIdentity } from "../../src/auth/identity.js";
import type { SupabaseClaims } from "../../src/auth/verify-token.js";

const claims = (user_metadata?: Record<string, unknown>): SupabaseClaims => ({
  sub: "user-1",
  aud: "authenticated",
  ...(user_metadata === undefined ? {} : { user_metadata }),
});

describe("identité du joueur", () => {
  it("id = sub du jeton, pseudo = user_metadata.username", async () => {
    expect(await resolvePlayerIdentity(claims({ username: "Alice" }))).toEqual({
      id: "user-1",
      name: "Alice",
    });
  });

  it("sans pseudo : null (la room choisit un pseudo de repli)", async () => {
    expect(await resolvePlayerIdentity(claims())).toEqual({ id: "user-1", name: null });
    expect(nameFromClaims(claims({}))).toBeNull();
    expect(nameFromClaims(claims({ username: "   " }))).toBeNull();
    expect(nameFromClaims(claims({ username: 42 }))).toBeNull();
  });

  it("à défaut de username : pseudo OAuth (user_name, preferred_username)", () => {
    expect(nameFromClaims(claims({ user_name: "gh-bob" }))).toBe("gh-bob");
    expect(nameFromClaims(claims({ preferred_username: "carol" }))).toBe("carol");
    expect(nameFromClaims(claims({ username: "Alice", user_name: "gh-alice" }))).toBe("Alice");
  });

  it("n'affiche jamais le nom réel (name, full_name) ni l'e-mail", () => {
    const meta = { name: "Alice Martin", full_name: "Alice Martin", email: "alice@example.test" };
    expect(nameFromClaims(claims(meta))).toBeNull();
  });

  it("nettoie le pseudo", () => {
    expect(cleanName("  Alice  ")).toBe("Alice");
    expect(cleanName("A\u0000lice\u007f")).toBe("Alice");
    expect(cleanName("Jean\n\tPierre")).toBe("Jean Pierre");
    expect(cleanName("Jean   Pierre")).toBe("Jean Pierre");
    expect(cleanName("x".repeat(40))).toBe("x".repeat(24));
    expect(cleanName("🃏".repeat(30))).toBe("🃏".repeat(24));
    expect(cleanName("")).toBeNull();
    expect(cleanName(undefined)).toBeNull();
  });
});
