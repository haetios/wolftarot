import type { SupabaseClaims } from "./verify-token.js";

/**
 * Identité d'un joueur authentifié, gardée côté serveur (`client.auth`).
 * Elle n'est jamais synchronisée telle quelle : seul le pseudo est recopié dans l'état public.
 */
export type PlayerIdentity = {
  /** Identifiant Supabase de l'utilisateur (`sub` du jeton). */
  id: string;
  /** Pseudo, ou `null` s'il est inconnu : la room choisit alors un pseudo de repli. */
  name: string | null;
};

/** Longueur maximale d'un pseudo affiché. */
export const MAX_NAME_LENGTH = 24;

/**
 * Clés de `user_metadata` lues pour le pseudo, par ordre de préférence.
 * - `username` : convention retenue pour l'inscription Wolftarot (`options.data.username`).
 * - `user_name`, `preferred_username` : pseudos publics fournis par certains fournisseurs OAuth.
 * `name` et `full_name` sont volontairement ignorés : c'est souvent le vrai nom de la personne,
 * qu'on n'affiche pas à des inconnus.
 */
const NAME_KEYS = ["username", "user_name", "preferred_username"] as const;

/**
 * Identité du joueur à partir d'un jeton vérifié.
 *
 * B13 : le pseudo vient de `user_metadata` (modifiable par l'utilisateur, non unique).
 * B14 branchera ici la lecture de la table `profiles` (pseudo unique), d'où la signature
 * asynchrone : `user_metadata` restera la valeur de repli.
 */
export async function resolvePlayerIdentity(claims: SupabaseClaims): Promise<PlayerIdentity> {
  return { id: claims.sub, name: nameFromClaims(claims) };
}

/** Pseudo lu dans `user_metadata`, ou `null`. */
export function nameFromClaims(claims: SupabaseClaims): string | null {
  const metadata = claims.user_metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  for (const key of NAME_KEYS) {
    const name = cleanName(metadata[key]);
    if (name !== null) return name;
  }
  return null;
}

/** Pseudo nettoyé (caractères de contrôle retirés, espaces réduits, longueur bornée), ou `null`. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/\s+/g, " ")
    .replace(/\p{Cc}/gu, "")
    .trim();
  // Découpe par caractère (et non par unité UTF-16) pour ne pas couper un emoji en deux.
  const bounded = [...name].slice(0, MAX_NAME_LENGTH).join("").trim();
  return bounded.length > 0 ? bounded : null;
}
