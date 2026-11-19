import type { UserSettings } from "../../src/profiles/hand-order.js";
import {
  ProfileLookupError,
  type Profile,
  type ProfileRepository,
} from "../../src/profiles/repository.js";

/**
 * Dépôt de profils en mémoire pour les tests : aucun appel réseau.
 * `unavailable` simule un Supabase injoignable ; `calls` garde les lectures (avec le jeton
 * utilisé) pour vérifier que le serveur interroge bien Supabase avec le jeton du joueur.
 */
export class InMemoryProfileRepository implements ProfileRepository {
  readonly profiles = new Map<string, Profile>();
  readonly settings = new Map<string, UserSettings>();
  readonly calls: { method: "findProfile" | "findSettings"; userId: string; token: string }[] = [];
  unavailable = false;

  /** Ajoute un profil (et renvoie le dépôt, pour chaîner). */
  withProfile(id: string, username: string): this {
    this.profiles.set(id, { id, username });
    return this;
  }

  async findProfile(userId: string, accessToken: string): Promise<Profile | null> {
    this.calls.push({ method: "findProfile", userId, token: accessToken });
    this.failIfUnavailable();
    return this.profiles.get(userId) ?? null;
  }

  async findSettings(userId: string, accessToken: string): Promise<UserSettings | null> {
    this.calls.push({ method: "findSettings", userId, token: accessToken });
    this.failIfUnavailable();
    return this.settings.get(userId) ?? null;
  }

  private failIfUnavailable(): void {
    if (this.unavailable) throw new ProfileLookupError("Supabase injoignable (simulé)");
  }
}

/**
 * Dépôt partagé par tous les tests (branché par `test/setup.ts`). `signTestToken` y enregistre le
 * profil de chaque utilisateur de test, sauf demande contraire (`withoutProfile`).
 */
export const testProfiles = new InMemoryProfileRepository();
