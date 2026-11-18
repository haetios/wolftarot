import { decodeJwt } from "jose";

import { SupabaseProfileRepository } from "./supabase-repository.js";
import type { ProfileRepository } from "./repository.js";

/**
 * Configuration de l'accès aux profils, lue dans les variables d'environnement
 * (voir `.env.example` et le README) :
 * - `SUPABASE_URL` : URL du projet (déjà utilisée pour vérifier les jetons) ;
 * - `SUPABASE_PUBLISHABLE_KEY` : clé **publique** du projet (`sb_publishable_…`, ou l'ancienne
 *   clé `anon`). Non secrète : c'est celle du frontend.
 *
 * Sans clé, aucun dépôt n'est construit (`null`) : le pseudo vient alors de `user_metadata`,
 * comme en B13 (mode de développement, voir `resolvePlayerIdentity`).
 *
 * Moindre privilège : une clé secrète (`sb_secret_…`, ou ancienne clé JWT de rôle
 * `service_role`) est refusée au démarrage. Elle contournerait la RLS, alors que le jeton du
 * joueur suffit pour lire son profil.
 */

export type ProfilesEnv = {
  SUPABASE_URL?: string | undefined;
  SUPABASE_PUBLISHABLE_KEY?: string | undefined;
};

/** Dépôt de profils d'après l'environnement, ou `null` ; lève une erreur explicite si invalide. */
export function profileRepositoryFromEnv(env: ProfilesEnv = process.env): ProfileRepository | null {
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (key.length === 0) return null;

  const url = env.SUPABASE_URL?.trim() ?? "";
  if (url.length === 0) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY exige SUPABASE_URL (URL du projet)");
  }
  assertPublicKey(key);
  // L'URL elle-même est validée par la configuration de l'authentification (`auth/config.ts`).
  return new SupabaseProfileRepository({ url, publishableKey: key });
}

/** Refuse les clés secrètes : seule la clé publique du projet est acceptée. */
function assertPublicKey(key: string): void {
  const refusal =
    "SUPABASE_PUBLISHABLE_KEY doit être la clé publique du projet (publishable ou anon), " +
    "jamais une clé secrète ni service_role";
  if (key.startsWith("sb_secret_")) throw new Error(refusal);

  // Ancienne clé au format JWT : son rôle est lisible sans vérifier la signature.
  if (key.split(".").length === 3) {
    let role: unknown;
    try {
      role = decodeJwt(key).role;
    } catch {
      throw new Error("SUPABASE_PUBLISHABLE_KEY : clé JWT illisible");
    }
    if (role !== "anon") throw new Error(refusal);
  }
}
