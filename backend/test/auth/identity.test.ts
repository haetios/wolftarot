import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanName, resolvePlayerIdentity } from "../../src/auth/identity.js";
import { AuthError, type SupabaseClaims } from "../../src/auth/verify-token.js";
import { InMemoryProfileRepository } from "../helpers/profiles.js";

const claims = (user_metadata?: Record<string, unknown>): SupabaseClaims => ({
  sub: "user-1",
  aud: "authenticated",
  ...(user_metadata === undefined ? {} : { user_metadata }),
});

const TOKEN = "jeton-du-joueur";

describe("identité du joueur : pseudo lu dans profiles (B14)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("profil trouvé : son pseudo, user_metadata ignoré", async () => {
    const profiles = new InMemoryProfileRepository().withProfile("user-1", "Alice");
    const identity = await resolvePlayerIdentity(claims({ username: "Usurpateur" }), {
      accessToken: TOKEN,
      profiles,
    });
    expect(identity).toEqual({ id: "user-1", name: "Alice" });
  });

  it("le profil est lu avec le jeton du joueur (la RLS s'applique)", async () => {
    const profiles = new InMemoryProfileRepository().withProfile("user-1", "Alice");
    await resolvePlayerIdentity(claims(), { accessToken: TOKEN, profiles });
    expect(profiles.calls).toEqual([{ method: "findProfile", userId: "user-1", token: TOKEN }]);
  });

  it("profil absent : connexion refusée (profileNotFound)", async () => {
    const profiles = new InMemoryProfileRepository();
    const result = resolvePlayerIdentity(claims({ username: "Alice" }), {
      accessToken: TOKEN,
      profiles,
    });
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({ reason: "profileNotFound" });
  });

  it("Supabase injoignable : connexion refusée (profileUnavailable), jamais user_metadata", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const profiles = new InMemoryProfileRepository().withProfile("user-1", "Alice");
    profiles.unavailable = true;
    const result = resolvePlayerIdentity(claims({ username: "Usurpateur" }), {
      accessToken: TOKEN,
      profiles,
    });
    await expect(result).rejects.toBeInstanceOf(AuthError);
    await expect(result).rejects.toMatchObject({ reason: "profileUnavailable" });
    expect(warn).toHaveBeenCalledOnce();
    // Le jeton n'apparaît jamais dans les journaux.
    expect(String(warn.mock.calls[0]![0])).not.toContain(TOKEN);
  });

  it("erreur inattendue du dépôt : traitée comme une panne (connexion refusée)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const profiles = new InMemoryProfileRepository();
    profiles.findProfile = async () => {
      throw new Error("bug");
    };
    await expect(
      resolvePlayerIdentity(claims(), { accessToken: TOKEN, profiles }),
    ).rejects.toMatchObject({ reason: "profileUnavailable" });
  });
});

describe("nettoyage du pseudo", () => {
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
