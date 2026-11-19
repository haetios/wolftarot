-- ════════════════════════════════════════════════════════════════════════════
-- B17.2 — Inscription : le pseudo choisi est obligatoire, valide et libre
-- (décision de l'humain du 19/11/2026)
--
-- Avant (B14), un pseudo absent, invalide ou déjà pris donnait un pseudo provisoire
-- « Joueur_xxxxxxxx ». Désormais, l'inscription échoue :
--
-- 1. Le hook Auth « before user created » (public.hook_before_user_created) refuse la création
--    du compte AVANT toute écriture, avec un message renvoyé tel quel au frontend :
--      - « username_invalid »     (HTTP 400) : pseudo absent ou invalide ;
--      - « username_unavailable » (HTTP 409) : pseudo déjà pris.
--    Le hook doit être activé dans le projet (voir supabase/README.md).
-- 2. Le déclencheur public.handle_new_user refuse aussi : c'est le filet de sécurité si le hook
--    n'est pas activé, ou si deux inscriptions simultanées choisissent le même pseudo. Supabase
--    Auth répond alors par une erreur générique (« Database error saving new user »).
--
-- Le pseudo est lu uniquement dans raw_user_meta_data->>'username'
-- (supabase.auth.signUp({ email, password, options: { data: { username } } })).
-- La vérification en direct public.username_available (B14) est conservée.
-- ════════════════════════════════════════════════════════════════════════════


-- Raison du refus d'un pseudo à l'inscription, ou NULL s'il est acceptable.
create function public.username_rejection(raw text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_valid_username(public.normalize_username(raw)) then 'username_invalid'
    when exists (
      select 1 from public.profiles as p
      where lower(p.username) = lower(public.normalize_username(raw))
    ) then 'username_unavailable'
  end
$$;


-- Hook Auth « before user created » : reçoit { metadata, user } et renvoie {} pour accepter,
-- ou { error: { http_code, message } } pour refuser (le message est transmis au client).
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reason text := public.username_rejection(event -> 'user' -> 'user_metadata' ->> 'username');
begin
  if reason is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', case reason when 'username_unavailable' then 409 else 400 end,
      'message', reason
    )
  );
end;
$$;


-- Déclencheur de création du profil : plus de pseudo provisoire, l'inscription échoue.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text := public.normalize_username(new.raw_user_meta_data ->> 'username');
begin
  if not public.is_valid_username(candidate) then
    raise exception using
      errcode = 'check_violation',
      message = 'username_invalid',
      hint = 'Le pseudo choisi à l''inscription est absent ou invalide.';
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, candidate);
  exception when unique_violation then
    raise exception using
      errcode = 'unique_violation',
      message = 'username_unavailable',
      hint = 'Ce pseudo est déjà pris.';
  end;

  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;


-- ─── Droits ─────────────────────────────────────────────────────────────────
-- Le hook n'est exécutable que par Supabase Auth (supabase_auth_admin), qui doit pouvoir accéder
-- au schéma public (recommandation de la documentation Supabase des hooks Postgres).
-- username_rejection est interne (le hook est security definer) : personne d'autre ne l'appelle.
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.username_rejection(text) from public, anon, authenticated;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
