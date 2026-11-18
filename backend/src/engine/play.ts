import { cardId, cardPoints, isOudler, type Card, type SuitCard } from "./cards.js";
import { IllegalActionError } from "./errors.js";
import { assertLegalPlay, getLegalCards } from "./legal-moves.js";
import { trickWinner, type PlayedCard } from "./trick.js";

export type Camp = "attack" | "defense";

export type CompletedTrick = {
  readonly cards: readonly PlayedCard[];
  readonly winner: number;
};

/**
 * Jeu de la carte, immuable : chaque carte jouée renvoie un nouvel état.
 * Les sièges sont dans l'ordre de jeu : le suivant est `(siège + 1) % joueurs`.
 */
export type PlayState = {
  /** Mains restantes, une par siège. */
  readonly hands: readonly (readonly Card[])[];
  /** Sièges de l'attaque (preneur, et partenaire à 5 joueurs). Information serveur. */
  readonly attackers: readonly number[];
  /** À 5 joueurs : carte appelée (règle de l'entame du premier pli). */
  readonly calledCard: SuitCard | null;
  readonly currentTrick: readonly PlayedCard[];
  readonly completedTricks: readonly CompletedTrick[];
  /** Siège qui doit jouer, ou `null` quand la donne est terminée. */
  readonly currentSeat: number | null;
};

export type StartPlayOptions = {
  readonly hands: readonly (readonly Card[])[];
  readonly attackers: readonly number[];
  /** Le joueur qui entame le premier pli (celui qui suit le donneur). */
  readonly firstLeader: number;
  readonly calledCard?: SuitCard | null;
};

export function startPlay(options: StartPlayOptions): PlayState {
  const { hands, attackers, firstLeader, calledCard = null } = options;
  if (!Number.isInteger(firstLeader) || firstLeader < 0 || firstLeader >= hands.length) {
    throw new RangeError(`Premier joueur invalide : ${firstLeader}`);
  }
  const sizes = new Set(hands.map((hand) => hand.length));
  if (sizes.size !== 1) throw new RangeError("Toutes les mains doivent avoir la même taille");
  return {
    hands: hands.map((hand) => [...hand]),
    attackers: [...attackers],
    calledCard,
    currentTrick: [],
    completedTricks: [],
    currentSeat: firstLeader,
  };
}

export function campOf(state: Pick<PlayState, "attackers">, seat: number): Camp {
  return state.attackers.includes(seat) ? "attack" : "defense";
}

function isFirstTrick(state: PlayState): boolean {
  return state.completedTricks.length === 0;
}

function isLastTrick(state: PlayState): boolean {
  // Pendant le dernier pli, chaque joueur a au plus une carte.
  return state.hands.every((hand) => hand.length <= 1);
}

function legalOptions(state: PlayState) {
  return isFirstTrick(state) && state.calledCard !== null
    ? { calledCardOnFirstLead: state.calledCard }
    : {};
}

/** Cartes jouables par le joueur dont c'est le tour. */
export function legalCardsForCurrentPlayer(state: PlayState): Card[] {
  if (state.currentSeat === null) return [];
  const hand = state.hands[state.currentSeat] ?? [];
  return getLegalCards(
    hand,
    state.currentTrick.map(({ card }) => card),
    legalOptions(state),
  );
}

/**
 * Excuse au dernier pli (règles FFT) : elle change de camp, sauf si elle est entamée
 * par un camp qui a remporté tous les plis précédents (chelem) : elle remporte alors le pli.
 */
function excuseWinsLastTrick(state: PlayState, trick: readonly PlayedCard[]): boolean {
  const lead = trick[0];
  if (!lead || lead.card.kind !== "excuse") return false;
  const camp = campOf(state, lead.seat);
  return (
    state.completedTricks.length > 0 &&
    state.completedTricks.every((t) => campOf(state, t.winner) === camp)
  );
}

export function playCard(state: PlayState, seat: number, card: Card): PlayState {
  if (state.currentSeat === null) {
    throw new IllegalActionError("playFinished", "La donne est terminée");
  }
  if (seat !== state.currentSeat) {
    throw new IllegalActionError("notYourTurn", `Ce n'est pas au siège ${seat} de jouer`);
  }
  const hand = state.hands[seat] ?? [];
  assertLegalPlay(
    hand,
    state.currentTrick.map(({ card: c }) => c),
    card,
    legalOptions(state),
  );

  const id = cardId(card);
  const hands = state.hands.map((h, s) => (s === seat ? h.filter((c) => cardId(c) !== id) : h));
  const trick = [...state.currentTrick, { seat, card }];
  const playerCount = state.hands.length;

  if (trick.length < playerCount) {
    return { ...state, hands, currentTrick: trick, currentSeat: (seat + 1) % playerCount };
  }

  const excuseWins = isLastTrick(state) && excuseWinsLastTrick(state, trick);
  const winner = trickWinner(trick, excuseWins);
  const completedTricks = [...state.completedTricks, { cards: trick, winner }];
  const finished = hands.every((h) => h.length === 0);

  return {
    ...state,
    hands,
    currentTrick: [],
    completedTricks,
    currentSeat: finished ? null : winner,
  };
}

export function isPlayFinished(state: PlayState): boolean {
  return state.currentSeat === null;
}

export type CampCards = {
  readonly attack: Card[];
  readonly defense: Card[];
};

/**
 * Cartes remportées par chaque camp en fin de donne (hors chien et écart, comptés en B8).
 *
 * Règles de l'Excuse (FFT) :
 * - jouée avant le dernier pli, elle reste à son camp ; si l'autre camp remporte ce pli,
 *   le camp de l'Excuse lui donne en échange une carte à 0,5 point ;
 * - jouée au dernier pli, elle va au camp qui remporte le pli (elle change de camp),
 *   sauf chelem où elle remporte elle-même le pli.
 */
export function campCards(state: PlayState): CampCards {
  if (!isPlayFinished(state)) {
    throw new IllegalActionError("playNotFinished", "La donne n'est pas terminée");
  }
  const won: Record<Camp, Card[]> = { attack: [], defense: [] };
  let excuseDebt: { from: Camp; to: Camp } | null = null;
  const lastIndex = state.completedTricks.length - 1;

  for (const [index, trick] of state.completedTricks.entries()) {
    const winnerCamp = campOf(state, trick.winner);
    for (const { seat, card } of trick.cards) {
      if (card.kind === "excuse" && index !== lastIndex) {
        const ownerCamp = campOf(state, seat);
        won[ownerCamp].push(card);
        if (ownerCamp !== winnerCamp) excuseDebt = { from: ownerCamp, to: winnerCamp };
      } else {
        won[winnerCamp].push(card);
      }
    }
  }

  if (excuseDebt !== null) {
    const { from, to } = excuseDebt;
    // Carte d'échange : une carte à 0,5 point (hors bout) remportée par le camp de l'Excuse.
    // Si ce camp n'en a aucune, l'échange n'a pas lieu.
    const index = won[from].findIndex((card) => cardPoints(card) === 0.5 && !isOudler(card));
    if (index !== -1) {
      const [given] = won[from].splice(index, 1);
      won[to].push(given!);
    }
  }

  return won;
}
