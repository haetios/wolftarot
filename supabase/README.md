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
- À l'inscription, le pseudo est lu dans `raw_user_meta_data->>'username'`
  (`supabase.auth.signUp({ email, password, options: { data: { username } } })`), puis
  `user_name` et `preferred_username` (OAuth). Il est normalisé (blancs de bord, NFC).
  S'il est absent, invalide ou déjà pris, le profil reçoit un pseudo provisoire `Joueur_xxxxxxxx`
  que le joueur peut changer : l'inscription n'échoue jamais à cause du pseudo.
- Avant l'inscription, `supabase.rpc('username_available', { candidate })` indique si un pseudo
  est valide et libre (seule fonction ouverte aux visiteurs).

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
