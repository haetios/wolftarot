import type { ProfileRepository } from "../profiles/repository.js";
import { AuthError, type SupabaseClaims } from "./verify-token.js";

/**
 * Identité d'un joueur authentifié, gardée côté serveur (`client.auth`).
 * Elle n'est jamais synchronisée telle quelle : seul le pseudo est recopié dans l'état public.
 */
export type PlayerIdentity = {
  /** Identifiant Supabase de l'utilisateur (`sub` du jeton). */
  id: string;
  /** Pseudo, lu dans la table `profiles`. */
  name: string;
};

/** Longueur maximale d'un pseudo affiché. */
export const MAX_NAME_LENGTH = 24;

export type IdentitySources = {
  /** Jeton d'accès vérifié du joueur : le profil est lu avec lui (la RLS s'applique). */
  accessToken: string;
  /** Dépôt des profils (obligatoire : `SUPABASE_PUBLISHABLE_KEY`). */
  profiles: ProfileRepository;
};

/**
 * Identité du joueur à partir d'un jeton vérifié. L'identifiant est toujours le `sub` du jeton ;
 * le pseudo vient uniquement de la table `profiles`, seule source de vérité des pseudos
 * (décisions de l'humain du 19/11/2026) :
 *
 * | situation                               | résultat                                    |
 * | --------------------------------------- | ------------------------------------------- |
 * | profil trouvé                           | son pseudo                                  |
 * | profil absent                           | connexion refusée (`profileNotFound`)       |
 * | Supabase injoignable / réponse invalide | connexion refusée (`profileUnavailable`)    |
 *
 * - Profil absent : le déclencheur SQL crée le profil dans la même transaction que le compte,
 *   donc un jeton valide sans profil désigne un compte supprimé ou une anomalie.
 * - Supabase injoignable : on refuse plutôt que d'afficher un pseudo provisoire ; en pratique,
 *   la connexion au site est elle-même indisponible dans ce cas.
 * - `user_metadata` n'est jamais utilisé : le joueur peut le modifier à tout moment et il n'est
 *   pas unique, ce qui permettrait de se faire passer pour un autre joueur.
 */
export async function resolvePlayerIdentity(
  claims: SupabaseClaims,
  { accessToken, profiles }: IdentitySources,
): Promise<PlayerIdentity> {
  const id = claims.sub;
  let profile;
  try {
    profile = await profiles.findProfile(id, accessToken);
  } catch (error) {
    // Jamais le jeton dans les journaux.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Profil illisible pour ${id} (${reason}) : connexion refusée.`);
    throw new AuthError(
      "profileUnavailable",
      "Service momentanément indisponible, réessayez dans un instant",
    );
  }
  if (profile === null) {
    throw new AuthError("profileNotFound", "Aucun profil pour ce compte");
  }
  const name = cleanName(profile.username);
  if (name === null) {
    // Impossible avec les contraintes SQL du pseudo ; par prudence, on refuse plutôt qu'afficher vide.
    throw new AuthError("profileNotFound", "Profil sans pseudo valide");
  }
  return { id, name };
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
