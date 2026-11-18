# Wolftarot — CLAUDE.md (racine)

Site de jeu de Tarot français (3, 4 ou 5 joueurs). Monorepo en deux projets : `backend/` et `frontend/`.

## Contexte permanent

@spec.md
@plan.md

- Spécifications : [spec.md](spec.md)
- Plan par sprints : [plan.md](plan.md)

## Règle de travail : sprint par sprint, codeur + agent vérificateur (OBLIGATOIRE)

Chaque sprint de [plan.md](plan.md) suit ce cycle, dans l'ordre du plan (tout le backend, puis le frontend) :

1. **Codeur — Claude Code lui-même (session principale, pas de sous-agent)** — implémente **uniquement** le sprint en cours :
   - coche les tâches terminées dans `plan.md` (`- [x]`) ;
   - lance tests, lint et typecheck du projet concerné ;
   - ne coche **pas** « Sprint validé par l'agent » et ne commit **pas**.
2. **Agent vérificateur (sous-agent)** — vérifie que le travail répond **exactement** au sprint (tâches de `plan.md`, `spec.md`, règles FFT, conventions ci-dessous) et relance tests, lint et typecheck :
   - s'il manque quelque chose ou si c'est faux : il liste les problèmes, et le codeur corrige dans le même sprint ;
   - si c'est bon : il coche « **Sprint validé par l'agent** », puis commit sur la branche courante avec pour message le nom du sprint (ex. `B13`). Pas de push.
3. Le sprint suivant ne commence **qu'après** le commit du vérificateur.
4. **Pauses humaines** : l'humain fixe des points d'arrêt (marqués ⏸️ dans `plan.md`). À une pause, s'arrêter et faire le bilan à l'humain : sprints faits, hypothèses prises, questions en suspens. Ne pas aller au-delà sans son accord.
5. Reste dans le périmètre du sprint : pas de fonctionnalités des sprints suivants « au passage ».
6. Spec ou règle ambiguë : choisir l'option la plus raisonnable (règlement FFT en priorité), la documenter dans le code et la noter pour le bilan à l'humain. Une décision coûteuse à défaire (choix d'architecture, service externe, donnée sensible) attend la prochaine pause.

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
- Gestionnaire de paquets : **pnpm** (`/home/dev/.local/share/pnpm/bin/pnpm`).
- Noms de code en anglais ; la traduction se fait dans l'interface.
- Règles du jeu : **règlement FFT** (`https://fftarot.fr/assets/documents/ReglementFFT_DonnesLibres.pdf`).
