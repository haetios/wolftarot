import { ErrorCode, ServerError, matchMaker } from "colyseus";

import { authFailure, defaultTokenVerifier } from "../auth/authenticate.js";
import { AuthError, type TokenVerifier } from "../auth/verify-token.js";

/**
 * Limite d'essais de code de table privée (décision de l'humain du 19/11/2026) :
 * **5 codes erronés par minute et par compte**. Un joueur qui entre un bon code n'est jamais
 * limité ; un code qui existe mais dont la table est pleine ne compte pas comme une erreur.
 *
 * Pourquoi ici : rejoindre une table par son code passe par `POST /matchmake/joinById/<code>`.
 * Colyseus cherche la table **avant** d'appeler `TarotRoom.onAuth`, et son routeur passe avant
 * Express : ni la room ni un middleware ne voient un code inconnu. On enveloppe donc la méthode
 * `joinById` du contrôleur de matchmaking, appelée par cette route.
 *
 * La clé est le compte (`sub` du jeton vérifié), pas l'adresse IP : elle n'arrive ici que par des
 * en-têtes que le client peut falsifier. Sans jeton valide, l'essai est refusé tout de suite
 * (comme le ferait `onAuth`) : personne ne peut tester des codes sans compte.
 *
 * La route `POST /matchmake/reconnect/<code>` ne demande pas de compte, et Colyseus y répond
 * différemment selon que la table existe ou non : ce serait un moyen de tester des codes sans
 * limite. Toute erreur de reconnexion y reçoit donc la même réponse (`RECONNECT_REFUSED`) ; une
 * reconnexion valide (jeton de reconnexion du SDK) passe sans changement.
 */

export const MAX_CODE_FAILURES = 5;
export const CODE_FAILURE_WINDOW_MS = 60_000;

/** Trop de codes erronés : réessayer plus tard. */
export const TOO_MANY_CODE_ATTEMPTS = 4290;

/** Réponse unique à toute reconnexion refusée (table inconnue, jeton absent, invalide ou expiré). */
export const RECONNECT_REFUSED = {
  code: ErrorCode.MATCHMAKE_EXPIRED,
  message: "reconnection token invalid or expired.",
} as const;

/** Compte des échecs par clé, sur une fenêtre glissante. */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    readonly maxFailures: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Échecs encore dans la fenêtre (les plus anciens sont oubliés). */
  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const kept = (this.failures.get(key) ?? []).filter((time) => time > since);
    if (kept.length > 0) this.failures.set(key, kept);
    else this.failures.delete(key);
    return kept;
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.maxFailures;
  }

  recordFailure(key: string): void {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }

  reset(): void {
    this.failures.clear();
  }
}

/** Limiteur du serveur (remis à zéro par les tests). */
export const codeAttempts = new AttemptLimiter(MAX_CODE_FAILURES, CODE_FAILURE_WINDOW_MS);

type InvokeMethod = (
  method: string,
  roomName: string,
  clientOptions?: unknown,
  authContext?: { token?: string | undefined },
) => Promise<unknown>;

const installed = new WeakSet<object>();

/** Installe la limite sur le contrôleur de matchmaking (une seule fois par contrôleur). */
export function installCodeAttemptLimit(
  limiter: AttemptLimiter = codeAttempts,
  verify: () => TokenVerifier = defaultTokenVerifier,
): void {
  const controller = matchMaker.controller as unknown as { invokeMethod: InvokeMethod };
  if (installed.has(controller)) return;
  installed.add(controller);

  const original = controller.invokeMethod.bind(controller);
  controller.invokeMethod = async (method, code, clientOptions, authContext) => {
    if (method === "reconnect") {
      try {
        return await original(method, code, clientOptions, authContext);
      } catch {
        // Même réponse que la table existe ou non : pas d'oracle sur les codes.
        throw new ServerError(RECONNECT_REFUSED.code, RECONNECT_REFUSED.message);
      }
    }
    if (method !== "joinById") return original(method, code, clientOptions, authContext);

    let userId: string;
    try {
      userId = (await verify()(authContext?.token)).sub;
    } catch (error) {
      if (error instanceof AuthError) throw authFailure(error);
      throw error;
    }

    if (limiter.isBlocked(userId)) {
      throw new ServerError(
        TOO_MANY_CODE_ATTEMPTS,
        "Trop de codes erronés : réessayez dans une minute",
      );
    }
    if ((await matchMaker.query({ roomId: code })).length === 0) {
      limiter.recordFailure(userId);
      throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, `room "${code}" not found`);
    }
    return original(method, code, clientOptions, authContext);
  };
}
