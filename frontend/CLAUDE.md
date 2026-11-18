# Wolftarot — Frontend (Nuxt UI, PWA)

Interface du jeu : appels API et WebSockets (client Colyseus), auth Supabase.

## Contexte permanent

@../spec.md
@../plan.md
@../CLAUDE.md

- Spécifications : [../spec.md](../spec.md)
- Plan : [../plan.md](../plan.md) — section **Frontend** (sprints F0 → F22)

## Règle de travail : sprint par sprint (OBLIGATOIRE)

- Un seul sprint à la fois, dans l'ordre du plan.
- Coche les tâches dans `../plan.md` au fur et à mesure.
- Sprint terminé : tests + lint, puis **arrête-toi**, résume (changements, fichiers, comment vérifier dans le navigateur) et demande la validation de l'humain.
- **Ne commence jamais le sprint suivant** avant que l'humain ait accepté le sprint en cours.
- Pas de fonctionnalités hors du sprint en cours. Spec ambiguë : demande avant de coder.

## Conventions du frontend

- Nuxt + Nuxt UI, TypeScript strict, Vitest.
- **Mobile-first** : concevoir d'abord pour petit écran, puis élargir. Toute interaction souris (clic droit, ECHAP) a un équivalent tactile.
- Design moderne, volontairement différent de Foxtarot et Webtarot.
- PWA : installable, service worker.
- Le serveur est la source de vérité : l'UI affiche l'état Colyseus et envoie des intentions.
- Communication avec l'humain en français.
