# Wolftarot — Backend (Colyseus)

Gameplay du Tarot : règles, rooms, bots, vérification d'auth Supabase.

## Contexte permanent

@../spec.md
@../plan.md
@../CLAUDE.md

- Spécifications : [../spec.md](../spec.md)
- Plan : [../plan.md](../plan.md) — section **Backend** (sprints B0 → B30)

## Règle de travail : sprint par sprint (OBLIGATOIRE)

- Un seul sprint à la fois, dans l'ordre du plan.
- Coche les tâches dans `../plan.md` au fur et à mesure.
- Sprint terminé : tests + lint, puis **arrête-toi**, résume (changements, fichiers, comment vérifier) et demande la validation de l'humain.
- **Ne commence jamais le sprint suivant** avant que l'humain ait accepté le sprint en cours.
- Pas de fonctionnalités hors du sprint en cours. Spec ambiguë : demande avant de coder.

## Conventions du backend

- Node + TypeScript strict, Colyseus, Vitest.
- Moteur de règles = logique pure dans un dossier dédié, sans dépendance à Colyseus, avec RNG injectable pour les tests.
- Le serveur valide tout : le client envoie des intentions, jamais un état.
- Une main n'est jamais envoyée aux autres joueurs.
- Auth : vérification du JWT Supabase à la connexion (`onAuth`).
- Communication avec l'humain en français.
