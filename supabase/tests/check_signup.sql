\set ON_ERROR_STOP 1
\set QUIET 1
-- Vérification des inscriptions (migrations B14 puis B17.2), dans un conteneur supabase/postgres
-- jetable. Chaque bloc lève une exception si une attente n'est pas remplie.

-- 1. Inscriptions valides : profil et paramètres créés (comme GoTrue : rôle supabase_auth_admin)
set role supabase_auth_admin;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', '{"username": "Alice"}'),
  ('00000000-0000-4000-8000-00000000000b', '{"username": "  bob  "}'),
  ('00000000-0000-4000-8000-000000000010', jsonb_build_object('username', 'He' || U&'\0301' || 'le' || U&'\0300' || 'ne'));
reset role;
do $$
begin
  assert (select username from public.profiles where id = '00000000-0000-4000-8000-00000000000a') = 'Alice';
  assert (select username from public.profiles where id = '00000000-0000-4000-8000-00000000000b') = 'bob';
  assert (select username from public.profiles where id = '00000000-0000-4000-8000-000000000010') = 'Hélène';
  assert (select count(*) from public.settings) = 3;
  raise notice 'OK 1 : inscriptions valides';
end $$;

-- 2. Le déclencheur fait échouer l'inscription (filet de sécurité), sans rien créer
do $$
declare
  meta jsonb;
  expected text;
  got text;
  cases jsonb := jsonb_build_array(
    jsonb_build_array('{"username": "ALICE"}'::jsonb, 'username_unavailable'),
    jsonb_build_array('{"username": "hélène"}'::jsonb, 'username_unavailable'),
    jsonb_build_array('{}'::jsonb, 'username_invalid'),
    jsonb_build_array('null'::jsonb, 'username_invalid'),
    jsonb_build_array('{"username": "ab"}'::jsonb, 'username_invalid'),
    jsonb_build_array('{"username": 12}'::jsonb, 'username_invalid'),
    jsonb_build_array('{"username": ["Alice"]}'::jsonb, 'username_invalid'),
    jsonb_build_array(jsonb_build_object('username', 'Ali' || U&'\202E' || 'ce'), 'username_invalid'),
    -- Plus de repli OAuth : seul « username » compte.
    jsonb_build_array('{"user_name": "gh-carol"}'::jsonb, 'username_invalid')
  );
  c jsonb;
begin
  for c in select * from jsonb_array_elements(cases) loop
    meta := c -> 0;
    expected := c ->> 1;
    got := null;
    begin
      set local role supabase_auth_admin;
      insert into auth.users (id, raw_user_meta_data)
        values (gen_random_uuid(), case when jsonb_typeof(meta) = 'null' then null else meta end);
    exception when others then
      got := sqlerrm;
    end;
    reset role;
    assert got = expected, format('inscription %s : attendu %s, obtenu %s', meta, expected, coalesce(got, 'acceptée'));
  end loop;
  assert (select count(*) from auth.users) = 3, 'aucun compte refusé ne doit exister';
  assert (select count(*) from public.profiles) = 3;
  assert (select count(*) from public.settings) = 3;
  assert (select count(*) from public.profiles where username ~ '^Joueur_') = 0;
  raise notice 'OK 2 : inscriptions refusées par le déclencheur';
end $$;

-- 3. Le hook « before user created » (appelé par supabase_auth_admin)
set role supabase_auth_admin;
do $$
declare
  ev jsonb;
  r jsonb;
begin
  -- pseudo libre : accepté
  r := public.hook_before_user_created('{"metadata": {"name": "before-user-created"}, "user": {"user_metadata": {"username": "Carol"}}}');
  assert r = '{}'::jsonb, format('Carol devrait être acceptée : %s', r);
  -- pris (casse et accents)
  r := public.hook_before_user_created('{"user": {"user_metadata": {"username": "alice"}}}');
  assert r = '{"error": {"http_code": 409, "message": "username_unavailable"}}'::jsonb, format('alice : %s', r);
  r := public.hook_before_user_created('{"user": {"user_metadata": {"username": "HÉLÈNE"}}}');
  assert r -> 'error' ->> 'message' = 'username_unavailable', format('HÉLÈNE : %s', r);
  -- absent, invalide, forme inattendue
  foreach ev in array array[
    '{"user": {"user_metadata": {}}}',
    '{"user": {}}',
    '{}',
    '{"user": {"user_metadata": {"username": "a b"}}}',
    '{"user": {"user_metadata": {"username": 12}}}',
    '{"user": {"user_metadata": ["Carol"]}}',
    '{"user": {"user_metadata": {"user_name": "gh-carol"}}}'
  ]::jsonb[] loop
    r := public.hook_before_user_created(ev);
    assert r = '{"error": {"http_code": 400, "message": "username_invalid"}}'::jsonb, format('%s : %s', ev, r);
  end loop;
  r := public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('user_metadata',
         jsonb_build_object('username', 'Ali' || U&'\202E' || 'ce'))));
  assert r -> 'error' ->> 'message' = 'username_invalid';
  raise notice 'OK 3 : hook before user created';
end $$;
reset role;

-- 4. Droits : le hook et username_rejection ne sont pas appelables par les joueurs ni les visiteurs
do $$
declare
  r text;
  denied boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    denied := false;
    begin
      execute format('set local role %I', r);
      perform public.hook_before_user_created('{}');
    exception when insufficient_privilege then denied := true;
    end;
    reset role;
    assert denied, format('%s ne doit pas pouvoir appeler le hook', r);

    denied := false;
    begin
      execute format('set local role %I', r);
      perform public.username_rejection('Alice');
    exception when insufficient_privilege then denied := true;
    end;
    reset role;
    assert denied, format('%s ne doit pas pouvoir appeler username_rejection', r);
  end loop;
  assert has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute');
  raise notice 'OK 4 : droits du hook';
end $$;

-- 5. username_available (B14) est conservée et cohérente
set role anon;
do $$
begin
  assert public.username_available('Carol');
  assert not public.username_available('ALICE');
  assert not public.username_available('a b');
  raise notice 'OK 5 : username_available conservée (visiteurs)';
end $$;
reset role;
