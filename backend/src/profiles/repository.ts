import type { UserSettings } from "./hand-order.js";

/**
 * Accès aux profils et aux paramètres des joueurs, isolé derrière une petite interface :
 * - en production, `SupabaseProfileRepository` interroge Supabase **avec le jeton du joueur**
 *   (la RLS s'applique : jamais de clé `service_role`) ;
 * - dans les tests, une implémentation en mémoire (`test/helpers/profiles.ts`), sans réseau.
 */

/** Profil public d'un joueur (table `profiles`). */
export type Profile = {
  /** Identifiant Supabase (`auth.users.id`, `sub` du jeton). */
  id: string;
  /** Pseudo unique (sans tenir compte de la casse), affiché aux tables. */
  username: string;
};

export interface ProfileRepository {
  /**
   * Profil d'un utilisateur, lu avec son propre jeton d'accès.
   * Renvoie `null` si le profil n'existe pas ; lève une `ProfileLookupError` si la lecture
   * est impossible (service injoignable, réponse inattendue…).
   */
  findProfile(userId: string, accessToken: string): Promise<Profile | null>;

  /**
   * Paramètres d'un utilisateur, lus avec son propre jeton d'accès (la RLS ne montre que les
   * siens). `null` s'ils n'existent pas ; une valeur stockée invalide est remplacée par la valeur
   * par défaut. Lève une `ProfileLookupError` si la lecture est impossible.
   */
  findSettings(userId: string, accessToken: string): Promise<UserSettings | null>;
}

/** Lecture impossible (réseau, délai dépassé, erreur HTTP, réponse mal formée). */
export class ProfileLookupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProfileLookupError";
  }
}
