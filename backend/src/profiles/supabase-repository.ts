import { DEFAULT_HAND_ORDER, parseHandOrder, type UserSettings } from "./hand-order.js";
import { ProfileLookupError, type Profile, type ProfileRepository } from "./repository.js";

/**
 * Dépôt de profils adossé à l'API REST de Supabase (PostgREST, `<SUPABASE_URL>/rest/v1`).
 *
 * Moindre privilège : chaque requête porte la clé **publique** du projet (`apikey`, clé
 * publishable ou ancienne clé anon) et le **jeton d'accès du joueur** (`Authorization`).
 * PostgREST prend alors le rôle `authenticated` de ce joueur : la RLS s'applique, et le serveur
 * ne peut lire que ce que le joueur lui-même pourrait lire. La clé `service_role` n'est jamais
 * utilisée (voir `config.ts`).
 *
 * Pas de dépendance à `@supabase/supabase-js` : deux lectures simples suffisent, via `fetch`
 * (injectable, ce qui permet de tester sans réseau).
 */

export type SupabaseProfileRepositoryOptions = {
  /** URL du projet, sans `/` final (ex. `https://<ref>.supabase.co`). */
  url: string;
  /** Clé publique du projet (publishable `sb_publishable_…` ou ancienne clé anon). */
  publishableKey: string;
  /** Délai maximal d'une requête (3 s par défaut) : au-delà, la lecture échoue. */
  timeoutMs?: number;
  /** `fetch` utilisé (celui de Node par défaut ; remplacé dans les tests). */
  fetch?: typeof fetch;
};

/** Délai par défaut : la lecture du profil retarde l'entrée à la table, elle doit rester courte. */
export const DEFAULT_LOOKUP_TIMEOUT_MS = 3000;

/** Les identifiants Supabase sont des UUID : toute autre valeur ne peut pas avoir de profil. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SupabaseProfileRepository implements ProfileRepository {
  private readonly restUrl: string;
  private readonly publishableKey: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(options: SupabaseProfileRepositoryOptions) {
    this.restUrl = `${options.url.replace(/\/+$/, "")}/rest/v1`;
    this.publishableKey = options.publishableKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async findProfile(userId: string, accessToken: string): Promise<Profile | null> {
    if (!UUID_PATTERN.test(userId)) return null;
    const rows = await this.select("profiles", "id,username", "id", userId, accessToken);
    const row = rows[0];
    if (row === undefined) return null;
    if (row.id !== userId || typeof row.username !== "string") {
      throw new ProfileLookupError("Réponse inattendue de Supabase (profil)");
    }
    return { id: userId, username: row.username };
  }

  async findSettings(userId: string, accessToken: string): Promise<UserSettings | null> {
    if (!UUID_PATTERN.test(userId)) return null;
    const rows = await this.select(
      "settings",
      "user_id,hand_order",
      "user_id",
      userId,
      accessToken,
    );
    const row = rows[0];
    if (row === undefined) return null;
    if (row.user_id !== userId) {
      throw new ProfileLookupError("Réponse inattendue de Supabase (paramètres)");
    }
    // La contrainte SQL garantit déjà la forme ; par prudence, une valeur invalide donne le défaut.
    return { handOrder: parseHandOrder(row.hand_order) ?? DEFAULT_HAND_ORDER };
  }

  /** `GET /rest/v1/<table>?select=<columns>&<key>=eq.<value>` avec le jeton du joueur. */
  private async select(
    table: string,
    columns: string,
    key: string,
    value: string,
    accessToken: string,
  ): Promise<Record<string, unknown>[]> {
    const url = new URL(`${this.restUrl}/${table}`);
    url.searchParams.set("select", columns);
    url.searchParams.set(key, `eq.${value}`);

    let response: Response;
    try {
      response = await this.fetch(url, {
        method: "GET",
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProfileLookupError(`Supabase injoignable (${table})`, { cause: error });
    }
    if (!response.ok) {
      throw new ProfileLookupError(`Supabase a répondu ${response.status} (${table})`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new ProfileLookupError(`Réponse illisible de Supabase (${table})`, { cause: error });
    }
    if (
      !Array.isArray(body) ||
      body.length > 1 ||
      body.some((row) => typeof row !== "object" || row === null)
    ) {
      throw new ProfileLookupError(`Réponse inattendue de Supabase (${table})`);
    }
    return body as Record<string, unknown>[];
  }
}
