# Wolftarot — Backend (Colyseus)

Gameplay du Tarot : règles, rooms, bots, vérification d'auth Supabase.

## Contexte permanent

@../spec.md
@../plan.md
@../CLAUDE.md

- Spécifications : [../spec.md](../spec.md)
- Plan : [../plan.md](../plan.md) — section **Backend** (sprints B0 → B30)

## Règle de travail : sprint par sprint, deux agents (OBLIGATOIRE)

Voir la règle complète dans [../CLAUDE.md](../CLAUDE.md). En bref :

- **Agent codeur** : un seul sprint à la fois, dans l'ordre du plan ; coche les tâches dans `../plan.md` ; tests + lint + typecheck ; ne coche pas la validation, ne commit pas.
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
