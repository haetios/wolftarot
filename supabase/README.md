# Supabase — schéma de la base

Migrations SQL du projet Supabase de Wolftarot, au format de la [CLI Supabase](https://supabase.com/docs/guides/local-development/overview)
(`supabase/migrations/<horodatage>_<nom>.sql`). Ce dossier est partagé par le backend et le frontend.

## Appliquer les migrations

```sh
supabase link --project-ref <ref>   # une fois
supabase db push                    # applique les migrations manquantes
```

En local : `supabase start` puis `supabase db reset` (recrée la base et rejoue les migrations).
Le dossier ne contient pas encore de `config.toml` : `supabase init` le crée s'il manque.

## Tables (B14)

| Table      | Contenu                                                                                         | Lecture                       | Écriture                                           |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| `profiles` | `id` (= `auth.users.id`), `username`, `created_at`, `updated_at`                                | tout utilisateur connecté     | son propre `username` uniquement                   |
| `settings` | `user_id` (= `profiles.id`), `hand_order` (ordre de base de la main), `created_at`, `updated_at` | son propriétaire uniquement   | son propre `hand_order` uniquement                 |

- RLS activée sur les deux tables. Le rôle `anon` (visiteur) n'y a aucun accès.
- Ni insertion ni suppression par les joueurs : les lignes sont créées à l'inscription par le
  déclencheur `on_auth_user_created` et supprimées en cascade avec le compte (`auth.users`).
- `created_at` et `updated_at` sont tenus par la base.

### Pseudo

- 3 à 20 caractères : lettres latines (accents du français compris), chiffres, `_` et `-` ;
  commence et finit par une lettre ou un chiffre. Liste blanche : espaces, caractères invisibles
  (U+200B, U+202E…), autres alphabets et emoji sont refusés (`public.is_valid_username`).
- Unique sans tenir compte de la casse (index unique sur `lower(username)`).
- À l'inscription, le pseudo est lu uniquement dans `raw_user_meta_data->>'username'`
  (`supabase.auth.signUp({ email, password, options: { data: { username } } })`). Il est
  normalisé (blancs de bord, NFC).
- **S'il est absent, invalide ou déjà pris, l'inscription échoue** (B17.2, plus de pseudo
  provisoire) :
  - le hook Auth `public.hook_before_user_created` refuse la création du compte et renvoie au
    frontend le message `username_invalid` (HTTP 400) ou `username_unavailable` (HTTP 409,
    « pseudo non disponible ») ;
  - le déclencheur `on_auth_user_created` refuse aussi (filet de sécurité : hook non activé, ou deux
    inscriptions simultanées avec le même pseudo) ; Supabase Auth répond alors par une erreur
    générique (« Database error saving new user »).
- Avant l'inscription, `supabase.rpc('username_available', { candidate })` indique si un pseudo
  est valide et libre (seule fonction ouverte aux visiteurs), pour l'afficher en direct.

### Activer le hook « Before User Created » (obligatoire)

Sans lui, l'inscription échoue bien, mais avec un message générique au lieu de
« pseudo non disponible ».

- **Projet hébergé** : Dashboard → Authentication → Hooks → *Before User Created* → type
  *Postgres*, schéma `public`, fonction `hook_before_user_created`.
- **Local** (`supabase/config.toml`, créé par `supabase init`) — clés à confirmer avec la
  documentation de la CLI installée :

  ```toml
  [auth.hook.before_user_created]
  enabled = true
  uri = "pg-functions://postgres/public/hook_before_user_created"
  ```

## Vérifier les migrations

`tests/check_signup.sql` rejoue les cas d'inscription (acceptée, refusée par le déclencheur, réponses
du hook, droits) sur une base neuve, dans un conteneur jetable :

```sh
docker run -d --name wolftarot-sql -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.004
# attendre que la base soit prête (pg_isready), puis :
for f in migrations/*.sql; do docker exec -i wolftarot-sql psql -v ON_ERROR_STOP=1 -U postgres -h localhost -d postgres < "$f"; done
docker exec -i wolftarot-sql psql -U supabase_admin -h localhost -d postgres < tests/check_signup.sql   # « OK 1 » à « OK 5 »
docker rm -f wolftarot-sql
```

### Ordre de base de la main (`settings.hand_order`)

```json
{ "groups": ["spades", "hearts", "clubs", "diamonds", "trumps", "excuse"], "direction": "ascending" }
```

`groups` : les six familles, chacune une fois, dans l'ordre d'affichage (ordre des couleurs,
position des atouts et de l'Excuse) ; `direction` : `ascending` ou `descending`. Toute autre forme
est refusée par la contrainte `settings_hand_order_valid`. Ci-dessus, la valeur par défaut.

Les mêmes règles existent en TypeScript dans `backend/src/profiles/` (`username.ts`,
`hand-order.ts`), réutilisables par le frontend ; un test du backend vérifie que les deux
versions restent identiques.

## Accès du backend

Le serveur de jeu lit les profils avec la clé **publique** du projet et le **jeton du joueur** :
la RLS s'applique. Il n'utilise jamais la clé `service_role` (voir `backend/README.md`).
