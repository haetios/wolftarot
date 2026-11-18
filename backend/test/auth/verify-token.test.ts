import { beforeAll, describe, expect, it } from "vitest";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTVerifyGetKey,
} from "jose";

import { authenticate } from "../../src/auth/authenticate.js";
import {
  AuthError,
  createTokenVerifier,
  type AuthFailureReason,
  type TokenVerifier,
} from "../../src/auth/verify-token.js";
import { TEST_ISSUER, TEST_SECRET, signTestToken } from "../helpers/auth.js";

/** Attend un refus de `verify` pour la raison donnée. */
async function expectRejected(promise: Promise<unknown>, reason: AuthFailureReason) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).reason).toBe(reason);
}

/** Jeton à base64url arbitraire : en-tête `{ alg: "none" }`, sans signature. */
const unsignedToken = (payload: object) =>
  [{ alg: "none", typ: "JWT" }, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".") + ".";

describe("vérification d'un jeton Supabase", () => {
  describe("ancien secret partagé (HS256)", () => {
    const verify = createTokenVerifier({ secret: TEST_SECRET, issuer: TEST_ISSUER });

    it("accepte un jeton valide et renvoie ses revendications", async () => {
      const token = await signTestToken({ sub: "user-1", username: "Alice" });
      const claims = await verify(token);
      expect(claims.sub).toBe("user-1");
      expect(claims.aud).toBe("authenticated");
      expect(claims.user_metadata).toEqual({ username: "Alice" });
    });

    it("donne l'identité (id, pseudo) du joueur", async () => {
      const token = await signTestToken({ sub: "user-1", username: "  Alice  " });
      expect(await authenticate(token, verify)).toEqual({ id: "user-1", name: "Alice" });
    });

    it.each([undefined, null, "", 42, { token: "x" }])("refuse l'absence de jeton (%o)", (token) =>
      expectRejected(verify(token), "missingToken"),
    );

    it("refuse un jeton expiré", async () => {
      const token = await signTestToken({ expiresIn: -60 });
      await expectRejected(verify(token), "expiredToken");
    });

    it("tolère quelques secondes de décalage d'horloge", async () => {
      const token = await signTestToken({ expiresIn: -2 });
      await expect(verify(token)).resolves.toMatchObject({ aud: "authenticated" });
    });

    it("refuse un jeton signé avec un autre secret", async () => {
      const key = new TextEncoder().encode("another-secret-of-at-least-32-characters!!");
      await expectRejected(verify(await signTestToken({ key })), "invalidSignature");
    });

    it("refuse un jeton dont le contenu a été modifié", async () => {
      const [header, , signature] = (await signTestToken({ sub: "user-1" })).split(".");
      const forgedPayload = (await signTestToken({ sub: "admin" })).split(".")[1];
      await expectRejected(verify(`${header}.${forgedPayload}.${signature}`), "invalidSignature");
    });

    it.each([
      ["une autre audience", { aud: "anon" }],
      ["sans audience (clé anon ou service_role)", { aud: undefined }],
      ["un autre émetteur", { iss: "https://evil.example/auth/v1" }],
      ["sans identifiant (sub)", { sub: undefined }],
      ["un identifiant vide", { sub: "" }],
    ])("refuse un jeton avec %s", async (_label, claims) => {
      await expectRejected(verify(await signTestToken({ claims })), "invalidClaims");
    });

    it("refuse un jeton sans date d'expiration", async () => {
      const token = await signTestToken({ claims: { exp: undefined } });
      await expectRejected(verify(token), "invalidClaims");
    });

    it("refuse un utilisateur anonyme", async () => {
      const token = await signTestToken({ claims: { is_anonymous: true } });
      await expectRejected(verify(token), "anonymousUser");
    });

    it.each(["abc", "a.b.c", "x.y", "....", "eyJhbGciOiJIUzI1NiJ9.e30"])(
      "refuse un jeton mal formé (%s)",
      (token) => expectRejected(verify(token), "malformedToken"),
    );

    it("refuse un jeton démesuré", () =>
      expectRejected(verify("a".repeat(10_000)), "malformedToken"));

    it("refuse un jeton non signé (alg: none)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = unsignedToken({ sub: "u", aud: "authenticated", exp: now + 60 });
      await expectRejected(verify(token), "unsupportedAlgorithm");
    });

    it("sans émetteur configuré, l'émetteur n'est pas vérifié", async () => {
      const lenient = createTokenVerifier({ secret: TEST_SECRET });
      const token = await signTestToken({ claims: { iss: "https://other.example/auth/v1" } });
      await expect(lenient(token)).resolves.toMatchObject({ sub: expect.any(String) });
    });
  });

  describe("clés asymétriques (JWKS)", () => {
    let es256: { privateKey: CryptoKey; jwks: JWTVerifyGetKey };
    let rs256Key: CryptoKey;
    let verify: TokenVerifier;

    beforeAll(async () => {
      const ec = await generateKeyPair("ES256");
      const rsa = await generateKeyPair("RS256");
      // JWKS local, injecté : il remplace `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
      const keys = [
        { ...(await exportJWK(ec.publicKey)), kid: "ec-key", alg: "ES256", use: "sig" },
        { ...(await exportJWK(rsa.publicKey)), kid: "rsa-key", alg: "RS256", use: "sig" },
      ];
      es256 = { privateKey: ec.privateKey, jwks: createLocalJWKSet({ keys }) };
      rs256Key = rsa.privateKey;
      verify = createTokenVerifier({ jwks: es256.jwks, issuer: TEST_ISSUER });
    });

    const signEs256 = (options: Parameters<typeof signTestToken>[0] = {}) =>
      signTestToken({ key: es256.privateKey, alg: "ES256", kid: "ec-key", ...options });

    it("accepte un jeton ES256 valide", async () => {
      const token = await signEs256({ sub: "user-2", username: "Bob" });
      expect(await authenticate(token, verify)).toEqual({ id: "user-2", name: "Bob" });
    });

    it("accepte un jeton RS256 valide", async () => {
      const token = await signTestToken({ key: rs256Key, alg: "RS256", kid: "rsa-key" });
      await expect(verify(token)).resolves.toMatchObject({ aud: "authenticated" });
    });

    it("refuse un jeton signé par une clé inconnue du JWKS", async () => {
      const { privateKey } = await generateKeyPair("ES256");
      const sameKid = await signTestToken({ key: privateKey, alg: "ES256", kid: "ec-key" });
      await expectRejected(verify(sameKid), "invalidSignature");
      const otherKid = await signTestToken({ key: privateKey, alg: "ES256", kid: "unknown" });
      await expectRejected(verify(otherKid), "invalidSignature");
    });

    it("refuse un jeton expiré", async () => {
      await expectRejected(verify(await signEs256({ expiresIn: -60 })), "expiredToken");
    });

    it("refuse une mauvaise audience", async () => {
      const token = await signEs256({ claims: { aud: "anon" } });
      await expectRejected(verify(token), "invalidClaims");
    });

    it("refuse un jeton HS256 quand seul le JWKS est configuré", async () => {
      await expectRejected(verify(await signTestToken()), "unsupportedAlgorithm");
    });
  });

  describe("les deux types de clés configurés", () => {
    it("accepte les jetons HS256 et ES256", async () => {
      const { privateKey, publicKey } = await generateKeyPair("ES256");
      const jwk = { ...(await exportJWK(publicKey)), kid: "k", alg: "ES256" };
      const verify = createTokenVerifier({
        jwks: createLocalJWKSet({ keys: [jwk] }),
        secret: TEST_SECRET,
        issuer: TEST_ISSUER,
      });
      await expect(verify(await signTestToken())).resolves.toBeDefined();
      const es = await signTestToken({ key: privateKey, alg: "ES256", kid: "k" });
      await expect(verify(es)).resolves.toBeDefined();
    });
  });

  it("sans aucune clé configurée, toute connexion est refusée", async () => {
    const verify = createTokenVerifier({});
    await expectRejected(verify(await signTestToken()), "notConfigured");
  });

  it("un JWKS injoignable donne une erreur de vérification, pas un plantage", async () => {
    const unreachable: JWTVerifyGetKey = async () => {
      throw new Error("fetch failed");
    };
    const verify = createTokenVerifier({ jwks: unreachable });
    const { privateKey } = await generateKeyPair("ES256");
    const token = await signTestToken({ key: privateKey, alg: "ES256", kid: "k" });
    await expectRejected(verify(token), "verificationFailed");
  });
});
