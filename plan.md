# PLAN

Référence : [spec.md](spec.md)

> **Règles d'utilisation (voir CLAUDE.md)**
> - Un sprint = une petite livraison, vérifiable à la main par l'humain.
> - Claude coche les tâches au fur et à mesure (`- [x]`).
> - Quand toutes les tâches sont faites, Claude s'arrête, résume, et demande validation.
> - Seul l'humain coche « Sprint validé ». **Pas de nouveau sprint tant que ce n'est pas coché.**
> - Ordre : tout le Backend (B0 → B25), puis le Frontend (F0 → F20). Un sprint frontend peut démarrer plus tôt uniquement si l'humain le demande.

---

## Backend — `backend/` (Colyseus, TypeScript)

### Fondations

#### Sprint B0 — Initialisation du projet
- [ ] Créer `backend/` (Node + TypeScript strict)
- [ ] Installer Colyseus, serveur qui démarre
- [ ] Route `GET /health`
- [ ] Lint + format + Vitest configurés, 1 test de fumée
- [ ] README minimal (lancer, tester)
- [ ] **Sprint validé par l'humain**

#### Sprint B1 — Cartes et paquet
- [ ] Types `Card` (couleur, valeur, atout, excuse)
- [ ] Génération du paquet de 78 cartes
- [ ] Points par carte, bouts (petit, 21, excuse), total de 91 points
- [ ] Mélange (RNG injectable pour tester)
- [ ] Tests unitaires
- [ ] **Sprint validé par l'humain**

#### Sprint B2 — Distribution
- [ ] Config par nombre de joueurs (3 / 4 / 5) : cartes par main, taille du chien
- [ ] Distribution main par main et chien
- [ ] Tests : toutes les cartes distribuées une seule fois, pour 3, 4 et 5 joueurs
- [ ] **Sprint validé par l'humain**

### Règles du jeu (moteur pur, sans réseau)

#### Sprint B3 — Enchères
- [ ] Contrats : petite, garde, garde sans, garde contre
- [ ] Tour d'enchères (passer, surenchérir uniquement)
- [ ] Cas où tout le monde passe (redonne)
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B4 — Appel du roi (5 joueurs)
- [ ] L'attaquant appelle un roi
- [ ] Partenaire caché, révélé à la jouée du roi
- [ ] Cas où l'attaquant s'appelle lui-même
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B5 — Chien et écart
- [ ] Révélation du chien selon le contrat
- [ ] Écart : cartes autorisées (pas de roi, pas de bout, atouts en dernier recours)
- [ ] Garde sans / garde contre : chien non pris en main
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B6 — Coups légaux
- [ ] Obligation de fournir
- [ ] Obligation de couper, puis de surmonter
- [ ] Gestion de l'Excuse (jouable à tout moment, jamais obligatoire)
- [ ] Fonction `getLegalCards(hand, trick)`
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B7 — Pli et partie
- [ ] Détermination du gagnant du pli
- [ ] Excuse : reste à son camp, échange de carte
- [ ] Enchaînement des plis jusqu'à la fin de la donne
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B8 — Comptage et score
- [ ] Décompte des points (attaque / défense), nombre de bouts, contrat rempli ou non
- [ ] Calcul du score par joueur (3, 4 et 5 joueurs)
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B9 — Annonces formelles (partie 1)
> Deux familles d'annonces : les **formelles** (contrats, poignée, chelem, petit au bout), traitées ici et en B10, et la **signalisation** de la défense (signaux par les cartes jouées, règles dans spec.md), traitée en B20 à B23.

- [ ] Modèle d'annonce + moment où elle est autorisée
- [ ] Poignées (seuils selon le nombre de joueurs), validation des atouts montrés
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B10 — Annonces formelles (partie 2)
- [ ] Chelem, petit au bout, autres annonces formelles FFT
- [ ] Bonus au score
- [ ] Tests
- [ ] **Sprint validé par l'humain**

### Réseau (Colyseus)

