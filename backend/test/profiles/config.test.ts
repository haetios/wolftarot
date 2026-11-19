import { describe, expect, it } from "vitest";

import { profileRepositoryFromEnv } from "../../src/profiles/config.js";
import { SupabaseProfileRepository } from "../../src/profiles/supabase-repository.js";

/** Ancienne clé Supabase au format JWT (signature factice : seul le rôle est lu). */
const legacyKey = (role: string) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ iss: "supabase", ref: "abcd", role })).toString("base64url"),
    "signature",
  ].join(".");

describe("configuration des profils (variables d'environnement)", () => {
  const url = "https://abcd.supabase.co";

  it("sans clé : erreur explicite au démarrage (clé obligatoire)", () => {
    expect(() => profileRepositoryFromEnv({})).toThrow(/obligatoire/);
    expect(() =>
      profileRepositoryFromEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "  " }),
    ).toThrow(/obligatoire/);
  });

  it("clé publishable ou ancienne clé anon : dépôt Supabase", () => {
    for (const key of ["sb_publishable_abc123", legacyKey("anon")]) {
      const repo = profileRepositoryFromEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key });
      expect(repo).toBeInstanceOf(SupabaseProfileRepository);
    }
  });

  it("clé sans URL : erreur explicite", () => {
    expect(() =>
      profileRepositoryFromEnv({ SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }),
    ).toThrow(/SUPABASE_URL/);
  });

  it("refuse une clé secrète ou service_role (moindre privilège)", () => {
    for (const key of ["sb_secret_abc123", legacyKey("service_role"), legacyKey("authenticated")]) {
      expect(() =>
        profileRepositoryFromEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }),
      ).toThrow(/clé publique/);
    }
    expect(() =>
      profileRepositoryFromEnv({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "a.b.c" }),
    ).toThrow(/illisible/);
  });
});
