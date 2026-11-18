import { createRemoteJWKSet } from "jose";

import type { VerifierKeys } from "./verify-token.js";

/**
 * Configuration de l'authentification, lue dans les variables d'environnement
 * (voir `.env.example` et le README) :
 * - `SUPABASE_URL` : URL du projet. Active les clés asymétriques (JWKS) et la vérification
 *   de l'émetteur (`<SUPABASE_URL>/auth/v1`).
 * - `SUPABASE_JWT_SECRET` : ancien secret partagé HS256, facultatif.
 *
 * Aucune requête n'est faite ici : le JWKS n'est téléchargé (puis mis en cache) qu'à la première
 * vérification d'un jeton asymétrique.
 */

/** Longueur minimale du secret HS256 (les secrets Supabase en font au moins 32). */
const MIN_SECRET_LENGTH = 32;

export type AuthEnv = {
  SUPABASE_URL?: string | undefined;
  SUPABASE_JWT_SECRET?: string | undefined;
};

/** Clés de vérification d'après l'environnement ; lève une erreur explicite si une valeur est invalide. */
export function verifierKeysFromEnv(env: AuthEnv = process.env): VerifierKeys {
  const keys: VerifierKeys = {};

  const projectUrl = parseProjectUrl(env.SUPABASE_URL);
  if (projectUrl !== undefined) {
    keys.issuer = `${projectUrl}/auth/v1`;
    keys.jwks = createRemoteJWKSet(new URL(`${projectUrl}/auth/v1/.well-known/jwks.json`));
  }

  const secret = env.SUPABASE_JWT_SECRET?.trim() ?? "";
  if (secret.length > 0) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`SUPABASE_JWT_SECRET trop court (${MIN_SECRET_LENGTH} caractères minimum)`);
    }
    // Supabase signe avec les octets UTF-8 du secret tel qu'affiché (pas de décodage base64).
    keys.secret = new TextEncoder().encode(secret);
  }

  return keys;
}

/** `https://xyz.supabase.co/` → `https://xyz.supabase.co` ; `undefined` si la variable est vide. */
function parseProjectUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SUPABASE_URL invalide : ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`SUPABASE_URL doit être une URL http(s) : ${value}`);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}
