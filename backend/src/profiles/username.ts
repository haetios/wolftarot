/**
 * Règles du pseudo (table `profiles`), partagées avec le frontend (inscription F4, profil).
 *
 * Ces règles sont aussi écrites en SQL dans `supabase/migrations/` (fonction
 * `public.is_valid_username`) : la base est la garantie finale, ce module sert à valider avant
 * l'envoi et à expliquer un refus. Un test vérifie que les deux versions restent identiques.
 *
 * Choix :
 * - 3 à 20 caractères ;
 * - lettres latines (accents du français compris : é, è, ç, œ…), chiffres, `_` et `-` ;
 * - commence et finit par une lettre ou un chiffre ;
 * - pas d'espace, ni de caractère invisible ou trompeur : U+202E (inversion du sens d'écriture),
 *   espaces de largeur nulle, accents combinants, lettres d'autres alphabets qui imitent les
 *   lettres latines (le « а » cyrillique), emoji… La liste est blanche : tout le reste est refusé.
 * - unicité sans tenir compte de la casse (`Alice` et `alice` sont le même pseudo), assurée
 *   par un index unique sur `lower(username)`.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Caractères autorisés en début et en fin de pseudo : lettres latines et chiffres. */
const EDGE = "0-9A-Za-zÀ-ÖØ-öø-ÿŒœŸ";
/** Caractères autorisés à l'intérieur : les mêmes, plus `_` et `-`. */
const INNER = `${EDGE}_-`;

/**
 * Motif du pseudo, sans la longueur. Écrit à l'identique dans la migration SQL
 * (les intervalles portent sur les points de code, en JavaScript comme en PostgreSQL).
 */
export const USERNAME_PATTERN_SOURCE = `^[${EDGE}]([${INNER}]*[${EDGE}])?$`;
const USERNAME_PATTERN = new RegExp(USERNAME_PATTERN_SOURCE, "u");

export type UsernameError =
  /** Ce n'est pas une chaîne. */
  | "notAString"
  | "tooShort"
  | "tooLong"
  /** Caractère hors liste blanche (espace, invisible, autre alphabet, emoji…). */
  | "invalidCharacter"
  /** Commence ou finit par `_` ou `-`. */
  | "invalidEdge";

export type UsernameCheck = { ok: true; username: string } | { ok: false; error: UsernameError };

/**
 * Forme canonique d'une saisie : espaces de bord retirés, puis normalisation NFC
 * (un « é » tapé en deux points de code, e + accent combinant, devient le « é » précomposé).
 * La migration SQL applique la même normalisation au pseudo reçu à l'inscription.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().normalize("NFC");
}

/** Longueur en points de code, comme `char_length` en PostgreSQL. */
function length(value: string): number {
  return [...value].length;
}

/** Vrai si la valeur, déjà normalisée, est un pseudo valide (même règle que la contrainte SQL). */
export function isValidUsername(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const size = length(value);
  return size >= USERNAME_MIN_LENGTH && size <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(value);
}

/** Normalise une saisie et la valide ; en cas de refus, donne la raison (pour un message clair). */
export function checkUsername(raw: unknown): UsernameCheck {
  if (typeof raw !== "string") return { ok: false, error: "notAString" };
  const username = normalizeUsername(raw);
  if (isValidUsername(username)) return { ok: true, username };

  const size = length(username);
  if (size < USERNAME_MIN_LENGTH) return { ok: false, error: "tooShort" };
  if (size > USERNAME_MAX_LENGTH) return { ok: false, error: "tooLong" };
  const inner = new RegExp(`^[${INNER}]+$`, "u");
  return { ok: false, error: inner.test(username) ? "invalidEdge" : "invalidCharacter" };
}
