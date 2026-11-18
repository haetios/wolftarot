import { verifierKeysFromEnv } from "./config.js";
import { resolvePlayerIdentity, type PlayerIdentity } from "./identity.js";
import { createTokenVerifier, type TokenVerifier } from "./verify-token.js";

let defaultVerifier: TokenVerifier | undefined;

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

/** Vérifie le jeton d'un client et renvoie son identité ; lève une `AuthError` en cas de refus. */
export async function authenticate(
  token: unknown,
  verify: TokenVerifier = defaultTokenVerifier(),
): Promise<PlayerIdentity> {
  return resolvePlayerIdentity(await verify(token));
}
