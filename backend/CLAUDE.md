# Wolftarot — Backend (Colyseus)

Gameplay du Tarot : règles, rooms, bots, vérification d'auth Supabase.

## Contexte permanent

@../spec.md
@../plan.md
@../CLAUDE.md

- Spécifications : [../spec.md](../spec.md)
- Plan : [../plan.md](../plan.md) — section **Backend** (sprints B0 → B30)

## Règle de travail : sprint par sprint, codeur + agent vérificateur (OBLIGATOIRE)

Voir la règle complète dans [../CLAUDE.md](../CLAUDE.md). En bref :

- **Codeur (Claude Code, session principale)** : un seul sprint à la fois, dans l'ordre du plan ; coche les tâches dans `../plan.md` ; tests + lint + typecheck ; ne coche pas la validation, ne commit pas.
- **Agent vérificateur** : vérifie que le sprint est fait et correct ; sinon renvoie au codeur ; si c'est bon, coche « Sprint validé par l'agent » et commit avec le nom du sprint (ex. `B13`).
- Sprint suivant seulement après le commit. Arrêt aux pauses humaines (⏸️ dans `../plan.md`).
- Pas de fonctionnalités hors du sprint en cours. Ambiguïté : option la plus raisonnable (règlement FFT), documentée et notée pour l'humain.

## Conventions du backend

- Node + TypeScript strict, Colyseus, Vitest.
- Moteur de règles = logique pure dans un dossier dédié, sans dépendance à Colyseus, avec RNG injectable pour les tests.
- Le serveur valide tout : le client envoie des intentions, jamais un état.
- Une main n'est jamais envoyée aux autres joueurs.
- Auth : vérification du JWT Supabase à la connexion (`onAuth`).
- Communication avec l'humain en français.
- Commandes (dans `backend/`, après `export PATH=/home/dev/.local/share/pnpm/bin:$PATH`) :
  `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm format` / `pnpm format:check` · `pnpm start`.
  Les tests de room tirent des donnes au hasard : relancer `pnpm vitest run test/rooms` 2 ou 3 fois.

## Carte du code (à lire avant de chercher dans le projet)

Le **README** du backend est la documentation de référence côté client (messages, options, codes
d'erreur, variables d'environnement). Cette carte dit où se trouve chaque chose.

### `src/engine/` — règles FFT, logique pure (aucun import de Colyseus)

| Fichier            | Rôle                   | À retenir                                                                                                                                                                                    |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards.ts`         | cartes, paquet, points | `Card` (`suit` / `trump` / `excuse`), `cardId` ↔ `parseCardId` (`hearts-14`, `trump-21`, `excuse`), `isOudler`, `cardPoints`, `countPoints`, `createDeck`                                    |
| `random.ts`        | hasard                 | `cryptoRng` (vraies parties), `seededRng` (tests), `shuffle`                                                                                                                                 |
| `deal.ts`          | distribution           | `DEAL_CONFIGS` (3 : 24+6, 4 : 18+6, 5 : 15+3), `dealCards`, `isPlayerCount`, `hasPetitSec`, `seatsWithPetitSec`                                                                              |
| `bidding.ts`       | enchères               | `CONTRACTS`, `startAuction`, `legalBids`, `placeBid`, `auctionResult` (preneur ou redonne) ; un seul tour, la Garde contre clôt                                                              |
| `king-call.ts`     | appel du roi (5 j.)    | `callableCards`, `callKing` (partenaire / seul / au chien), `revealOnPlay`, `revealOnDogShown`, `attackerSeats`                                                                              |
| `dog.ts`           | chien et écart         | `isDogRevealed`, `dogPointsOwner`, `takeDog`, `discardableCards`, `makeDiscard` (atouts écartés montrés)                                                                                     |
| `legal-moves.ts`   | coups légaux           | `getLegalCards` (fournir, couper, surcouper, Excuse ; entame du 1er pli à 5), `assertLegalPlay`                                                                                              |
| `trick.ts`         | gagnant d'un pli       | `trickWinner`                                                                                                                                                                                |
| `play.ts`          | jeu de la carte        | `startPlay`, `playCard`, `legalCardsForCurrentPlayer`, `isPlayFinished`, `campCards` (Excuse, échange, `unpaidExcuseDebt`) ; `slamExcuseRule`                                                |
| `announcements.ts` | poignée, chelem        | `HANDFUL_SIZES`, `validateHandful`, `canAnnounceHandful`, `validateSlamAnnouncement`, `firstLeader`                                                                                          |
| `scoring.ts`       | comptage et marque     | `tally`, `contractOutcome` (seuils 56/51/41/36, arrondi du ½ point), `distributeScore` (3/4/5 j.), `computeBonuses` (poignée, petit au bout, chelem ; `secondaryAnnouncements`), `scoreDeal` |
| `errors.ts`        | refus d'une action     | `IllegalActionError(code, message)` : le `code` part au client                                                                                                                               |

### Autres dossiers de `src/`

| Fichier                        | Rôle                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.config.ts`                | rooms (`tarot`, `filterBy(["playerCount", "secondaryAnnouncements"])`), `/health`, lecture de la config Supabase au démarrage, `installCodeAttemptLimit()` |
| `rooms/TarotRoom.ts`           | la room : authentification, sièges, machine à états, délais, tables privées (voir ci-dessous)                                                              |
| `rooms/schema/TarotState.ts`   | état synchronisé (`PlayerState.hand` en `.view()` : visible du seul propriétaire)                                                                          |
| `auth/verify-token.ts`         | vérification du JWT Supabase (`jose`, JWKS ou secret HS256), `AuthError` et ses raisons                                                                    |
| `auth/identity.ts`             | `resolvePlayerIdentity` : pseudo lu dans `profiles` uniquement                                                                                             |
| `auth/authenticate.ts`         | instances par défaut (`defaultTokenVerifier`, `defaultProfileRepository`, `setDefaultProfileRepository` pour les tests), `authenticate`, `authFailure`     |
| `profiles/`                    | dépôt PostgREST (clé publique + jeton du joueur, jamais `service_role`), règles du pseudo et de l'ordre de la main (partagées avec le frontend)            |
| `matchmaking/code-attempts.ts` | limite de codes de table privée (enveloppe `matchMaker.controller.invokeMethod` pour `joinById` et `reconnect`)                                            |

