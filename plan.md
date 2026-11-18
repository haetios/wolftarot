# PLAN

Référence : [spec.md](spec.md)

> **Règles d'utilisation (voir CLAUDE.md)**
> - Un sprint = une petite livraison, vérifiable.
> - **Codeur (Claude Code, session principale)** : implémente le sprint et coche les tâches (`- [x]`).
> - **Agent vérificateur** : contrôle le sprint, coche « Sprint validé par l'agent » et commit avec le nom du sprint (ex. `B13`).
> - **Pas de nouveau sprint avant le commit du vérificateur.** Arrêt obligatoire aux pauses humaines ⏸️.
> - Ordre : tout le Backend (B0 → B30), puis le Frontend (F0 → F22).
> - B0 à B11 et F0 ont été validés par l'humain.

---

## Backend — `backend/` (Colyseus, TypeScript)

### Fondations

#### Sprint B0 — Initialisation du projet
- [x] Créer `backend/` avec `pnpm create colyseus-app@latest ./backend` (TypeScript, preset turn-based, layout server)
- [x] Installer Colyseus, serveur qui démarre
- [x] Route `GET /health`
- [x] Lint + format + Vitest configurés, 1 test de fumée
- [x] README minimal (lancer, tester)
- [X] **Sprint validé par l'humain**

#### Sprint B1 — Cartes et paquet
- [x] Types `Card` (couleur, valeur, atout, excuse)
- [x] Génération du paquet de 78 cartes
- [x] Points par carte, bouts (petit, 21, excuse), total de 91 points
- [x] Mélange (RNG injectable pour tester)
- [x] Tests unitaires
- [x] **Sprint validé par l'humain**

#### Sprint B2 — Distribution
- [x] Config par nombre de joueurs (3 / 4 / 5) : cartes par main, taille du chien
- [x] Distribution main par main et chien
- [x] Tests : toutes les cartes distribuées une seule fois, pour 3, 4 et 5 joueurs
- [x] **Sprint validé par l'humain**

### Règles du jeu (moteur pur, sans réseau)