#### Sprint B11 — Room Colyseus de base
- [ ] `TarotRoom` avec schéma d'état (joueurs, phase, main, pli en cours)
- [ ] Rejoindre / quitter la room
- [ ] Une main n'est visible que par son propriétaire
- [ ] Test d'intégration avec un client Colyseus
- [ ] **Sprint validé par l'humain**

#### Sprint B12 — Déroulement d'une donne via la room
- [ ] Messages : enchère, appel du roi, écart, jouer une carte, annonces
- [ ] Validation côté serveur avec le moteur
- [ ] Machine à états des phases
- [ ] Test d'intégration d'une donne complète (3 clients scriptés)
- [ ] **Sprint validé par l'humain**

#### Sprint B13 — Authentification Supabase
- [ ] Vérification du JWT Supabase à la connexion Colyseus (`onAuth`)
- [ ] Récupération de l'identité (id, pseudo)
- [ ] Rejet des connexions non authentifiées
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B14 — Profil et paramètres
- [ ] Table Supabase `profiles` (pseudo unique) + RLS
- [ ] Table/colonne des paramètres (ordre de base de la main)
- [ ] Accès côté backend + tests
- [ ] **Sprint validé par l'humain**

#### Sprint B15 — Parties libres multijoueur
- [ ] Matchmaking : file d'attente par taille de table (3 / 4 / 5)
- [ ] Démarrage quand la table est complète
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B16 — Tables privées
- [ ] Création d'une table privée avec code
- [ ] Rejoindre par code
- [ ] Hôte : démarrer la partie, choisir 3 / 4 / 5 joueurs
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B17 — Déconnexion et reconnexion
- [ ] Reconnexion avec la même identité dans un délai
- [ ] Timeout de jeu / abandon
- [ ] Tests
- [ ] **Sprint validé par l'humain**

### Bots

#### Sprint B18 — Bot de base
- [ ] Interface `Bot` (décisions : enchère, appel, écart, carte, annonce)
- [ ] Bot qui joue toujours un coup légal
- [ ] Remplissage des sièges vides par des bots dans la room
- [ ] Option « autoriser les bots » pour le jeu libre
- [ ] Tests : des parties 100 % bots vont jusqu'au bout
- [ ] **Sprint validé par l'humain**

#### Sprint B19 — Bot : annonces formelles et mémoire
- [ ] Le bot fait ses annonces formelles selon les règles FFT (contrat, poignée, chelem, petit au bout)
- [ ] Le bot enregistre les annonces formelles des joueurs et des autres bots
- [ ] Mémoire des cartes jouées (coupes, atouts restants)
- [ ] Le bot adapte son jeu à ces informations
- [ ] Tests ciblés par scénario
- [ ] **Sprint validé par l'humain**

#### Sprint B20 — Signalisation : modèle et entame
> Règles : section « Signalisation » de [spec.md](spec.md).

- [ ] Modèle d'un signal (joueur, type, sens, tour, couleur) et de la connaissance déduite
- [ ] Détection à l'entame en couleur : As→5 = honneur majeur promis, 6→10 = honneur majeur dénié (première entame du joueur uniquement)
- [ ] Détection à l'entame à l'atout : impair = 7 atouts avec défense du petit, pair = moins de 7 atouts
- [ ] Tests ciblés par règle
- [ ] **Sprint validé par l'humain**

#### Sprint B21 — Signalisation : fourniture, excuse, main forte
- [ ] Fourniture descendante « non naturelle » sur 2 cartes dans une couleur
- [ ] Sur couleur du preneur : tenue 5ème, invite à jouer atout
- [ ] Sur couleur de la défense : doubleton (descendant) ou demande d'arrêt de la couleur (montant)
- [ ] Descendante à l'atout : petit en danger, demande l'arrêt de l'atout
- [ ] Excuse : 1er tour d'atout = arrêt impératif de l'atout ; sur couleur du preneur aux tours 1 ou 2 = tenue
- [ ] Main forte : entame d'un Roi ou d'un atout impair, ou désobéissance à la prise de main
- [ ] Tests ciblés par règle
- [ ] **Sprint validé par l'humain**

