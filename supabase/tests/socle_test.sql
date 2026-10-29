-- Test des règles d'accès du socle (lot 1).
--
-- Le script crée des comptes fictifs, joue des scénarios en se faisant passer
-- pour chacun, puis lève une erreur qui annule tout : la base reste intacte.
-- Le message final commence par « TESTS OK » ou par « ÉCHEC ».
--
-- À lancer dans l'éditeur SQL de Supabase (ou avec psql) en tant que postgres.

do $$
declare
  a uuid := gen_random_uuid(); -- admin numérique
  b uuid := gen_random_uuid(); -- inscrit, email confirmé
  c uuid := gen_random_uuid(); -- inscrit, email non confirmé
  d uuid := gen_random_uuid(); -- inscrit qui demande « membre d'honneur »
  e uuid := gen_random_uuid(); -- membre déjà actif
  n integer;
  ok boolean;
  failures text[] := '{}';

begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.invalid',
     '{"first_name":"Awa","last_name":"Admin","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.invalid',
     '{"first_name":"Bah","last_name":"Binta","member_type":"alumni","phone":"0600000000","charter_version":"1"}', now(), now(), now()),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.invalid',
     '{"first_name":"Camara","last_name":"Cheick","member_type":"sympathisant","charter_version":"1"}', null, now(), now()),
    (d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@test.invalid',
     '{"first_name":"Diallo","last_name":"Djenab","member_type":"honneur","charter_version":"1"}', now(), now(), now()),
    (e, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@test.invalid',
     '{"first_name":"Eric","last_name":"Esso"}', now(), now(), now());

  -- Le premier admin est désigné à l'installation, en SQL.
  update public.profiles set status = 'actif', validated_at = now() where id in (a, e);
  update public.bureau_roles set holder_id = a, assigned_at = now() where code = 'admin_numerique';

  -- 1. Création des profils
  select count(*) into n from public.profiles where id in (a, b, c, d, e);
  if n <> 5 then failures := failures || 'profils non créés'; end if;
  select member_type = 'etudiant' into ok from public.profiles where id = d;
  if not ok then failures := failures || 'membre d''honneur choisi à l''inscription'; end if;
  select phone = '0600000000' into ok from public.member_contacts where id = b;
  if not ok then failures := failures || 'téléphone non enregistré'; end if;
  select count(*) into n from public.activity_log where action = 'inscription' and subject_id in (a, b, c, d, e);
  if n <> 5 then failures := failures || 'inscriptions absentes du journal'; end if;

  -- 2. Un compte en attente ne voit que lui-même et ne peut rien changer
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  if n <> 1 then failures := failures || format('en attente : voit %s profils au lieu de 1', n); end if;
  begin
    update public.profiles set status = 'actif' where id = b;
    failures := failures || 'en attente : a pu changer son statut';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set member_type = 'honneur' where id = b;
    failures := failures || 'en attente : a pu changer son type';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.validate_member(b);
    failures := failures || 'en attente : a pu se valider';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.activity_log (actor_name, category, action, summary) values ('x', 'comptes', 'x', 'faux');
    failures := failures || 'en attente : a pu écrire dans le journal';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set bio = 'Bonjour' where id = b;
  reset role;
  select bio = 'Bonjour' into ok from public.profiles where id = b;
  if not ok then failures := failures || 'en attente : bio non modifiée'; end if;

  -- 3. L'admin valide et refuse
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.validate_member(c);
    failures := failures || 'admin : a validé un email non confirmé';
  exception when invalid_parameter_value then null;
  end;
  perform public.validate_member(b);
  begin
    perform public.refuse_member(d, '');
    failures := failures || 'admin : refus sans motif accepté';
  exception when invalid_parameter_value then null;
  end;
  perform public.refuse_member(d, 'Pas membre de l''AEGB');
  select count(*) into n from public.activity_log;
  if n = 0 then failures := failures || 'admin : ne voit pas le journal'; end if;
  reset role;
  select status = 'actif' into ok from public.profiles where id = b;
  if not ok then failures := failures || 'validation non enregistrée'; end if;
  select status = 'refuse' and refusal_reason = 'Pas membre de l''AEGB' into ok from public.profiles where id = d;
  if not ok then failures := failures || 'refus non enregistré'; end if;

  -- 4. Un membre actif sans poste voit les membres actifs, pas les coordonnées
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id in (a, b, c, d, e);
  if n <> 3 then failures := failures || format('membre : voit %s profils au lieu de 3', n); end if;
  select count(*) into n from public.member_contacts;
  if n <> 1 then failures := failures || format('membre : voit %s coordonnées au lieu de 1', n); end if;
  select count(*) into n from public.activity_log;
  if n <> 0 then failures := failures || 'membre : voit le journal'; end if;
  if public.is_bureau() then failures := failures || 'membre : vu comme bureau'; end if;
  reset role;

  -- 5. L'admin nomme Binta au secrétariat général
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.assign_role('secretariat', b);
  begin
    perform public.assign_role('communication', b);
    failures := failures || 'admin : une personne a reçu deux postes';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.assign_role('tresorerie', c);
    failures := failures || 'admin : poste donné à un compte non validé';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.clear_role('admin_numerique');
    failures := failures || 'admin : poste d''admin retiré';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- 6. Le secrétariat gère les membres mais pas les postes ni le journal
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.can('membres') then failures := failures || 'secrétariat : pas d''accès aux membres'; end if;
  if public.can('postes', 'lecture') then failures := failures || 'secrétariat : voit les postes'; end if;
  select count(*) into n from public.profiles where id in (a, b, c, d, e);
  if n <> 5 then failures := failures || format('secrétariat : voit %s profils au lieu de 5', n); end if;
  select count(*) into n from public.member_contacts where id in (a, b, c, d, e);
  if n <> 5 then failures := failures || format('secrétariat : voit %s coordonnées au lieu de 5', n); end if;
  select count(*) into n from public.activity_log;
  if n <> 0 then failures := failures || 'secrétariat : voit le journal'; end if;
  begin
    perform public.assign_role('tresorerie', e);
    failures := failures || 'secrétariat : a attribué un poste';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.suspend_member(a, 'Test de suspension');
    failures := failures || 'secrétariat : a suspendu l''admin';
  exception when invalid_parameter_value then null;
  end;
  perform public.warn_member(e, 'Message hors sujet dans le groupe');
  perform public.suspend_member(e, 'Propos irrespectueux');
  perform public.reactivate_member(e);
  perform public.set_member_type(e, 'honneur');
  select count(*) into n from public.member_history(e);
  if n < 5 then failures := failures || format('secrétariat : historique de %s lignes', n); end if;
  reset role;

  -- 7. Le membre averti voit son avertissement, pas ceux des autres
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.member_warnings;
  if n <> 1 then failures := failures || format('membre averti : voit %s avertissements', n); end if;
  select member_type = 'honneur' into ok from public.profiles where id = e;
  if not ok then failures := failures || 'changement de type non enregistré'; end if;
  reset role;

  -- 8. L'admin ouvre le journal au secrétariat
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_role_permission('secretariat', 'journal', 'lecture');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activity_log;
  if n = 0 then failures := failures || 'secrétariat : journal toujours fermé'; end if;
  reset role;

  -- 9. Un membre suspendu perd ses droits et ne voit plus les autres
  update public.profiles set status = 'suspendu' where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.can('membres', 'lecture') then failures := failures || 'suspendu : garde ses droits'; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then failures := failures || format('suspendu : voit %s profils', n); end if;
  reset role;

  -- 10. Le journal ne se modifie pas, même en tant que postgres
  begin
    delete from public.activity_log where subject_id = e;
    failures := failures || 'journal : effacement possible';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.activity_log set summary = 'modifié' where subject_id = e;
    failures := failures || 'journal : modification possible';
  exception when insufficient_privilege then null;
  end;

  -- 11. Un visiteur ne lit que la charte et la liste du bureau
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.charter_versions;
  if n = 0 then failures := failures || 'visiteur : ne lit pas la charte'; end if;
  select count(*) into n from public.public_bureau();
  if n <> 7 then failures := failures || 'visiteur : ne lit pas les postes'; end if;
  begin
    select count(*) into n from public.profiles;
    failures := failures || 'visiteur : lit les profils';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
