import { randomUUID } from "node:crypto";
import { SignJWT, type CryptoKey, type JWTPayload, type KeyObject } from "jose";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room } from "colyseus";

/**
 * Jetons Supabase signés en local pour les tests (aucun appel réseau).
 * Le secret et l'URL sont ceux de `vitest.config.ts`.
 */

export const TEST_SUPABASE_URL = process.env.SUPABASE_URL!;
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;
export const TEST_SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);

export type TestTokenOptions = {
  sub?: string;
  /** Pseudo placé dans `user_metadata.username` ; absent si `undefined`. */
  username?: string;
  /** Autres revendications, qui remplacent celles par défaut. */
  claims?: JWTPayload;
  /** Durée de validité en secondes (négative : jeton déjà expiré). 1 h par défaut. */
  expiresIn?: number;
  /** Clé de signature : le secret de test (HS256) par défaut. */
  key?: Uint8Array | CryptoKey | KeyObject;
  alg?: string;
  kid?: string;
};

/** Jeton d'accès au format Supabase (audience `authenticated`, émetteur du projet de test). */
export async function signTestToken(options: TestTokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: options.sub ?? randomUUID(),
    aud: "authenticated",
    iss: TEST_ISSUER,
    role: "authenticated",
    iat: now,
    exp: now + (options.expiresIn ?? 3600),
    email: "player@example.test",
    is_anonymous: false,
    user_metadata: options.username === undefined ? {} : { username: options.username },
    ...options.claims,
  };
  const alg = options.alg ?? "HS256";
  return new SignJWT(payload)
    .setProtectedHeader({ alg, typ: "JWT", ...(options.kid ? { kid: options.kid } : {}) })
    .sign(options.key ?? TEST_SECRET);
}

/** Connecte un client à une room avec ce jeton (transmis en `Authorization: Bearer`). */
export async function connectWithToken<R extends Room>(
  colyseus: ColyseusTestServer,
  room: R,
  token: string,
  options: Record<string, unknown> = {},
) {
  // Le SDK du serveur de test est partagé : on fixe le jeton juste avant chaque connexion.
  colyseus.sdk.auth.token = token;
  return colyseus.connectTo(room, options);
}

/** Connecte un joueur authentifié (nouvel utilisateur à chaque appel, sauf `sub` fourni). */
export async function connectAs<R extends Room>(
  colyseus: ColyseusTestServer,
  room: R,
  user: Omit<TestTokenOptions, "key" | "alg" | "kid"> = {},
) {
  return connectWithToken(colyseus, room, await signTestToken(user));
}
