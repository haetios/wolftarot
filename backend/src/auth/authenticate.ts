import { profileRepositoryFromEnv } from "../profiles/config.js";
import type { ProfileRepository } from "../profiles/repository.js";
import { verifierKeysFromEnv } from "./config.js";
import { resolvePlayerIdentity, type PlayerIdentity } from "./identity.js";
import { createTokenVerifier, type TokenVerifier } from "./verify-token.js";

let defaultVerifier: TokenVerifier | undefined;
/** `undefined` : pas encore lu dans l'environnement ; `null` : profils non configurés. */
let defaultProfiles: ProfileRepository | null | undefined;

/**
 * Vérificateur construit d'après l'environnement, une seule fois.
 * Une configuration invalide lève une erreur explicite ; une configuration absente laisse
 * le serveur démarrer, mais toute connexion est alors refusée (`notConfigured`).
 */
export function defaultTokenVerifier(): TokenVerifier {
  if (defaultVerifier === undefined) {
    const keys = verifierKeysFromEnv();
    if (keys.jwks === undefined && keys.secret === undefined) {
      console.warn(
        "⚠️  Authentification Supabase non configurée (SUPABASE_URL / SUPABASE_JWT_SECRET) : " +
          "toutes les connexions aux tables seront refusées.",
      );
    }
    defaultVerifier = createTokenVerifier(keys);
  }
  return defaultVerifier;
}

/**
 * Dépôt des profils construit d'après l'environnement, une seule fois (voir `profiles/config.ts`).
 * Une configuration invalide lève une erreur explicite ; sans `SUPABASE_PUBLISHABLE_KEY`, les
 * pseudos viennent de `user_metadata` (repli de développement, avec un avertissement).
 */
export function defaultProfileRepository(): ProfileRepository | null {
  if (defaultProfiles === undefined) {
    defaultProfiles = profileRepositoryFromEnv();
    if (defaultProfiles === null) {
      console.warn(
        "⚠️  Profils Supabase non configurés (SUPABASE_PUBLISHABLE_KEY) : les pseudos viennent " +
          "de user_metadata, modifiable par le joueur et non unique. À ne pas utiliser en production.",
      );
    }
  }
  return defaultProfiles;
}

/**
 * Remplace le dépôt des profils utilisé par défaut (tests d'intégration de la room, qui passent
 * par `TarotRoom.onAuth` sans pouvoir lui injecter de dépendance). `undefined` revient à la
 * configuration lue dans l'environnement.
 */
export function setDefaultProfileRepository(profiles: ProfileRepository | null | undefined): void {
  defaultProfiles = profiles;
}

/** Vérifie le jeton d'un client et renvoie son identité ; lève une `AuthError` en cas de refus. */
export async function authenticate(
  token: unknown,
  verify: TokenVerifier = defaultTokenVerifier(),
  profiles: ProfileRepository | null = defaultProfileRepository(),
): Promise<PlayerIdentity> {
  const claims = await verify(token);
  // Le vérificateur n'accepte qu'une chaîne non vide : c'est bien le jeton du joueur.
  return resolvePlayerIdentity(claims, { accessToken: token as string, profiles });
}
