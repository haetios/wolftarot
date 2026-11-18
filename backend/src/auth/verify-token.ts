import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/**
 * Vérification des jetons d'accès (JWT) émis par Supabase Auth.
 *
 * Deux types de clés Supabase sont pris en charge :
 * - clés asymétriques (ES256, RS256), publiées dans le JWKS du projet : le défaut des projets récents ;
 * - ancien secret partagé HS256 (`SUPABASE_JWT_SECRET`).
 *
 * Logique pure : les clés sont injectées (voir `config.ts`), ce qui permet de tester sans réseau.
 */

/** Audience des jetons d'un utilisateur connecté (les clés `anon` et `service_role` n'en ont pas). */
export const SUPABASE_AUDIENCE = "authenticated";

/** Algorithmes des clés asymétriques Supabase. */
export const ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"] as const;
/** Algorithme de l'ancien secret partagé. */
export const SYMMETRIC_ALGORITHM = "HS256";

/** Décalage d'horloge toléré entre Supabase et ce serveur pour `exp`, `nbf` et `iat`. */
const CLOCK_TOLERANCE_SECONDS = 5;
/** Un jeton Supabase fait environ 1 Ko : au-delà, on refuse sans même le décoder. */
const MAX_TOKEN_LENGTH = 8192;

export type AuthFailureReason =
  /** Aucun jeton fourni. */
  | "missingToken"
  /** Ce n'est pas un JWT lisible. */
  | "malformedToken"
  | "expiredToken"
  /** Signature fausse, ou clé inconnue du JWKS. */
  | "invalidSignature"
  /** Audience, émetteur ou identifiant (`sub`) invalide ou absent. */
  | "invalidClaims"
  /** Algorithme refusé (`none`, ou type de clé non configuré sur ce serveur). */
  | "unsupportedAlgorithm"
  /** Utilisateur anonyme Supabase : un compte est exigé pour jouer. */
  | "anonymousUser"
  /** Ni JWKS ni secret configuré : toute connexion est refusée. */
  | "notConfigured"
  /** Jeton valide, mais aucun profil (compte supprimé, par exemple) : voir `identity.ts`. */
  | "profileNotFound"
  /** Échec inattendu (JWKS injoignable, par exemple). */
  | "verificationFailed";

/** Connexion refusée : la raison est exploitable par le client, le message est lisible. */
export class AuthError extends Error {
  constructor(
    readonly reason: AuthFailureReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AuthError";
  }
}

/** Contenu utile d'un jeton Supabase vérifié. */
export type SupabaseClaims = JWTPayload & {
  sub: string;
  email?: string;
  role?: string;
  is_anonymous?: boolean;
  /** Données libres de l'utilisateur (`options.data` à l'inscription) : modifiables par lui. */
  user_metadata?: Record<string, unknown>;
};

export type VerifierKeys = {
  /** Clés publiques du projet (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). */
  jwks?: JWTVerifyGetKey;
  /** Ancien secret partagé HS256, encodé en UTF-8. */
  secret?: Uint8Array;
  /** Émetteur attendu (`<SUPABASE_URL>/auth/v1`) : vérifié seulement s'il est fourni. */
  issuer?: string;
};

/** Vérifie un jeton et renvoie ses revendications ; lève une `AuthError` sinon. */
export type TokenVerifier = (token: unknown) => Promise<SupabaseClaims>;

export function createTokenVerifier(keys: VerifierKeys): TokenVerifier {
  const { jwks, secret, issuer } = keys;
  const algorithms: string[] = [
    ...(jwks ? ASYMMETRIC_ALGORITHMS : []),
    ...(secret ? [SYMMETRIC_ALGORITHM] : []),
  ];

  // La clé dépend de l'algorithme annoncé, mais seulement parmi ceux autorisés : un jeton HS256
  // n'est jamais vérifié avec une clé publique, et inversement (confusion d'algorithmes).
  const getKey: JWTVerifyGetKey = async (header, token) => {
    if (header.alg === SYMMETRIC_ALGORITHM && secret) return secret;
    if (jwks && (ASYMMETRIC_ALGORITHMS as readonly string[]).includes(header.alg ?? "")) {
      return jwks(header, token);
    }
    throw new AuthError("unsupportedAlgorithm", `Algorithme refusé : ${String(header.alg)}`);
  };

  return async (token) => {
    if (typeof token !== "string" || token.length === 0) {
      throw new AuthError("missingToken", "Aucun jeton d'authentification fourni");
    }
    if (token.length > MAX_TOKEN_LENGTH) {
      throw new AuthError("malformedToken", "Jeton trop long");
    }
    if (algorithms.length === 0) {
      throw new AuthError(
        "notConfigured",
        "Authentification non configurée (SUPABASE_URL ou SUPABASE_JWT_SECRET manquant)",
      );
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        algorithms,
        audience: SUPABASE_AUDIENCE,
        ...(issuer === undefined ? {} : { issuer }),
        requiredClaims: ["sub", "exp"],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      }));
    } catch (error) {
      throw toAuthError(error);
    }

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new AuthError("invalidClaims", "Identifiant utilisateur (sub) manquant");
    }
    const claims = payload as SupabaseClaims;
    // Choix B13 : les utilisateurs anonymes de Supabase (connexion sans compte) ne jouent pas,
    // car la spec impose de s'inscrire et de choisir un pseudo.
    if (claims.is_anonymous === true) {
      throw new AuthError("anonymousUser", "Un compte est nécessaire pour jouer");
    }
    return claims;
  };
}

/** Traduit les erreurs de `jose` en raisons de refus stables. */
function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const cause = { cause: error };
  if (error instanceof errors.JWTExpired) {
    return new AuthError("expiredToken", "Jeton expiré", cause);
  }
  if (error instanceof errors.JWTClaimValidationFailed) {
    return new AuthError("invalidClaims", `Revendication invalide : ${error.claim}`, cause);
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) {
    return new AuthError("invalidSignature", "Signature du jeton invalide", cause);
  }
  if (
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWKSMultipleMatchingKeys
  ) {
    return new AuthError("invalidSignature", "Clé de signature inconnue", cause);
  }
  if (error instanceof errors.JOSEAlgNotAllowed) {
    return new AuthError("unsupportedAlgorithm", "Algorithme de signature refusé", cause);
  }
  if (
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JOSENotSupported
  ) {
    return new AuthError("malformedToken", "Jeton mal formé", cause);
  }
  return new AuthError("verificationFailed", "Vérification du jeton impossible", cause);
}