### `TarotRoom` en bref

- **Phases** : `waiting` → `bidding` → `calling` (5 j.) → `discarding` (Petite, Garde) → `playing` → `scoring` → donne suivante. Redonne si tous passent ou Petit sec (donneur suivant).
- **Messages** : `bid`, `callKing`, `discard`, `announceHandful`, `announceSlam`, `play`, `ready` ; tables privées : `setPlayerCount`, `start` (hôte), `chooseSeat` (chacun).
- **Messages serveur** : `error { code, message }` (au seul fautif), `redeal { reason }`, `kicked { reason: "notReady" }`.
- **Options de création** : `playerCount` (3/4/5, défaut 4), `privateTable`, `secondaryAnnouncements` (défaut `true`). Normalisées dans `static onAuth` (`normalizeMatchmakingOptions`), avant la recherche de table.
- **Codes de refus de connexion** : `AUTH_FAILED` (raison entre parenthèses dans le message), `ALREADY_SEATED` 4090, `SEAT_LOST` 4091, `TOO_MANY_CODE_ATTEMPTS` 4290, `MATCHMAKE_INVALID_CRITERIA`.
- **Donne en cours** : `ctx: DealContext` (serveur seul) ; le schéma n'en est que le reflet public (`syncHand`).
- **Délais** : `static timing` (`DEFAULT_TIMING`), copié dans chaque table ; `scheduleDeadline` ne reprogramme que si la décision attendue change (clé) ; `autoAct` joue un coup sûr ; joueur abandonné joué après `abandonedActionMs`.
- **Source des donnes** : `static dealSource` (`randomDeals` par défaut) — remplaçable par les tests et, plus tard, par l'entraînement.

### Tests (`test/`)

- `setup.ts` branche le dépôt de profils en mémoire `testProfiles` ; `vitest.config.ts` fournit des variables Supabase factices (aucun appel réseau).
- `helpers/auth.ts` : `signTestToken({ sub, username, withoutProfile })` (enregistre le profil), `connectAs`, `connectWithToken`, `defaultUsername`.
- Room : `colyseus.createRoom` + `connectAs`, ou le vrai matchmaking `colyseus.sdk.joinOrCreate` / `create` / `joinById` après `colyseus.sdk.auth.token = …`. Attendre le traitement d'un message : `room.waitForMessage(type)`.
- Donne choisie : `TarotRoom.dealSource = () => maDonne` (remettre `randomDeals` après) ; délais : `TarotRoom.timing = { ...DEFAULT_TIMING, ... }` ; limite de codes : `codeAttempts.reset()`.
- Pour prouver qu'un test protège : réintroduire temporairement le défaut et vérifier qu'il échoue.

## Pièges connus (Colyseus 0.18, Supabase)

- `StateView` vient de `@colyseus/schema` (pas de `colyseus`) ; `private` est une option réservée par
  Colyseus (d'où `privateTable`).
- `filterBy` : une option absente ne filtre rien → toujours normaliser dans `onAuth`. `onAuth` reçoit le
  même objet d'options que la recherche de table ; il n'est pas appelé pour un appel serveur
  (`matchMaker.*` sans contexte d'authentification).
- `joinById` cherche la table **avant** `onAuth` ; le routeur Colyseus passe **avant** Express (un
  middleware Express ne voit pas `/matchmake/*`).
- `onDrop` → `allowReconnection` ; Colyseus recopie `auth` et `view` sur la nouvelle connexion ; une
  exception dans `onReconnect` refuse la reconnexion. `client.leave(CloseCode.CONSENTED)` → `onLeave`.
- Une room vide est fermée automatiquement (autoDispose) : dans un test, garder un joueur assis.
- `this.roomId` ne se change que dans `onCreate` (code des tables privées).
- Supabase : le hook « Before User Created » doit être activé dans le projet (voir `supabase/README.md`).
