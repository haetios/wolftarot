-- ════════════════════════════════════════════════════════════════════════════
-- B14 — Profils et paramètres des joueurs
--
-- - public.profiles : un profil par compte (1:1 avec auth.users), pseudo unique sans tenir
--   compte de la casse, créé automatiquement à l'inscription ;
-- - public.settings : paramètres d'un joueur (ordre de base des cartes de sa main), visibles
--   par lui seul ;
-- - RLS activée partout ; les pseudos sont lisibles par tout utilisateur connecté (ils
--   s'affichent aux tables), les paramètres par leur seul propriétaire.
--
-- Les règles de validation (pseudo, ordre de la main) sont aussi écrites en TypeScript dans
-- backend/src/profiles/ : un test du backend vérifie que les deux versions restent identiques.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Validation ─────────────────────────────────────────────────────────────

-- Forme canonique d'un pseudo saisi : blancs de bord retirés, puis normalisation NFC
-- (« e » + accent combinant devient « é » précomposé). NULL reste NULL.
create function public.normalize_username(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select normalize(regexp_replace(raw, '^\s+|\s+$', '', 'g'), NFC)
$$;

-- Pseudo valide (déjà normalisé) : 3 à 20 caractères ; lettres latines (accents du français
-- compris), chiffres, « _ » et « - » ; commence et finit par une lettre ou un chiffre.
-- C'est une liste blanche : espaces, caractères invisibles (U+200B, U+200D, U+FEFF…), U+202E
-- (inversion du sens d'écriture), accents combinants, lettres d'autres alphabets qui imitent
-- les lettres latines et emoji sont refusés. Les intervalles portent sur les points de code.
create function public.is_valid_username(username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select username is not null
    and char_length(username) between 3 and 20
    and username ~ '^[0-9A-Za-zÀ-ÖØ-öø-ÿŒœŸ]([0-9A-Za-zÀ-ÖØ-öø-ÿŒœŸ_-]*[0-9A-Za-zÀ-ÖØ-öø-ÿŒœŸ])?$'
$$;

-- Ordre de base de la main valide : un objet JSON avec exactement deux clés,
--   "groups"    : permutation des six familles (spades, hearts, diamonds, clubs, trumps, excuse),
--                 dans l'ordre d'affichage ;
--   "direction" : "ascending" ou "descending" (sens des valeurs dans chaque famille).
create function public.is_valid_hand_order(hand_order jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if hand_order is null or jsonb_typeof(hand_order) <> 'object' then
    return false;
  end if;
  if (select array_agg(k order by k collate "C") from jsonb_object_keys(hand_order) as k)
     is distinct from array['direction', 'groups'] then
    return false;
  end if;
  if jsonb_typeof(hand_order -> 'direction') <> 'string'
     or (hand_order ->> 'direction') not in ('ascending', 'descending') then
    return false;
  end if;
  if jsonb_typeof(hand_order -> 'groups') <> 'array' then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(hand_order -> 'groups') as g where jsonb_typeof(g) <> 'string'
  ) then
    return false;
  end if;
  return (
    select array_agg(g order by g collate "C") from jsonb_array_elements_text(hand_order -> 'groups') as g
  ) is not distinct from array['clubs', 'diamonds', 'excuse', 'hearts', 'spades', 'trumps'];
end;
$$;

-- Date de mise à jour tenue par la base (le client ne peut pas l'écrire).
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ─── Profils ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    constraint profiles_username_valid check (public.is_valid_username(username)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil public d''un joueur (1:1 avec auth.users), créé à l''inscription par on_auth_user_created.';
comment on column public.profiles.username is
  'Pseudo affiché aux tables ; unique sans tenir compte de la casse (profiles_username_unique_ci).';

-- Unicité sans tenir compte de la casse : « Alice » et « alice » sont le même pseudo.
create unique index profiles_username_unique_ci on public.profiles (lower(username));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ─── Paramètres ─────────────────────────────────────────────────────────────
-- Table séparée plutôt que colonne de profiles : la RLS filtre des lignes, pas des colonnes.
-- Les pseudos sont lisibles par tous les joueurs connectés, les paramètres par leur seul
-- propriétaire : deux tables donnent deux politiques simples.

create table public.settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hand_order jsonb not null
    default '{"groups": ["spades", "hearts", "clubs", "diamonds", "trumps", "excuse"], "direction": "ascending"}'::jsonb
    constraint settings_hand_order_valid check (public.is_valid_hand_order(hand_order)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.settings is
  'Paramètres d''un joueur, visibles et modifiables par lui seul ; créés à l''inscription.';
comment on column public.settings.hand_order is
  'Ordre de base des cartes de la main : {"groups": [6 familles], "direction": "ascending"|"descending"}.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();


-- ─── Création automatique à l'inscription ───────────────────────────────────
-- Le pseudo choisi à l'inscription arrive dans raw_user_meta_data->>'username'
-- (supabase.auth.signUp({ ..., options: { data: { username } } }), convention retenue en B13).
-- À défaut, pour une inscription OAuth, user_name puis preferred_username.
--
-- L'inscription n'échoue jamais à cause du pseudo : s'il est absent, invalide ou déjà pris
-- (course entre la vérification du frontend et l'inscription), le profil reçoit un pseudo
-- provisoire « Joueur_xxxxxxxx » que le joueur pourra changer. Le frontend détecte ce cas en
-- relisant le profil après l'inscription.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
  candidate text;
  attempt integer := 0;
begin
  foreach key in array array['username', 'user_name', 'preferred_username'] loop
    candidate := public.normalize_username(new.raw_user_meta_data ->> key);
    exit when public.is_valid_username(candidate);
    candidate := null;
  end loop;

  if candidate is null then
    candidate := 'Joueur_' || substr(md5(new.id::text), 1, 8);
  end if;

  loop
    begin
      insert into public.profiles (id, username) values (new.id, candidate);
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 5 then
        raise;
      end if;
      candidate := 'Joueur_' || substr(md5(new.id::text || attempt::text), 1, 8);
    end;
  end loop;

  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─── Disponibilité d'un pseudo (inscription) ────────────────────────────────
-- Un visiteur pas encore inscrit ne peut pas lire profiles (RLS) : cette fonction lui dit
-- seulement si un pseudo est valide et libre, sans rien révéler d'autre.
-- Appel : supabase.rpc('username_available', { candidate: 'Alice' }).
create function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_valid_username(public.normalize_username($1))
    and not exists (
      select 1 from public.profiles as p
      where lower(p.username) = lower(public.normalize_username($1))
    )
$$;


-- ─── Droits et RLS ──────────────────────────────────────────────────────────
-- Supabase accorde par défaut tous les droits sur les nouvelles tables et fonctions de public
-- aux rôles anon et authenticated : on les retire, puis on n'accorde que le nécessaire.
-- service_role (contourne la RLS) garde ses droits ; le backend ne l'utilise pas.

alter table public.profiles enable row level security;
alter table public.settings enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.settings from anon, authenticated;

-- Profils : lecture de tous les pseudos par un joueur connecté ; modification de son seul
-- pseudo. Ni insertion (déclencheur) ni suppression (cascade depuis auth.users).
grant select on table public.profiles to authenticated;
grant update (username) on table public.profiles to authenticated;

create policy "Authenticated users can read every profile"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Paramètres : lecture et modification par leur seul propriétaire. Pas d'insertion (la ligne
-- est créée à l'inscription) ni de suppression (cascade).
grant select on table public.settings to authenticated;
grant update (hand_order) on table public.settings to authenticated;

create policy "Users can read their own settings"
  on public.settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can update their own settings"
  on public.settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Fonctions : les fonctions de déclencheur ne s'appellent pas directement ; seule
-- username_available est ouverte aux visiteurs. Les fonctions de validation restent
-- exécutables (elles servent aux contraintes CHECK lors des mises à jour des joueurs).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