#### Sprint B22 — Bot : lecture de la signalisation
- [ ] Un signal d'un partenaire de défense est interprété ; un jeu de l'attaquant n'est pas pris pour un signal
- [ ] Le bot adapte son jeu aux informations déduites (couper, arrêter l'atout, jouer atout, suivre la ligne de jeu d'une main forte)
- [ ] Le bot ne se fie qu'à la signalisation de ses partenaires défenseurs
- [ ] Tests : scénarios de plis complets
- [ ] **Sprint validé par l'humain**

#### Sprint B23 — Bot : émission de la signalisation
- [ ] Le bot en défense émet les signaux (entame, fourniture, excuse, main forte) quand son jeu s'y prête
- [ ] Il n'émet un signal que si le coup reste légal et raisonnable (ex. ne signale pas un doubleton à couper s'il a le petit en danger)
- [ ] Tests : un bot émetteur est compris par un bot lecteur (B22)
- [ ] **Sprint validé par l'humain**

#### Sprint B24 — Donnes d'entraînement préfaites
- [ ] Format JSON d'une donne : nombre de joueurs, mains par rôle (attaquant, devant, milieu, fond), chien, enchères figées (contrat, preneur, roi appelé), titre, thème
- [ ] Dossier `backend/data/training-deals/` + chargeur
- [ ] Validateur (78 cartes distinctes, tailles de main et de chien, enchères cohérentes), lancé dans les tests
- [ ] Générateur de donnes avec contraintes (ex. : un honneur majeur dans une main, N atouts, un doubleton), tirage jusqu'à satisfaction, graine reproductible
- [ ] Génération d'un lot de donnes par thème de signalisation (3, 4 et 5 joueurs), avec titre et courte explication pédagogique
- [ ] Fichier de relecture : liste lisible des donnes à faire valider par un joueur confirmé (les donnes non relues sont marquées `reviewed: false`)
- [ ] Tests
- [ ] **Sprint validé par l'humain**

#### Sprint B25 — Mode entraînement
- [ ] Room d'entraînement : lance une donne préfaite choisie, sans tirage aléatoire
- [ ] Choix du rôle du joueur (attaque, devant, au milieu, au fond) : il reçoit la main de ce rôle, les autres sièges sont des bots
- [ ] Liste des donnes disponibles exposée au client
- [ ] Interdit en partie libre (la position y est imposée)
- [ ] Tests : une donne d'entraînement se joue jusqu'au bout avec chaque rôle
- [ ] **Sprint validé par l'humain**

---

## Frontend — `frontend/` (Nuxt + Nuxt UI, PWA)

### Fondations

#### Sprint F0 — Initialisation du projet
- [ ] Créer `frontend/` (Nuxt, TypeScript)
- [ ] Installer Nuxt UI
- [ ] Page d'accueil vide + layout
- [ ] Lint + format + Vitest
- [ ] **Sprint validé par l'humain**

#### Sprint F1 — Design system mobile-first
- [ ] Thème (couleurs, typographie, mode clair/sombre)
- [ ] Layout mobile-first (navigation, en-tête)
- [ ] Style moderne, différent de Foxtarot et Webtarot
- [ ] **Sprint validé par l'humain**

#### Sprint F2 — PWA
- [ ] Module PWA (manifest, icônes, service worker)
- [ ] Installable sur mobile
- [ ] Écran hors-ligne simple
- [ ] **Sprint validé par l'humain**

### Authentification

#### Sprint F3 — Supabase et connexion
- [ ] Client Supabase configuré
- [ ] Page de connexion (email + mot de passe)
- [ ] Déconnexion, session persistante
- [ ] **Sprint validé par l'humain**

#### Sprint F4 — Inscription et pseudo
- [ ] Page d'inscription avec choix du pseudo
- [ ] Vérification d'unicité du pseudo
- [ ] Pages protégées (middleware)
- [ ] **Sprint validé par l'humain**

### Cartes et table

