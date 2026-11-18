import { describe, expect, it } from "vitest";

import { verifierKeysFromEnv } from "../../src/auth/config.js";

describe("configuration de l'authentification (variables d'environnement)", () => {
  const secret = "a-legacy-jwt-secret-with-at-least-32-chars";

  it("sans variable : aucune clé", () => {
    expect(verifierKeysFromEnv({})).toEqual({});
    expect(verifierKeysFromEnv({ SUPABASE_URL: " ", SUPABASE_JWT_SECRET: "" })).toEqual({});
  });

  it("SUPABASE_URL : émetteur et JWKS du projet (sans requête réseau)", () => {
    const keys = verifierKeysFromEnv({ SUPABASE_URL: "https://abcd.supabase.co/" });
    expect(keys.issuer).toBe("https://abcd.supabase.co/auth/v1");
    expect(typeof keys.jwks).toBe("function");
    expect(keys.secret).toBeUndefined();
  });

  it("SUPABASE_JWT_SECRET : secret encodé en UTF-8", () => {
    const keys = verifierKeysFromEnv({ SUPABASE_JWT_SECRET: secret });
    expect(new TextDecoder().decode(keys.secret)).toBe(secret);
    expect(keys.issuer).toBeUndefined();
    expect(keys.jwks).toBeUndefined();
  });

  it("refuse une URL invalide", () => {
    expect(() => verifierKeysFromEnv({ SUPABASE_URL: "pas une url" })).toThrow(/SUPABASE_URL/);
    expect(() => verifierKeysFromEnv({ SUPABASE_URL: "ftp://abcd.supabase.co" })).toThrow(
      /SUPABASE_URL/,
    );
  });

  it("refuse un secret trop court", () => {
    expect(() => verifierKeysFromEnv({ SUPABASE_JWT_SECRET: "court" })).toThrow(
      /SUPABASE_JWT_SECRET/,
    );
  });
});
