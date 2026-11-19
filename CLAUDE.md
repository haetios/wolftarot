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

## État d'avancement (tenu à jour à chaque sprint)

- **Fait** : B0 à B17.5 (moteur de règles complet, room Colyseus jouable de bout en bout, auth Supabase,
  profils, parties libres, tables privées, reconnexion et délais, options de table, cette mémoire) ;
  F0 (squelette Nuxt).
- **Pause humaine après B17** : faite le 19/11/2026 (retours traités en B17.1 à B17.5).
- **Suivant** : ⏸️ **pause humaine après B17.5** (bilan à l'humain), puis B18 (bots).
  Prochaine pause : après B23. Les pauses sont décidées par l'humain et marquées ⏸️ dans `plan.md` :
  toujours les relire avant d'enchaîner un sprint.
- Historique : `git log --oneline` (un commit par sprint, message = nom du sprint).

## Décisions de l'humain (journal)

À respecter sans les rediscuter ; une nouvelle décision s'ajoute ici avec sa date.

- **Règles** : règlement FFT, sans règle maison. Noms de code en anglais (`dog` = chien,
  `handful` = poignée, `slam` = chelem, `small/guard/guardWithout/guardAgainst` = contrats).
- **Signalisation** de la défense (spec.md) : à coder en B20 à B23.
- **Petit sec** : la donne est annulée et redistribuée.
- **Entraînement** : donnes préfaites (20 par jour, validées par un admin), rejouables par ID, pourcentage
  comme sur Foxtarot (B24 à B30).
- **19/11/2026 (pause B17)** :
  - `SUPABASE_PUBLISHABLE_KEY` obligatoire ; pseudo lu uniquement dans `profiles` ; Supabase injoignable →
    connexion refusée ; comptes anonymes refusés ;
  - inscription refusée si le pseudo est pris ou invalide (« pseudo non disponible ») ; vérification en
    direct `username_available` conservée ;
  - délais : reconnexion 60 s, décision 60 s, fin de donne 60 s puis éjection (remplacé par un bot) ;
  - **pas de pénalité d'abandon** tant qu'il n'existe pas de score hors des tables (un bot remplace) ;
  - noms des bots aléatoires, tirés à la création d'une table qui accepte les bots ;
  - un bot ne prend qu'avec un vrai jeu d'attaque (au minimum une Prise), sinon il passe ;
  - tables privées : chaque joueur choisit sa place ; 5 codes erronés par minute et par compte ;
  - option « annonces secondaires » (chelem, petit au bout) à la création de toute table ;
  - `loadtest` supprimé ; `.env.development` / `.env.production` supprimés ;
  - pauses humaines après B17.5 et après B23 (ajoutées par l'humain dans `plan.md`).

## Pièges connus (environnement)

- **pnpm** : `export PATH=/home/dev/.local/share/pnpm/bin:$PATH` (le `pnpm` de corepack est cassé).
  Le registre npm est lent (≈ 2 min par `pnpm add`) : timeouts longs, ajouter une dépendance seulement
  si c'est indispensable. pnpm 12 bloque les scripts de build non approuvés (`allowBuilds` dans
  `pnpm-workspace.yaml`) et les dépendances git (`blockExoticSubdeps: false` dans le backend, pour
  `uWebSockets.js` tiré par `colyseus`).
- **Docker** : les conteneurs déjà présents appartiennent à d'autres projets (`taleway`, `critiplay`,
  `harmony`, `unidest`…) : **ne jamais y toucher**. Pour tester le SQL : un conteneur jetable nommé
  `wolftarot-…` (voir `supabase/README.md`), supprimé ensuite.
- **Arrêter un serveur lancé pour vérifier** : par son PID (`ss -ltnp`), jamais `pkill -f` (la commande
  se tue elle-même).
- **Règlement FFT** : le PDF officiel est lisible avec `pdftotext` (WebFetch ne sait pas le lire).
