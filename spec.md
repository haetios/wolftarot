Wolftarot sera un site de jeu. Le Tarot est un jeu de carte français qui peut se jouer à 3, 4 ou 5 et qui implique un attaquant et des défenseurs.

Un joueur doit pouvoir :

- S'inscrire ou se connecter
- Choisir un pseudo à l'inscription
- Modifier l'ordre des cartes de sa main directement en jeu :
    1. Clic droit (clic/maintenu) pour sélectionner
    2. Clic gauche pour "drag & drop"
    3. ECHAP pour confirmer/annuler
- Choisir l'ordre de base des cartes de sa main (paramètres)
- Choisir sa position en entrainement seulement (attaque, devant, au milieu, au fond)
- Jouer en libre en ligne (multijoueur)
- Jouer en libre en autorisant les bots
- Créer des tables privées

Un bot doit :

- Jouer avec les annonces FFT (tenue, honneur, fin de couleur, etc.)
- Reconnaitre les annonces des joueurs et des autres bots pour savoir quoi jouer par la suite

Précision sur les « annonces » :

- Annonces formelles : le contrat de l'attaque (prise, garde, garde sans, garde contre), et les autres annonces déclarées (poignée, chelem, petit au bout...)
- Signalisation de la défense : la défense "se parle" uniquement par les cartes qu'elle joue (voir section Signalisation). Ce ne sont pas des messages : le bot doit les émettre et les lire à partir des cartes jouées

Le site doit :
- Être plus moderne que Foxtarot et Webtarot
- Être mobile-first

Le code doit :
- Être bien séparé :
    1. Backend : (gameplay) Colyseus
    2. Frontend : (Interface) Nuxt UI avec des appels API et des WebSockets
    3. App : PWA
    4. Auth : Supabase

## Signalisation

Système de la Fédération Française de Tarot permettant aux défenseurs de dialoguer par le seul biais de la carte.

### À l'entame (1 seule carte, uniquement sur la première entame du joueur)

Dans les couleurs :
- une carte de l'As au 5 promet un honneur majeur (Roi, Dame)
- une carte du 6 au 10 dénie la possession d'un honneur majeur

À l'atout :
- atout impair : promet 7 atouts, avec la défense du petit (un des trois gros : 21, 20, 19)
- atout pair : annonce moins de 7 atouts

### À la fourniture (2 cartes)

Un signal est une fourniture descendante « non naturelle ». Exemple : on joue le 9 au premier tour, puis le 3 au deuxième tour de la couleur.

- Descendante sur couleur jouée par le preneur : tenue 5ème dans la couleur, invite à jouer atout (attention de ne pas avoir le petit en main)
- Descendante sur couleur jouée par la défense : annonce un doubleton (2 cartes seulement dans la couleur). Le joueur va couper au prochain tour, ce qui sous-entend qu'il n'a pas le petit en danger. À l'inverse, un doubleton joué en montant demande l'arrêt de cette couleur
- Descendante sur atout : signale le petit en danger, demande l'arrêt de l'atout

### Excuse

- Au premier tour d'atout : demande l'arrêt impératif de l'atout (petit en danger)
- Sur couleur jouée par le preneur, au premier ou au deuxième tour : indique la tenue

### Main forte

Se signale soit à l'entame par la pose d'un Roi ou d'un atout impair, soit à la prise de main par la désobéissance. Dans ce cas, elle impose sa ligne de jeu et les partenaires doivent collaborer.
