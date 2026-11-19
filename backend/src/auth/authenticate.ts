import { ErrorCode, ServerError } from "colyseus";

import { profileRepositoryFromEnv } from "../profiles/config.js";
import type { ProfileRepository } from "../profiles/repository.js";
import { verifierKeysFromEnv } from "./config.js";
import { resolvePlayerIdentity, type PlayerIdentity } from "./identity.js";
import { AuthError, createTokenVerifier, type TokenVerifier } from "./verify-token.js";

let defaultVerifier: TokenVerifier | undefined;
/** `undefined` : pas encore lu dans l'environnement. */
let defaultProfiles: ProfileRepository | undefined;

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
 * `SUPABASE_PUBLISHABLE_KEY` est obligatoire : une configuration absente ou invalide arrête le
 * serveur au démarrage (appel dans `app.config.ts`).
 */
export function defaultProfileRepository(): ProfileRepository {
  defaultProfiles ??= profileRepositoryFromEnv();
  return defaultProfiles;
}

/**
 * Remplace le dépôt des profils utilisé par défaut (tests, qui passent par `TarotRoom.onAuth`
 * sans pouvoir lui injecter de dépendance). `undefined` revient à la configuration lue dans
 * l'environnement.
 */
export function setDefaultProfileRepository(profiles: ProfileRepository | undefined): void {
  defaultProfiles = profiles;
}

/** Vérifie le jeton d'un client et renvoie son identité ; lève une `AuthError` en cas de refus. */
export async function authenticate(
  token: unknown,
  verify: TokenVerifier = defaultTokenVerifier(),
  profiles: ProfileRepository = defaultProfileRepository(),
): Promise<PlayerIdentity> {
  const claims = await verify(token);
  // Le vérificateur n'accepte qu'une chaîne non vide : c'est bien le jeton du joueur.
  return resolvePlayerIdentity(claims, { accessToken: token as string, profiles });
}

/**
 * Erreur Colyseus renvoyée au client pour un refus d'authentification : code `AUTH_FAILED` et
 * message `Authentification refusée (<raison>) : …` (la raison est exploitable par le frontend).
 */
export function authFailure(error: AuthError): ServerError {
  return new ServerError(
    ErrorCode.AUTH_FAILED,
    `Authentification refusée (${error.reason}) : ${error.message}`,
  );
}
