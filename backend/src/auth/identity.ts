import type { ProfileRepository } from "../profiles/repository.js";
import { AuthError, type SupabaseClaims } from "./verify-token.js";

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

export type IdentitySources = {
  /** Jeton d'accès vérifié du joueur : le profil est lu avec lui (la RLS s'applique). */
  accessToken: string;
  /** Dépôt des profils, ou `null` s'il n'est pas configuré (`SUPABASE_PUBLISHABLE_KEY` absente). */
  profiles: ProfileRepository | null;
};

/**
 * Identité du joueur à partir d'un jeton vérifié. L'identifiant est toujours le `sub` du jeton ;
 * le pseudo vient de la table `profiles` (B14), seule source de vérité des pseudos :
 *
 * | situation                               | résultat                                         |
 * | --------------------------------------- | ------------------------------------------------ |
 * | profil trouvé                           | son pseudo                                       |
 * | profil absent                           | connexion refusée (`profileNotFound`)            |
 * | Supabase injoignable / réponse invalide | connexion acceptée, pseudo `null` (repli de la room) |
 * | dépôt non configuré (développement)     | pseudo de `user_metadata`, comme en B13          |
 *
 * Pourquoi :
 * - Profil absent : le déclencheur SQL crée le profil dans la même transaction que le compte,
 *   donc un jeton valide sans profil désigne un compte supprimé (son jeton reste valide jusqu'à
 *   expiration) ou une anomalie : on refuse.
 * - Supabase injoignable : le jeton a été vérifié localement, l'identité est sûre ; seul le
 *   pseudo manque. On laisse jouer (panne passagère) avec le pseudo de repli de la room.
 * - `user_metadata` n'est plus utilisé dès que les profils sont configurés, même en cas de
 *   panne : le joueur peut le modifier à tout moment (`auth.updateUser`) et il n'est pas unique,
 *   ce qui permettrait de se faire passer pour un autre joueur. Il ne reste qu'un repli de
 *   développement, quand aucun projet Supabase n'est branché.
 */
export async function resolvePlayerIdentity(
  claims: SupabaseClaims,
  { accessToken, profiles }: IdentitySources,
): Promise<PlayerIdentity> {
  const id = claims.sub;
  if (profiles === null) return { id, name: nameFromClaims(claims) };

  let profile;
  try {
    profile = await profiles.findProfile(id, accessToken);
  } catch (error) {
    // Jamais le jeton dans les journaux.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Profil illisible pour ${id} (${reason}) : pseudo de repli.`);
    return { id, name: null };
  }
  if (profile === null) {
    throw new AuthError("profileNotFound", "Aucun profil pour ce compte");
  }
  return { id, name: cleanName(profile.username) };
}

/** Pseudo lu dans `user_metadata`, ou `null` (repli de développement, voir ci-dessus). */
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