#### Sprint B3 — Enchères
- [x] Contrats : petite, garde, garde sans, garde contre
- [x] Tour d'enchères (passer, surenchérir uniquement)
- [x] Cas où tout le monde passe (redonne)
- [x] Petit sec : un joueur dont le seul atout est le Petit (sans l'Excuse) fait annuler la donne (redonne)
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B4 — Appel du roi (5 joueurs)
- [x] L'attaquant appelle un roi
- [x] Partenaire caché, révélé à la jouée du roi
- [x] Cas où l'attaquant s'appelle lui-même
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B5 — Chien et écart
- [x] Révélation du chien selon le contrat
- [x] Écart : cartes autorisées (pas de roi, pas de bout, atouts en dernier recours)
- [x] Garde sans / garde contre : chien non pris en main
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B6 — Coups légaux
- [x] Obligation de fournir
- [x] Obligation de couper, puis de surmonter
- [x] Gestion de l'Excuse (jouable à tout moment, jamais obligatoire)
- [x] Fonction `getLegalCards(hand, trick)`
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B7 — Pli et partie
- [x] Détermination du gagnant du pli
- [x] Excuse : reste à son camp, échange de carte
- [x] Excuse jouée au dernier pli : elle change de camp (va au gagnant du pli), sauf chelem où elle peut remporter le dernier pli
- [x] Enchaînement des plis jusqu'à la fin de la donne
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B8 — Comptage et score
- [x] Décompte des points (attaque / défense), nombre de bouts, contrat rempli ou non
- [x] Calcul du score par joueur (3, 4 et 5 joueurs)
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B9 — Annonces formelles (partie 1)
> Deux familles d'annonces : les **formelles** (contrats, poignée, chelem, petit au bout), traitées ici et en B10, et la **signalisation** de la défense (signaux par les cartes jouées, règles dans spec.md), traitée en B20 à B23.

- [x] Modèle d'annonce + moment où elle est autorisée
- [x] Poignées **simple, double et triple** (seuils selon le nombre de joueurs), validation des atouts montrés (l'Excuse compte comme atout)
- [x] Tests
- [x] **Sprint validé par l'humain**

#### Sprint B10 — Annonces formelles (partie 2)
- [x] Chelem, petit au bout, autres annonces formelles FFT
- [x] Bonus au score
- [x] Tests
- [x] **Sprint validé par l'humain**

### Réseau (Colyseus)

#### Sprint B11 — Room Colyseus de base
- [x] `TarotRoom` avec schéma d'état (joueurs, phase, main, pli en cours)
- [x] Rejoindre / quitter la room
- [x] Une main n'est visible que par son propriétaire
- [x] Test d'intégration avec un client Colyseus
- [x] **Sprint validé par l'humain**

#### Sprint B12 — Déroulement d'une donne via la room
- [x] Messages : enchère, appel du roi, écart, jouer une carte, annonces
- [x] Validation côté serveur avec le moteur
- [x] Machine à états des phases
- [x] Test d'intégration d'une donne complète (3 clients scriptés)
- [x] **Sprint validé par l'agent**

#### Sprint B13 — Authentification Supabase
- [x] Vérification du JWT Supabase à la connexion Colyseus (`onAuth`)
- [x] Récupération de l'identité (id, pseudo)
- [x] Rejet des connexions non authentifiées
- [x] Tests
- [x] **Sprint validé par l'agent**

#### Sprint B14 — Profil et paramètres
- [x] Table Supabase `profiles` (pseudo unique) + RLS
- [x] Table/colonne des paramètres (ordre de base de la main)
- [x] Accès côté backend + tests
- [x] **Sprint validé par l'agent**

#### Sprint B15 — Parties libres multijoueur
- [x] Matchmaking : file d'attente par taille de table (3 / 4 / 5)
- [x] Démarrage quand la table est complète
- [x] Tests
- [x] **Sprint validé par l'agent**

#### Sprint B16 — Tables privées
- [ ] Création d'une table privée avec code
- [ ] Rejoindre par code
- [ ] Hôte : démarrer la partie, choisir 3 / 4 / 5 joueurs
- [ ] Tests
- [ ] **Sprint validé par l'agent**

#### Sprint B17 — Déconnexion et reconnexion
- [ ] Reconnexion avec la même identité dans un délai
- [ ] Timeout de jeu / abandon
- [ ] Tests
- [ ] **Sprint validé par l'agent**

> ⏸️ **Pause humaine** : s'arrêter après B17 et faire le bilan à l'humain.

### Bots

#### Sprint B18 — Bot de base
- [ ] Interface `Bot` (décisions : enchère, appel, écart, carte, annonce)
- [ ] Bot qui joue toujours un coup légal
- [ ] Remplissage des sièges vides par des bots dans la room
- [ ] Option « autoriser les bots » pour le jeu libre
- [ ] Tests : des parties 100 % bots vont jusqu'au bout
- [ ] **Sprint validé par l'agent**

#### Sprint B19 — Bot : annonces formelles et mémoire
- [ ] Le bot fait ses annonces formelles selon les règles FFT (contrat, poignée, chelem, petit au bout)
- [ ] Le bot enregistre les annonces formelles des joueurs et des autres bots
- [ ] Mémoire des cartes jouées (coupes, atouts restants)
- [ ] Le bot adapte son jeu à ces informations
- [ ] Le bot ne garde pas l'Excuse pour le dernier pli (sauf chelem)
- [ ] Tests ciblés par scénario
- [ ] **Sprint validé par l'agent**

#### Sprint B20 — Signalisation : modèle et entame
> Règles : section « Signalisation » de [spec.md](spec.md).

- [ ] Modèle d'un signal (joueur, type, sens, tour, couleur) et de la connaissance déduite
- [ ] Détection à l'entame en couleur : As→5 = honneur majeur promis, 6→10 = honneur majeur dénié (première entame du joueur uniquement)
- [ ] Détection à l'entame à l'atout : impair = 7 atouts avec défense du petit, pair = moins de 7 atouts
- [ ] Tests ciblés par règle
- [ ] **Sprint validé par l'agent**

#### Sprint B21 — Signalisation : fourniture, excuse, main forte
- [ ] Fourniture descendante « non naturelle » sur 2 cartes dans une couleur
- [ ] Sur couleur du preneur : tenue 5ème, invite à jouer atout
- [ ] Sur couleur de la défense : doubleton (descendant) ou demande d'arrêt de la couleur (montant)
- [ ] Descendante à l'atout : petit en danger, demande l'arrêt de l'atout
- [ ] Excuse : 1er tour d'atout = arrêt impératif de l'atout ; sur couleur du preneur aux tours 1 ou 2 = tenue
- [ ] Main forte : entame d'un Roi ou d'un atout impair, ou désobéissance à la prise de main
- [ ] Tests ciblés par règle
- [ ] **Sprint validé par l'agent**

#### Sprint B22 — Bot : lecture de la signalisation
- [ ] Un signal d'un partenaire de défense est interprété ; un jeu de l'attaquant n'est pas pris pour un signal
- [ ] Le bot adapte son jeu aux informations déduites (couper, arrêter l'atout, jouer atout, suivre la ligne de jeu d'une main forte)
- [ ] Le bot ne se fie qu'à la signalisation de ses partenaires défenseurs
- [ ] Tests : scénarios de plis complets
- [ ] **Sprint validé par l'agent**

#### Sprint B23 — Bot : émission de la signalisation
- [ ] Le bot en défense émet les signaux (entame, fourniture, excuse, main forte) quand son jeu s'y prête
- [ ] Il n'émet un signal que si le coup reste légal et raisonnable (ex. ne signale pas un doubleton à couper s'il a le petit en danger)
- [ ] Tests : un bot émetteur est compris par un bot lecteur (B22)
- [ ] **Sprint validé par l'agent**

#### Sprint B24 — Format et validateur d'une donne d'entraînement
> Une donne d'entraînement a un **ID public** (partageable), pour être rejouée à la même position ou à une autre. Les mains sont indexées par rôle (attaquant, devant, milieu, fond).

- [ ] Format d'une donne : ID, nombre de joueurs, mains par rôle, chien, enchères figées (contrat, preneur, roi appelé), titre, thème
- [ ] Validateur (78 cartes distinctes, tailles de main et de chien, enchères cohérentes)
- [ ] Sérialisation JSON + génération d'un ID unique et court
- [ ] Tests
- [ ] **Sprint validé par l'agent**

#### Sprint B25 — Générateur de donnes : vrai jeu d'attaque
> La main de l'attaquant doit être cohérente avec son contrat et constituer un vrai jeu d'attaque. La donne peut ensuite être gagnée ou chuter.

- [ ] Critères de force d'une main d'attaque (nombre et qualité des atouts, bouts, rois, longues, points) par nombre de joueurs et par contrat
- [ ] Tirage de mains jusqu'à ce que l'attaquant satisfaise les critères ; les autres mains restent aléatoires (la donne peut chuter ou réussir)
- [ ] Contrat figé choisi en cohérence avec la main (petite, garde, garde sans, garde contre)
- [ ] Graine reproductible
- [ ] Tests : mains générées toutes valides et conformes aux critères, sur un grand nombre de tirages
- [ ] **Sprint validé par l'agent**

#### Sprint B26 — Stockage des donnes (Supabase)
- [ ] Table `training_deals` : ID public, contenu, statut (`pending`, `approved`, `rejected`), date de création
- [ ] RLS : les joueurs ne voient que les donnes `approved`
- [ ] Lecture d'une donne par ID, tirage d'une donne `approved` au hasard
- [ ] Tests
- [ ] **Sprint validé par l'agent**

#### Sprint B27 — Génération quotidienne
- [ ] Tâche planifiée : 20 nouvelles donnes par jour, créées au statut `pending`
- [ ] Répartition des donnes (3, 4 et 5 joueurs, contrats variés)
- [ ] Lancement manuel possible pour les tests
- [ ] Tests
- [ ] **Sprint validé par l'agent**

#### Sprint B28 — Validation par un admin
- [ ] Rôle `admin` (Supabase), vérifié côté backend
- [ ] API admin : lister les donnes `pending`, voir une donne, approuver ou rejeter
- [ ] Une donne `pending` ou `rejected` ne peut jamais être jouée
- [ ] Tests
- [ ] **Sprint validé par l'agent**

#### Sprint B29 — Mode entraînement
- [ ] Room d'entraînement qui lance une donne figée (aucun tirage de cartes)
- [ ] Le joueur fournit un **ID de donne**, sinon la donne est choisie au hasard parmi les `approved`
- [ ] Choix du rôle (attaque, devant, au milieu, au fond) : le joueur reçoit la main de ce rôle, les autres sièges sont des bots
- [ ] Rejouer la même donne à la même position ou à une autre, via son ID
- [ ] Interdit en partie libre (la position y est imposée)
- [ ] Tests : une donne se joue jusqu'au bout avec chaque rôle
- [ ] **Sprint validé par l'agent**

#### Sprint B30 — Résultats et pourcentage (comme FoxTarot)
> Hypothèse à valider : le pourcentage compare le score du joueur à celui des autres joueurs ayant joué la même donne **au même rôle**.

- [ ] Table `training_results` (donne, joueur, rôle, score, date)
- [ ] Calcul du pourcentage de joueurs que le joueur a égalés ou battus sur cette donne et ce rôle
- [ ] Renvoyé à la fin de la donne ; cas du premier joueur à jouer la donne
- [ ] Une seule entrée comptée par joueur, donne et rôle (meilleure tentative ou première, à trancher)
- [ ] Tests
- [ ] **Sprint validé par l'agent**

---

## Frontend — `frontend/` (Nuxt + Nuxt UI, PWA)

### Fondations

#### Sprint F0 — Initialisation du projet
- [x] Créer `frontend/` avec `pnpm create nuxt@latest ./frontend` (template minimal)
- [x] Installer Nuxt UI et Tailwind (module `@nuxt/ui`, `main.css`, `<UApp>`)
- [x] Page d'accueil vide + layout
- [x] Lint + format + Vitest
- [X] **Sprint validé par l'humain**

#### Sprint F1 — Design system mobile-first
- [ ] Thème (couleurs, typographie, mode clair/sombre)
- [ ] Layout mobile-first (navigation, en-tête)
- [ ] Style moderne, différent de Foxtarot et Webtarot
- [ ] **Sprint validé par l'agent**

#### Sprint F2 — PWA
- [ ] Module PWA (manifest, icônes, service worker)
- [ ] Installable sur mobile
- [ ] Écran hors-ligne simple
- [ ] **Sprint validé par l'agent**

### Authentification

#### Sprint F3 — Supabase et connexion
- [ ] Client Supabase configuré
- [ ] Page de connexion (email + mot de passe)
- [ ] Déconnexion, session persistante
- [ ] **Sprint validé par l'agent**

#### Sprint F4 — Inscription et pseudo
- [ ] Page d'inscription avec choix du pseudo
- [ ] Vérification d'unicité du pseudo
- [ ] Pages protégées (middleware)
- [ ] **Sprint validé par l'agent**

### Cartes et table

#### Sprint F5 — Composant carte
- [ ] Rendu des 78 cartes (couleurs, atouts, excuse)
- [ ] Taille adaptative, lisible sur mobile
- [ ] Page de démo pour toutes les cartes
- [ ] **Sprint validé par l'agent**

#### Sprint F6 — Main du joueur
- [ ] Affichage de la main en éventail / ligne selon l'écran
- [ ] Sélection d'une carte
- [ ] Cartes injouables grisées (données statiques pour l'instant)
- [ ] **Sprint validé par l'agent**

#### Sprint F7 — Table de jeu
- [ ] Disposition pour 3, 4 et 5 joueurs
- [ ] Zone du pli, pseudos, indicateur du joueur actif
- [ ] Données factices
- [ ] **Sprint validé par l'agent**

### Connexion au backend

#### Sprint F8 — Client Colyseus
- [ ] Connexion avec le JWT Supabase
- [ ] Rejoindre une room, lire l'état en temps réel
- [ ] Gestion des erreurs et de l'état de connexion
- [ ] **Sprint validé par l'agent**

#### Sprint F9 — Lobby
- [ ] Page lobby
- [ ] Jeu libre en ligne : choix de 3 / 4 / 5 joueurs
- [ ] File d'attente avec feedback
- [ ] **Sprint validé par l'agent**

#### Sprint F10 — Tables privées
- [ ] Créer une table privée (code, lien de partage)
- [ ] Rejoindre par code
- [ ] Salle d'attente avec liste des joueurs
- [ ] **Sprint validé par l'agent**

#### Sprint F11 — Jeu libre avec bots
- [ ] Option « autoriser les bots »
- [ ] Indicateur visuel pour distinguer un bot
- [ ] **Sprint validé par l'agent**

### Déroulement d'une donne

#### Sprint F12 — Enchères et appel du roi
- [ ] Interface des enchères
- [ ] Choix du roi appelé (5 joueurs)
- [ ] Affichage des enchères des autres
- [ ] **Sprint validé par l'agent**

#### Sprint F13 — Chien et écart
- [ ] Affichage du chien
- [ ] Sélection des cartes à écarter, validation
- [ ] **Sprint validé par l'agent**

#### Sprint F14 — Jouer les cartes
- [ ] Jouer une carte
- [ ] Pli animé, ramassage du pli
- [ ] Refus des coups illégaux (message clair)
- [ ] **Sprint validé par l'agent**

#### Sprint F15 — Annonces
- [ ] Interface d'annonce formelle (poignée, chelem, petit au bout, etc.). La signalisation n'a pas d'UI : ce sont des cartes jouées normalement
- [ ] Affichage des annonces des autres joueurs
- [ ] **Sprint validé par l'agent**

#### Sprint F16 — Fin de donne et score
- [ ] Écran de résultat (points, bouts, contrat, scores)
- [ ] Enchaînement vers la donne suivante
- [ ] **Sprint validé par l'agent**

### Personnalisation

#### Sprint F17 — Réorganiser sa main en jeu
- [ ] Clic droit (clic/maintenu) : sélection de la carte
- [ ] Clic gauche : drag & drop
- [ ] ECHAP : confirmer / annuler
- [ ] Équivalent tactile pour mobile (appui long, à valider avec l'humain)
- [ ] **Sprint validé par l'agent**

#### Sprint F18 — Paramètres
- [ ] Page paramètres
- [ ] Ordre de base des cartes de la main, appliqué à chaque donne
- [ ] Sauvegarde dans le profil
- [ ] **Sprint validé par l'agent**

#### Sprint F19 — Mode entraînement
- [ ] Entrée « Entraînement »
- [ ] Champ « ID de donne » facultatif (vide = donne au hasard)
- [ ] Choix de la position (attaque, devant, au milieu, au fond)
- [ ] **Sprint validé par l'agent**

#### Sprint F20 — Fin d'entraînement : pourcentage et rejouer
- [ ] Affichage du pourcentage à la fin de la donne (comme FoxTarot)
- [ ] Affichage de l'ID de la donne, copiable
- [ ] Boutons « Rejouer à la même position » et « Rejouer à une autre position »
- [ ] **Sprint validé par l'agent**

#### Sprint F21 — Admin : validation des donnes
- [ ] Page réservée aux admins
- [ ] Liste des donnes `pending`, visualisation d'une donne (mains, chien, contrat)
- [ ] Approuver / rejeter
- [ ] **Sprint validé par l'agent**

### Finitions

#### Sprint F22 — Robustesse et qualité
- [ ] Reconnexion à une partie en cours
- [ ] Accessibilité (contrastes, clavier, labels)
- [ ] Performance mobile
- [ ] Tests E2E d'un parcours complet (inscription → donne)
- [ ] **Sprint validé par l'agent**
