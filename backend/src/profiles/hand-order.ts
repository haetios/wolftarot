import { SUITS, type Card, type Suit } from "../engine/cards.js";

/**
 * Ordre de base des cartes de la main (paramètre du joueur, spec : « Choisir l'ordre de base
 * des cartes de sa main »). Modèle partagé avec le frontend (page paramètres, F18).
 *
 * Le modèle tient en deux champs :
 * - `groups` : l'ordre d'affichage des six familles de cartes, de gauche à droite : les quatre
 *   couleurs, les atouts (`trumps`) et l'Excuse (`excuse`). Une seule liste règle donc à la fois
 *   l'ordre des couleurs, la position des atouts (au début, à la fin ou entre deux couleurs) et
 *   celle de l'Excuse (à côté des atouts ou à l'autre bout de la main).
 * - `direction` : sens des valeurs dans chaque famille. `ascending` : de l'As au Roi et du Petit
 *   au 21 ; `descending` : l'inverse.
 *
 * Il est stocké tel quel en JSON (`settings.hand_order`) : la migration SQL refuse toute autre
 * forme (fonction `public.is_valid_hand_order`).
 */

export const HAND_GROUPS = [...SUITS, "trumps", "excuse"] as const;
export type HandGroup = Suit | "trumps" | "excuse";

export const SORT_DIRECTIONS = ["ascending", "descending"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type HandOrder = {
  /** Les six familles, chacune une seule fois, dans l'ordre d'affichage. */
  readonly groups: readonly HandGroup[];
  readonly direction: SortDirection;
};

/**
 * Ordre par défaut : couleurs alternées (noir, rouge, noir, rouge) pour bien les distinguer,
 * puis les atouts, puis l'Excuse au bout ; valeurs croissantes. Repris à l'identique comme valeur
 * par défaut de la colonne SQL (un test le vérifie).
 */
export const DEFAULT_HAND_ORDER: HandOrder = {
  groups: ["spades", "hearts", "clubs", "diamonds", "trumps", "excuse"],
  direction: "ascending",
};

/** Paramètres d'un joueur (table `settings`). */
export type UserSettings = {
  handOrder: HandOrder;
};

export const DEFAULT_SETTINGS: UserSettings = { handOrder: DEFAULT_HAND_ORDER };

const ORDER_KEYS = ["direction", "groups"];

/**
 * Valide une valeur non fiable (JSON lu en base ou envoyé par un client) et la renvoie sous une
 * forme propre ; `null` si elle est invalide. Règle identique à la contrainte SQL :
 * un objet avec exactement `groups` et `direction`, `groups` étant une permutation des six familles.
 */
export function parseHandOrder(value: unknown): HandOrder | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== ORDER_KEYS.length || keys.some((key, i) => key !== ORDER_KEYS[i])) {
    return null;
  }

  const { groups, direction } = value as Record<string, unknown>;
  if (!SORT_DIRECTIONS.includes(direction as SortDirection)) return null;
  if (!Array.isArray(groups) || groups.length !== HAND_GROUPS.length) return null;
  const seen = new Set<unknown>(groups);
  if (seen.size !== HAND_GROUPS.length || HAND_GROUPS.some((group) => !seen.has(group))) {
    return null;
  }
  return { groups: [...(groups as HandGroup[])], direction: direction as SortDirection };
}

export function isHandOrder(value: unknown): value is HandOrder {
  return parseHandOrder(value) !== null;
}

/** Famille d'une carte. */
export function handGroup(card: Card): HandGroup {
  switch (card.kind) {
    case "suit":
      return card.suit;
    case "trump":
      return "trumps";
    case "excuse":
      return "excuse";
  }
}

/** Valeur d'une carte dans sa famille (l'Excuse est seule dans la sienne). */
function rankOf(card: Card): number {
  return card.kind === "excuse" ? 0 : card.rank;
}

/** Comparateur de cartes selon un ordre de main (pour `Array.prototype.sort`). */
export function compareCards(order: HandOrder): (a: Card, b: Card) => number {
  const position = new Map<HandGroup, number>(order.groups.map((group, i) => [group, i]));
  const sign = order.direction === "ascending" ? 1 : -1;
  return (a, b) =>
    position.get(handGroup(a))! - position.get(handGroup(b))! || sign * (rankOf(a) - rankOf(b));
}

/** Copie triée d'une main ; la main reçue n'est pas modifiée. */
export function sortHand(hand: readonly Card[], order: HandOrder = DEFAULT_HAND_ORDER): Card[] {
  return [...hand].sort(compareCards(order));
}