#### Sprint F5 — Composant carte
- [ ] Rendu des 78 cartes (couleurs, atouts, excuse)
- [ ] Taille adaptative, lisible sur mobile
- [ ] Page de démo pour toutes les cartes
- [ ] **Sprint validé par l'humain**

#### Sprint F6 — Main du joueur
- [ ] Affichage de la main en éventail / ligne selon l'écran
- [ ] Sélection d'une carte
- [ ] Cartes injouables grisées (données statiques pour l'instant)
- [ ] **Sprint validé par l'humain**

#### Sprint F7 — Table de jeu
- [ ] Disposition pour 3, 4 et 5 joueurs
- [ ] Zone du pli, pseudos, indicateur du joueur actif
- [ ] Données factices
- [ ] **Sprint validé par l'humain**

### Connexion au backend

#### Sprint F8 — Client Colyseus
- [ ] Connexion avec le JWT Supabase
- [ ] Rejoindre une room, lire l'état en temps réel
- [ ] Gestion des erreurs et de l'état de connexion
- [ ] **Sprint validé par l'humain**

#### Sprint F9 — Lobby
- [ ] Page lobby
- [ ] Jeu libre en ligne : choix de 3 / 4 / 5 joueurs
- [ ] File d'attente avec feedback
- [ ] **Sprint validé par l'humain**

#### Sprint F10 — Tables privées
- [ ] Créer une table privée (code, lien de partage)
- [ ] Rejoindre par code
- [ ] Salle d'attente avec liste des joueurs
- [ ] **Sprint validé par l'humain**

#### Sprint F11 — Jeu libre avec bots
- [ ] Option « autoriser les bots »
- [ ] Indicateur visuel pour distinguer un bot
- [ ] **Sprint validé par l'humain**

### Déroulement d'une donne

#### Sprint F12 — Enchères et appel du roi
- [ ] Interface des enchères
- [ ] Choix du roi appelé (5 joueurs)
- [ ] Affichage des enchères des autres
- [ ] **Sprint validé par l'humain**

#### Sprint F13 — Chien et écart
- [ ] Affichage du chien
- [ ] Sélection des cartes à écarter, validation
- [ ] **Sprint validé par l'humain**

#### Sprint F14 — Jouer les cartes
- [ ] Jouer une carte
- [ ] Pli animé, ramassage du pli
- [ ] Refus des coups illégaux (message clair)
- [ ] **Sprint validé par l'humain**

#### Sprint F15 — Annonces
- [ ] Interface d'annonce formelle (poignée, chelem, petit au bout, etc.). La signalisation n'a pas d'UI : ce sont des cartes jouées normalement
- [ ] Affichage des annonces des autres joueurs
- [ ] **Sprint validé par l'humain**

#### Sprint F16 — Fin de donne et score
- [ ] Écran de résultat (points, bouts, contrat, scores)
- [ ] Enchaînement vers la donne suivante
- [ ] **Sprint validé par l'humain**

### Personnalisation

#### Sprint F17 — Réorganiser sa main en jeu
- [ ] Clic droit (clic/maintenu) : sélection de la carte
- [ ] Clic gauche : drag & drop
- [ ] ECHAP : confirmer / annuler
- [ ] Équivalent tactile pour mobile (appui long, à valider avec l'humain)
- [ ] **Sprint validé par l'humain**

#### Sprint F18 — Paramètres
- [ ] Page paramètres
- [ ] Ordre de base des cartes de la main, appliqué à chaque donne
- [ ] Sauvegarde dans le profil
- [ ] **Sprint validé par l'humain**

#### Sprint F19 — Mode entraînement
- [ ] Entrée « Entraînement »
- [ ] Liste des donnes préfaites (titre, thème, nombre de joueurs)
- [ ] Choix de la position (attaque, devant, au milieu, au fond)
- [ ] **Sprint validé par l'humain**

### Finitions

#### Sprint F20 — Robustesse et qualité
- [ ] Reconnexion à une partie en cours
- [ ] Accessibilité (contrastes, clavier, labels)
- [ ] Performance mobile
- [ ] Tests E2E d'un parcours complet (inscription → donne)
- [ ] **Sprint validé par l'humain**
