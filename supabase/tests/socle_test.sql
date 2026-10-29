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
  m integer;
  ok boolean;
  log_ids bigint[];
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
  if n <> 5 then failures := failures || text 'profils non créés'; end if;
  select member_type = 'etudiant' into ok from public.profiles where id = d;
  if not ok then failures := failures || text 'membre d''honneur choisi à l''inscription'; end if;
  select phone = '0600000000' into ok from public.member_contacts where id = b;
  if not ok then failures := failures || text 'téléphone non enregistré'; end if;
  select count(*) into n from public.activity_log where action = 'inscription' and subject_id in (a, b, c, d, e);
  if n <> 5 then failures := failures || text 'inscriptions absentes du journal'; end if;

  -- 2. Un compte en attente ne voit que lui-même et ne peut rien changer
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  if n <> 1 then failures := failures || format('en attente : voit %s profils au lieu de 1', n); end if;
  begin
    update public.profiles set status = 'actif' where id = b;
    failures := failures || text 'en attente : a pu changer son statut';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set member_type = 'honneur' where id = b;
    failures := failures || text 'en attente : a pu changer son type';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.validate_member(b);
    failures := failures || text 'en attente : a pu se valider';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.activity_log (actor_name, category, action, summary) values ('x', 'comptes', 'x', 'faux');
    failures := failures || text 'en attente : a pu écrire dans le journal';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set bio = 'Bonjour' where id = b;
  reset role;
  select bio = 'Bonjour' into ok from public.profiles where id = b;
  if not ok then failures := failures || text 'en attente : bio non modifiée'; end if;

  -- 3. L'admin valide et refuse
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.validate_member(c);
    failures := failures || text 'admin : a validé un email non confirmé';
  exception when invalid_parameter_value then null;
  end;
  perform public.validate_member(b);
  begin
    perform public.refuse_member(d, '');
    failures := failures || text 'admin : refus sans motif accepté';
  exception when invalid_parameter_value then null;
  end;
  perform public.refuse_member(d, 'Pas membre de l''AEGB');
  select count(*) into n from public.activity_log;
  if n = 0 then failures := failures || text 'admin : ne voit pas le journal'; end if;
  reset role;
  select status = 'actif' into ok from public.profiles where id = b;
  if not ok then failures := failures || text 'validation non enregistrée'; end if;
  select status = 'refuse' and refusal_reason = 'Pas membre de l''AEGB' into ok from public.profiles where id = d;
  if not ok then failures := failures || text 'refus non enregistré'; end if;

  -- 4. Un membre actif sans poste voit les membres actifs, pas les coordonnées
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id in (a, b, c, d, e);
  if n <> 3 then failures := failures || format('membre : voit %s profils au lieu de 3', n); end if;
  select count(*) into n from public.member_contacts;
  if n <> 1 then failures := failures || format('membre : voit %s coordonnées au lieu de 1', n); end if;
  select count(*) into n from public.activity_log;
  if n <> 0 then failures := failures || text 'membre : voit le journal'; end if;
  if public.is_bureau() then failures := failures || text 'membre : vu comme bureau'; end if;
  reset role;

  -- 5. L'admin nomme Binta au secrétariat général
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.assign_role('secretariat', b);
  begin
    perform public.assign_role('communication', b);
    failures := failures || text 'admin : une personne a reçu deux postes';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.assign_role('tresorerie', c);
    failures := failures || text 'admin : poste donné à un compte non validé';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.clear_role('admin_numerique');
    failures := failures || text 'admin : poste d''admin retiré';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- 6. Le secrétariat gère les membres mais pas les postes ni le journal
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.can('membres') then failures := failures || text 'secrétariat : pas d''accès aux membres'; end if;
  if public.can('postes', 'lecture') then failures := failures || text 'secrétariat : voit les postes'; end if;
  select count(*) into n from public.profiles where id in (a, b, c, d, e);
  if n <> 5 then failures := failures || format('secrétariat : voit %s profils au lieu de 5', n); end if;
  select count(*) into n from public.member_contacts where id in (a, b, c, d, e);
  if n <> 5 then failures := failures || format('secrétariat : voit %s coordonnées au lieu de 5', n); end if;
  select count(*) into n from public.activity_log;
  if n <> 0 then failures := failures || text 'secrétariat : voit le journal'; end if;
  begin
    perform public.assign_role('tresorerie', e);
    failures := failures || text 'secrétariat : a attribué un poste';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.suspend_member(a, 'Test de suspension');
    failures := failures || text 'secrétariat : a suspendu l''admin';
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
  if not ok then failures := failures || text 'changement de type non enregistré'; end if;
  reset role;

  -- 8. L'admin ouvre le journal au secrétariat
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_role_permission('secretariat', 'journal', 'lecture');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activity_log;
  if n = 0 then failures := failures || text 'secrétariat : journal toujours fermé'; end if;
  reset role;

  -- 9. Un membre suspendu perd ses droits et ne voit plus les autres
  update public.profiles set status = 'suspendu' where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.can('membres', 'lecture') then failures := failures || text 'suspendu : garde ses droits'; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then failures := failures || format('suspendu : voit %s profils', n); end if;
  reset role;

  -- 10. Le journal ne se modifie pas, même en tant que postgres
  begin
    delete from public.activity_log where subject_id = e;
    failures := failures || text 'journal : effacement possible';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.activity_log set summary = 'modifié' where subject_id = e;
    failures := failures || text 'journal : modification possible';
  exception when insufficient_privilege then null;
  end;

  -- 11. Un visiteur ne lit que la charte et la liste du bureau
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.charter_versions;
  if n = 0 then failures := failures || text 'visiteur : ne lit pas la charte'; end if;
  select count(*) into n from public.public_bureau();
  if n <> 7 then failures := failures || text 'visiteur : ne lit pas les postes'; end if;
  begin
    select count(*) into n from public.profiles;
    failures := failures || text 'visiteur : lit les profils';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 12. Les droits de l'admin numérique restent secrets
  select count(*) into m from public.bureau_screens;
  update public.profiles set status = 'actif' where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.bureau_roles where locked;
    failures := failures || text 'secrétariat : lit les postes protégés';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.bureau_roles;
  if n <> 7 then failures := failures || format('secrétariat : voit %s postes au lieu de 7', n); end if;
  select (public.my_bureau() ->> 'guarantor')::boolean into ok;
  if ok then failures := failures || text 'secrétariat : vu comme admin numérique'; end if;
  select public.my_bureau() -> 'access' ? 'journal' into ok;
  if not ok then failures := failures || text 'secrétariat : ses droits manquent'; end if;
  begin
    perform public.transfer_guarantor(b);
    failures := failures || text 'secrétariat : a pris le poste d''admin';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 13. Prénom et nom obligatoires, sauf pour le titulaire du poste d'admin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set last_name = ' ' where id = b;
    failures := failures || text 'membre : nom vide accepté';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from jsonb_object_keys(public.my_bureau() -> 'access');
  if n <> m then failures := failures || format('admin : %s écrans sur %s', n, m); end if;
  begin
    update public.profiles set last_name = '' where id = a;
  exception when invalid_parameter_value then
    failures := failures || text 'admin : nom vide refusé';
  end;
  reset role;

  -- 14. L'admin transmet son poste ; lui seul pouvait le faire
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.transfer_guarantor(b);
    failures := failures || text 'admin : poste transmis à une personne qui en a déjà un';
  exception when invalid_parameter_value then null;
  end;
  perform public.transfer_guarantor(e);
  if public.my_bureau() is not null then failures := failures || text 'ancien admin : garde ses droits'; end if;
  begin
    perform public.transfer_guarantor(a);
    failures := failures || text 'ancien admin : a repris le poste';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select holder_id = e into ok from public.bureau_roles where code = 'admin_numerique';
  if not ok then failures := failures || text 'transmission : poste non transmis'; end if;
  select count(*) into n from public.activity_log where action = 'attribution_poste' and subject_id = e;
  if n <> 1 then failures := failures || text 'transmission : absente du journal'; end if;

  -- 15. Ce que fait le titulaire du poste d'admin est signé « Le bureau »
  select count(*) into n from public.activity_log where actor_id = a and subject_id is distinct from a;
  if n <> 0 then failures := failures || format('discrétion : %s lignes du journal au nom de l''admin', n); end if;
  select array_agg(log_id) into log_ids from private.discreet_actors where actor_id = a;
  if coalesce(cardinality(log_ids), 0) = 0 then failures := failures || text 'discrétion : vrai auteur perdu'; end if;
  select validated_by is null into ok from public.profiles where id = b;
  if not ok then failures := failures || text 'discrétion : « validé par » au nom de l''admin'; end if;
  select actor_name = 'Le bureau' into ok from public.activity_log where action = 'attribution_poste' and subject_id = e;
  if not ok then failures := failures || text 'discrétion : transmission au nom de l''admin'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.activity_log where actor_name = 'Le bureau';
  if n = 0 then failures := failures || text 'discrétion : le secrétariat ne voit pas « Le bureau »'; end if;
  begin
    perform public.discreet_authors(log_ids);
    failures := failures || text 'discrétion : le secrétariat lit les vrais auteurs';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.discreet_authors(log_ids) where actor_name = 'Awa';
  if n <> cardinality(log_ids) then failures := failures || text 'discrétion : le successeur ne lit pas les vrais auteurs'; end if;
  perform public.warn_member(b, 'Test de discrétion');
  reset role;
  select given_by is null and given_by_name = 'Le bureau' into ok from public.member_warnings where member_id = b;
  if not ok then failures := failures || text 'discrétion : avertissement au nom de l''admin'; end if;

  -- 16. Pendant les essais, seul le titulaire vide le journal ; le verrou est définitif
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.clear_journal();
    failures := failures || text 'essais : le secrétariat a vidé le journal';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.clear_journal();
  reset role;
  select count(*) into n from public.activity_log;
  if n <> 0 then failures := failures || format('essais : %s lignes restent après le vidage', n); end if;
  select count(*) into n from private.discreet_actors;
  if n <> 0 then failures := failures || text 'essais : vrais auteurs restés après le vidage'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.lock_journal();
  if not public.journal_locked() then failures := failures || text 'essais : journal non verrouillé'; end if;
  begin
    perform public.clear_journal();
    failures := failures || text 'essais : journal vidé après le verrou';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  begin
    perform set_config('aegb.clear_journal', 'on', true);
    delete from public.activity_log where id is not null;
    failures := failures || text 'essais : effacement possible après le verrou';
  exception when insufficient_privilege then null;
  end;
  perform set_config('aegb.clear_journal', 'off', true);
  begin
    update private.journal_lock set locked_at = null where only_row;
    failures := failures || text 'essais : verrou enlevé';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.activity_log where action = 'verrou_journal';
  if n <> 1 then failures := failures || text 'essais : verrou absent du journal'; end if;

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
