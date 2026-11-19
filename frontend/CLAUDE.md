# Wolftarot — Frontend (Nuxt UI, PWA)

Interface du jeu : appels API et WebSockets (client Colyseus), auth Supabase.

## Contexte permanent

@../spec.md
@../plan.md
@../CLAUDE.md

- Spécifications : [../spec.md](../spec.md)
- Plan : [../plan.md](../plan.md) — section **Frontend** (sprints F0 → F22)

## Règle de travail : sprint par sprint, codeur + agent vérificateur (OBLIGATOIRE)

Voir la règle complète dans [../CLAUDE.md](../CLAUDE.md). En bref :

- **Codeur (Claude Code, session principale)** : un seul sprint à la fois, dans l'ordre du plan ; coche les tâches dans `../plan.md` ; tests + lint + typecheck ; ne coche pas la validation, ne commit pas.
- **Agent vérificateur** : vérifie que le sprint est fait et correct ; sinon renvoie au codeur ; si c'est bon, coche « Sprint validé par l'agent » et commit avec le nom du sprint (ex. `B13`).
- Sprint suivant seulement après le commit. Arrêt aux pauses humaines (⏸️ dans `../plan.md`).
- Pas de fonctionnalités hors du sprint en cours. Ambiguïté : option la plus raisonnable (règlement FFT), documentée et notée pour l'humain.

## Conventions du frontend

- Nuxt + Nuxt UI, TypeScript strict, Vitest.
- **Mobile-first** : concevoir d'abord pour petit écran, puis élargir. Toute interaction souris (clic droit, ECHAP) a un équivalent tactile.
- Design moderne, volontairement différent de Foxtarot et Webtarot.
- PWA : installable, service worker.
- Le serveur est la source de vérité : l'UI affiche l'état Colyseus et envoie des intentions.
- Communication avec l'humain en français.

## Contrat avec le backend (à lire avant F8 et suivants)

- Référence : [`../backend/README.md`](../backend/README.md) (options de table, messages, codes d'erreur,
  reconnexion) et [`../backend/CLAUDE.md`](../backend/CLAUDE.md) (« TarotRoom en bref »).
- Règles partagées à réutiliser telles quelles : `../backend/src/profiles/username.ts` (pseudo,
  `SIGNUP_USERNAME_ERRORS`) et `../backend/src/profiles/hand-order.ts` (ordre de la main).
- Inscription (F4) : `supabase.auth.signUp({ email, password, options: { data: { username } } })` ;
  vérification en direct `supabase.rpc("username_available", { candidate })` ; un refus du hook
  (`username_invalid` / `username_unavailable`) s'affiche « pseudo non disponible ».
- Tables privées (F10) : code en majuscules (`joinById(code)`), choix de la place (`chooseSeat`).
- Reconnexion (F22) : garder `room.reconnectionToken` (par exemple en `sessionStorage`) et appeler
  `client.reconnect(token)` après un rechargement ; afficher `kicked` et `SEAT_LOST`.
- État d'avancement : F0 fait (squelette Nuxt UI, TypeScript 6 à cause de `typescript-eslint`).
