# Wolftarot — CLAUDE.md (racine)

Site de jeu de Tarot français (3, 4 ou 5 joueurs). Monorepo en deux projets : `backend/` et `frontend/`.

## Contexte permanent

@spec.md
@plan.md

- Spécifications : [spec.md](spec.md)
- Plan par sprints : [plan.md](plan.md)

## Règle de travail : sprint par sprint (OBLIGATOIRE)

1. Travaille **un seul sprint à la fois**, dans l'ordre de [plan.md](plan.md) (tout le backend, puis le frontend).
2. Au fil du travail, coche les tâches terminées dans `plan.md` (`- [x]`).
3. Quand toutes les tâches du sprint sont faites :
   - lance les tests et le lint ;
   - **arrête-toi** et donne un résumé court : ce qui a changé, fichiers touchés, comment vérifier à la main ;
   - demande explicitement la validation de l'humain.
4. **Ne commence JAMAIS le sprint suivant** tant que l'humain n'a pas accepté le sprint en cours. Seul l'humain coche « **Sprint validé par l'humain** » (ou te dit de le cocher).
5. Si l'humain demande des corrections, reste dans le sprint en cours.
6. Reste dans le périmètre du sprint : pas de fonctionnalités des sprints suivants « au passage ». Si tu penses qu'il manque quelque chose au plan, propose une modification de `plan.md` et attends la réponse.
7. Si la spec est ambiguë, pose la question avant de coder.

## Architecture (voir spec.md)

- **Backend** : Colyseus (gameplay, règles, bots) — `backend/`
- **Frontend** : Nuxt UI, API + WebSockets — `frontend/`
- **App** : PWA, mobile-first
- **Auth** : Supabase (le backend vérifie le JWT)

Le moteur de règles du Tarot est une logique pure, testable sans réseau. Le serveur est l'unique source de vérité : le client n'envoie que des intentions.

## Conventions

- Communication avec l'humain en français.
- TypeScript strict dans les deux projets.
- Chaque projet a son propre `CLAUDE.md` (`backend/CLAUDE.md`, `frontend/CLAUDE.md`) avec les règles ci-dessus rappelées.
