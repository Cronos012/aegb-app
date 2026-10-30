-- Test de l'assemblée générale et des élections (lot 5) : droits de vote,
-- brouillon, convocation, candidatures, ouverture, vote secret, rappel,
-- fermeture, égalité et second tour, publication, passation, quorum non
-- atteint et seconde AG, annulation, vider les essais.
--
-- Comme les autres tests, le script crée des comptes fictifs, joue des
-- scénarios en se faisant passer pour chacun, puis lève une erreur qui annule
-- tout : la base reste intacte. Le message final commence par « TESTS OK » ou
-- par « ÉCHEC ».
--
-- À lancer dans l'éditeur SQL de Supabase (ou avec psql) en tant que postgres.
-- Le jour et l'heure sont fixés par les réglages aegb.today et aegb.now, que
-- seule une connexion d'administration peut utiliser.

do $$
declare
  sec uuid := gen_random_uuid();   -- Hawa, secrétariat général : prépare l'AG
  e1 uuid := gen_random_uuid();    -- Alpha, candidat à la présidence
  e2 uuid := gen_random_uuid();    -- Mamadou, candidat à la présidence
  e3 uuid := gen_random_uuid();    -- Aïssatou, candidate au secrétariat
  e4 uuid := gen_random_uuid();    -- Djénabou, candidate au secrétariat
  e5 uuid := gen_random_uuid();    -- Lansana, candidat à la trésorerie, en retard à l'ouverture
  e6 uuid := gen_random_uuid();    -- Ousmane, se présente puis se retire
  e7 uuid := gen_random_uuid();    -- Binta, candidature papier à la communication
  e8 uuid := gen_random_uuid();    -- Mariama, vote au second tour seulement
  lt uuid := gen_random_uuid();    -- Thierno, en retard, règle pendant le vote
  al uuid := gen_random_uuid();    -- Coumba, alumni : voix consultative
  pe uuid := gen_random_uuid();    -- Wouri, inscription en attente
  g uuid;                          -- admin numérique (titulaire actuel, ou fictif)
  pay uuid := gen_random_uuid();
  ag uuid;
  ag2 uuid;
  ag3 uuid;
  b uuid;
  b2 uuid;
  q_r1 uuid;
  q_r2 uuid;
  q_pres uuid;
  q_sec uuid;
  q_com uuid;
  c1 uuid;
  c2 uuid;
  c3 uuid;
  c4 uuid;
  c5 uuid;
  c6 uuid;
  c7 uuid;
  c8 uuid;
  n integer;
  t text;
  j jsonb;
  ts timestamptz;
  items jsonb := '[
    {"kind": "resolution", "title": "Rapport moral 2026", "detail": "Présenté par la présidence"},
    {"kind": "resolution", "title": "Cotisation 2027", "detail": "5 € par mois"},
    {"kind": "election", "title": "Élection du bureau 2027", "seats": ["presidence", "secretariat", "tresorerie", "communication"]},
    {"kind": "discussion", "title": "Questions diverses"}
  ]';
  failures text[] := '{}';
begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ag-' || x.n || '@test.invalid',
         jsonb_build_object('first_name', x.f, 'last_name', x.l, 'member_type', 'etudiant', 'charter_version', '1'), now(), now(), now()
  from (values (sec, 'sec', 'Hawa', 'Condé'), (e1, 'e1', 'Alpha', 'Diallo'), (e2, 'e2', 'Mamadou', 'Barry'),
               (e3, 'e3', 'Aïssatou', 'Diallo'), (e4, 'e4', 'Djénabou', 'Barry'), (e5, 'e5', 'Lansana', 'Touré'),
               (e6, 'e6', 'Ousmane', 'Bangoura'), (e7, 'e7', 'Binta', 'Camara'), (e8, 'e8', 'Mariama', 'Sow'),
               (lt, 'lt', 'Thierno', 'Baldé'), (al, 'al', 'Coumba', 'Kaba'), (pe, 'pe', 'Wouri', 'Wane')) x (id, n, f, l);

  update public.profiles set status = 'actif', validated_at = '2026-09-10 12:00+02'
  where id in (sec, e1, e2, e3, e4, e5, e6, e7, e8, lt, al);
  update public.profiles set member_type = 'alumni' where id = al;

  -- Les membres actifs du test sont les seuls qu'on compte : les autres
  -- passent en attente le temps du test (tout est annulé à la fin).
  update public.profiles set status = 'en_attente'
  where status = 'actif' and id not in (sec, e1, e2, e3, e4, e5, e6, e7, e8, lt, al);

  update public.bureau_roles set holder_id = null where not locked;
  update public.bureau_roles set holder_id = sec, assigned_at = now() where code = 'secretariat';
  select holder_id into g from public.bureau_roles where code = 'admin_numerique';
  if g is null then
    g := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ag-g@test.invalid',
      '{"first_name":"Garant","last_name":"Test","member_type":"etudiant","charter_version":"1"}', now(), now(), now());
    update public.bureau_roles set holder_id = g, assigned_at = now() where code = 'admin_numerique';
  end if;
  update public.profiles set status = 'actif', validated_at = coalesce(validated_at, now()), member_type = 'sympathisant' where id = g;

  -- Cotisation : 5 € par mois depuis septembre 2026, tout le monde à jour
  -- jusqu'en janvier 2027, sauf Thierno (rien payé).
  update public.dues_settings set monthly_cents = 500, start_month = '2026-09-01', paying_types = '{etudiant}';
  insert into public.dues_payments (id, member_id, member_name, method, status, months, monthly_cents, amount_cents)
  values (pay, sec, 'Essai', 'especes', 'confirme', '{2026-09-01}', 500, 500);
  insert into public.dues_coverage (member_id, month, payment_id, amount_cents)
  select m, mo::date, pay, 500
  from unnest(array[sec, e1, e2, e3, e4, e5, e6, e7, e8]) m
  cross join generate_series('2026-09-01'::date, '2027-01-01'::date, interval '1 month') mo;

  perform set_config('aegb.today', '2026-11-20', true);
  perform set_config('aegb.now', '2026-11-20 10:00+01', true);

  -- 1. Droits de vote et quorum ------------------------------------------------
  if private.vote_right(e1) <> 'actif' or private.vote_right(lt) <> 'suspendu'
     or private.vote_right(al) <> 'consultatif' or private.vote_right(pe) <> 'aucun' then
    failures := failures || ('droits : ' || private.vote_right(e1) || ' ' || private.vote_right(lt) || ' '
      || private.vote_right(al) || ' ' || private.vote_right(pe));
  end if;
  if private.quorum_needed('ordinaire', 1::smallint, 1::smallint, 96) <> 32
     or private.quorum_needed('ordinaire', 1::smallint, 1::smallint, 97) <> 33
     or private.quorum_needed('extraordinaire', 1::smallint, 1::smallint, 96) <> 48
     or private.quorum_needed('extraordinaire', 1::smallint, 1::smallint, 97) <> 49
     or private.quorum_needed('ordinaire', 2::smallint, 1::smallint, 96) <> 0
     or private.quorum_needed('extraordinaire', 2::smallint, 1::smallint, 96) <> 32
     or private.quorum_needed('ordinaire', 1::smallint, 2::smallint, 96) <> 0 then
    failures := failures || text 'quorum : mauvais calcul';
  end if;
  if private.hour_label('2026-12-12 14:00+01') <> '14 h' or private.hour_label('2026-12-05 23:59+01') <> '23 h 59'
     or private.day_label('2026-12-12 14:00+01') <> 'samedi 12 décembre 2026' then
    failures := failures || ('libellés : ' || private.hour_label('2026-12-05 23:59+01') || ' / ' || private.day_label('2026-12-12 14:00+01'));
  end if;

  -- 2. Brouillon -----------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_assembly(null, 'ordinaire', '2026-12-12 14:00+01', 'UFR Sciences, Brest',
      '2026-12-12 15:00+01', '2026-12-12 17:00+01', '2026-12-05 23:59+01', '2027-01-01', items);
    failures := failures || text 'brouillon : un membre sans poste prépare une AG';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.assembly_admin();
    failures := failures || text 'brouillon : un membre sans poste voit l''écran du bureau';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_assembly(null, 'ordinaire', '2026-12-12 14:00+01', 'UFR Sciences, Brest',
      '2026-12-13 15:00+01', '2026-12-13 17:00+01', '2026-12-05 23:59+01', '2027-01-01', items);
    failures := failures || text 'brouillon : vote un autre jour que l''AG';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_assembly(null, 'ordinaire', '2026-12-12 14:00+01', 'UFR Sciences, Brest',
      '2026-12-12 15:00+01', '2026-12-12 17:00+01', '2026-12-12 16:00+01', '2027-01-01', items);
    failures := failures || text 'brouillon : candidatures fermées après l''ouverture du vote';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_assembly(null, 'ordinaire', '2026-12-12 14:00+01', 'UFR Sciences, Brest',
      '2026-12-12 15:00+01', '2026-12-12 17:00+01', null, null,
      '[{"kind": "discussion", "title": "Questions diverses"}]');
    failures := failures || text 'brouillon : rien à voter';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_assembly(null, 'ordinaire', '2026-12-12 14:00+01', 'UFR Sciences, Brest',
      '2026-12-12 15:00+01', '2026-12-12 17:00+01', '2026-12-05 23:59+01', null,
      '[{"kind": "election", "title": "Élection", "seats": ["admin_numerique"]}]');
    failures := failures || text 'brouillon : un poste qui ne s''élit pas';
  exception when invalid_parameter_value then null;
  end;
  ag := public.save_assembly(null, 'ordinaire', '2026-12-12 14:00+01', 'UFR Science', '2026-12-12 15:00+01',
    '2026-12-12 17:00+01', '2026-12-05 23:59+01', '2027-01-01', items);
  -- Modifier le brouillon : le lieu change.
  perform public.save_assembly(ag, 'ordinaire', '2026-12-12 14:00+01', 'UFR Sciences, Brest', '2026-12-12 15:00+01',
    '2026-12-12 17:00+01', '2026-12-05 23:59+01', '2027-01-01', items);
  begin
    perform public.save_assembly(null, 'extraordinaire', '2026-12-19 14:00+01', 'Ailleurs', '2026-12-19 15:00+01',
      '2026-12-19 17:00+01', null, null, '[{"kind": "resolution", "title": "Statuts"}]');
    failures := failures || text 'brouillon : deux AG en même temps';
  exception when invalid_parameter_value then null;
  end;
  j := public.assembly_admin();
  if j -> 'assembly' ->> 'status' <> 'brouillon' or j -> 'assembly' ->> 'place' <> 'UFR Sciences, Brest'
     or jsonb_array_length(j -> 'assembly' -> 'items') <> 4 or jsonb_array_length(j -> 'assembly' -> 'seats') <> 4
     or (j ->> 'electorate')::integer <> 9 or (j ->> 'members')::integer <> 12 then
    failures := failures || ('brouillon : vue du bureau ' || (j ->> 'electorate') || ' ' || (j ->> 'members'));
  end if;
  reset role;

  -- Un membre ne voit pas le brouillon.
  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.assembly_view() is not null then
    failures := failures || text 'brouillon : visible par les membres';
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pe, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.assembly_view();
    failures := failures || text 'vue : un inscrit en attente voit l''AG';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 3. Convocation : 15 jours avant au moins (article 12) -------------------------
  perform set_config('aegb.now', '2026-11-30 10:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.send_convocation(ag);
    failures := failures || text 'convocation : partie 12 jours avant sans confirmation';
  exception when raise_exception then
    get stacked diagnostics t = pg_exception_hint;
    if t is distinct from 'trop_proche' then failures := failures || ('convocation : indice ' || coalesce(t, '-')); end if;
  end;
  reset role;
  perform set_config('aegb.now', '2026-11-20 10:00+01', true);
  set local role authenticated;
  n := public.send_convocation(ag);
  begin
    perform public.save_assembly(ag, 'ordinaire', '2026-12-12 14:00+01', 'Ailleurs', '2026-12-12 15:00+01',
      '2026-12-12 17:00+01', '2026-12-05 23:59+01', '2027-01-01', items);
    failures := failures || text 'convocation : AG modifiée après l''envoi';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  if n <> 12 then failures := failures || ('convocation : ' || n || ' membres au lieu de 12'); end if;
  select count(*) into n from public.messages m join public.conversations c on c.id = m.conversation_id
  where m.kind = 'assemblee' and m.meta ->> 'type' = 'convocation' and c.member_id = e8
    and m.meta ->> 'first_name' = 'Mariama' and jsonb_array_length(m.meta -> 'items') = 4;
  if n <> 1 then failures := failures || text 'convocation : message de Mariama'; end if;
  select count(*) into n from public.posts p join public.assemblies a on a.convocation_post_id = p.id
  where a.id = ag and p.official and p.title = 'Convocation à l''assemblée générale ordinaire'
    and p.body like '%Candidatures au bureau jusqu''au samedi 5 décembre 2026, 23 h 59%';
  if n <> 1 then failures := failures || text 'convocation : annonce dans le fil'; end if;

  -- 4. Candidatures (article 15) -----------------------------------------------------
  perform set_config('aegb.now', '2026-11-25 18:00+01', true);
  perform set_config('aegb.today', '2026-11-25', true);
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c1 := public.submit_candidacy(ag, 'presidence', 'Continuer ce qu''on a lancé : l''appli, des comptes clairs et plus d''événements.');
  begin
    perform public.submit_candidacy(ag, 'secretariat', 'Deux postes');
    failures := failures || text 'candidature : deux postes pour la même personne';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c2 := public.submit_candidacy(ag, 'presidence', 'Un bureau plus proche des nouveaux.');
  begin
    perform public.submit_candidacy(ag, 'vice_presidence', 'Pas à élire');
    failures := failures || text 'candidature : poste qui n''est pas à élire';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c3 := public.submit_candidacy(ag, 'secretariat', 'Des convocations à l''heure et des comptes rendus clairs.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c4 := public.submit_candidacy(ag, 'secretariat', 'Archiver tout ce que fait l''association.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c5 := public.submit_candidacy(ag, 'tresorerie', 'Des comptes publiés chaque trimestre.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c6 := public.submit_candidacy(ag, 'communication', 'Un post chaque semaine.');
  perform public.withdraw_candidacy(c6);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', lt, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.submit_candidacy(ag, 'tresorerie', 'En retard');
    failures := failures || text 'candidature : un membre en retard se présente';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.submit_candidacy(ag, 'tresorerie', 'Alumni');
    failures := failures || text 'candidature : un alumni se présente';
  exception when invalid_parameter_value then null;
  end;
  j := public.assembly_view();
  if j ->> 'status' <> 'convoquee' or j -> 'my' ->> 'right' <> 'consultatif' or (j -> 'my' ->> 'can_run')::boolean then
    failures := failures || ('vue : alumni ' || (j -> 'my')::text);
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.submit_candidacy(ag, 'tresorerie', 'Garant');
    failures := failures || text 'candidature : le titulaire du poste d''admin numérique se présente';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- Le bureau saisit une candidature papier, refuse sans motif (non), puis avec.
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c7 := public.add_paper_candidacy(ag, e7, 'communication', 'Je veux que l''AEGB se voie.');
  begin
    perform public.decide_candidacy(c7, false, ' ');
    failures := failures || text 'candidature : refus sans motif';
  exception when invalid_parameter_value then null;
  end;
  perform public.decide_candidacy(c7, false, 'Formulaire papier incomplet.');
  j := public.assembly_admin();
  select count(*) into n from jsonb_array_elements(j -> 'assembly' -> 'seats') s, jsonb_array_elements(s -> 'candidates') c
  where c ->> 'status' = 'deposee';
  if n <> 5 then failures := failures || ('candidature : ' || n || ' à vérifier au lieu de 5'); end if;
  reset role;
  select count(*) into n from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.member_id = e7 and m.meta ->> 'type' = 'candidature_refusee' and m.meta ->> 'reason' = 'Formulaire papier incomplet.';
  if n <> 1 then failures := failures || text 'candidature : message de refus'; end if;

  -- Un membre ne voit que les candidatures validées.
  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.assembly_view();
  select count(*) into n from jsonb_array_elements(j -> 'seats') s, jsonb_array_elements(s -> 'candidates') c;
  if n <> 0 or (j -> 'my' ->> 'can_run')::boolean is not true then
    failures := failures || ('vue : ' || n || ' candidatures visibles avant validation');
  end if;
  reset role;

  -- Clôture des candidatures.
  perform set_config('aegb.now', '2026-12-06 09:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.submit_candidacy(ag, 'communication', 'Trop tard');
    failures := failures || text 'candidature : déposée après la clôture';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- 5. Ouverture du vote ---------------------------------------------------------
  perform set_config('aegb.today', '2026-12-12', true);
  perform set_config('aegb.now', '2026-12-11 15:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.open_vote(ag);
    failures := failures || text 'ouverture : la veille de l''AG';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('aegb.now', '2026-12-12 15:00+01', true);
  set local role authenticated;
  begin
    perform public.open_vote(ag);
    failures := failures || text 'ouverture : candidatures encore à vérifier';
  exception when invalid_parameter_value then null;
  end;
  perform public.decide_candidacy(c1, true);
  perform public.decide_candidacy(c2, true);
  perform public.decide_candidacy(c3, true);
  perform public.decide_candidacy(c4, true);
  perform public.decide_candidacy(c5, true);
  perform public.decide_candidacy(c7, true);
  reset role;
  -- Lansana n'a pas payé novembre : sa candidature tombe à l'ouverture.
  delete from public.dues_coverage where member_id = e5 and month = '2026-11-01';
  set local role authenticated;
  b := public.open_vote(ag);
  reset role;

  select status into t from public.candidacies where id = c5;
  if t <> 'retiree' then failures := failures || ('ouverture : candidat en retard ' || t); end if;
  select count(*) into n from public.ballot_electors where ballot_id = b;
  if n <> 8 then failures := failures || ('ouverture : ' || n || ' inscrits au lieu de 8'); end if;
  if exists (select 1 from public.ballot_electors where ballot_id = b and member_id in (e5, lt, al, g)) then
    failures := failures || text 'ouverture : un membre sans droit de vote est inscrit';
  end if;
  select count(*) into n from public.ballot_questions where ballot_id = b;
  if n <> 5 then failures := failures || ('ouverture : ' || n || ' questions au lieu de 5'); end if;
  select id into q_r1 from public.ballot_questions where ballot_id = b and title = 'Rapport moral 2026';
  select id into q_r2 from public.ballot_questions where ballot_id = b and title = 'Cotisation 2027';
  select id into q_pres from public.ballot_questions where ballot_id = b and role_code = 'presidence';
  select id into q_sec from public.ballot_questions where ballot_id = b and role_code = 'secretariat';
  select id into q_com from public.ballot_questions where ballot_id = b and role_code = 'communication';
  if (select candidates from public.ballot_questions where id = q_pres) <> array[c2, c1] then
    failures := failures || text 'ouverture : ordre des candidats (par nom)';
  end if;
  select count(*) into n from private.ballot_counts where question_id = q_com;
  if n <> 3 then failures := failures || text 'ouverture : candidat seul sans pour, contre, blanc'; end if;
  select count(*) into n from public.messages m join public.conversations c on c.id = m.conversation_id
  where m.meta ->> 'type' = 'ouverture' and m.meta ->> 'ballot' = b::text;
  if n <> 8 then failures := failures || ('ouverture : ' || n || ' messages au lieu de 8'); end if;
  if (select status from public.assemblies where id = ag) <> 'vote' then
    failures := failures || text 'ouverture : statut de l''AG';
  end if;

  -- 6. Le vote ---------------------------------------------------------------------
  perform set_config('aegb.now', '2026-12-12 15:10+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'pour', q_pres, c1, q_sec, 'blanc', q_com, 'pour'));
    failures := failures || text 'vote : un alumni vote';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', lt, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'pour', q_pres, c1, q_sec, 'blanc', q_com, 'pour'));
    failures := failures || text 'vote : un membre en retard vote';
  exception when insufficient_privilege then null;
  end;
  j := public.assembly_view();
  if j -> 'my' ->> 'right' <> 'suspendu' or (j -> 'my' ->> 'late_cents')::integer <> 1500 then
    failures := failures || ('vue : droit suspendu ' || (j -> 'my')::text);
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'contre', q_pres, c1, q_sec, 'blanc'));
    failures := failures || text 'vote : bulletin incomplet accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'contre', q_pres, c5, q_sec, 'blanc', q_com, 'pour'));
    failures := failures || text 'vote : candidat qui n''est pas sur le bulletin';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'contre', q_pres, c1, q_sec, 'blanc', q_com, 'abstention'));
    failures := failures || text 'vote : abstention pour un candidat seul';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform 1 from public.ballot_voters;
    failures := failures || text 'secret : émargement lisible directement';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.ballot_counts;
    failures := failures || text 'secret : totaux lisibles';
  exception when insufficient_privilege then null;
  end;
  ts := public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'contre', q_pres, c1::text, q_sec, 'blanc', q_com, 'pour'));
  begin
    perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'contre', q_pres, c1::text, q_sec, 'blanc', q_com, 'pour'));
    failures := failures || text 'vote : deux bulletins';
  exception when unique_violation then null;
  end;
  j := public.assembly_view();
  if (j -> 'ballots' -> 0 ->> 'voted_at') is null or (j -> 'ballots' -> 0 ->> 'voters')::integer <> 1
     or (j -> 'ballots' -> 0 ->> 'electors')::integer <> 8 or (j -> 'ballots' -> 0 ->> 'quorum')::integer <> 3 then
    failures := failures || ('vue : participation ' || (j -> 'ballots' -> 0)::text);
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'pour', q_pres, c2::text, q_sec, c3::text, q_com, 'contre'));
  reset role;
  if (select quorum_reached_at from public.ballots where id = b) is not null then
    failures := failures || text 'quorum : atteint avec 2 votants sur 8';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', e3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'contre', q_r2, 'pour', q_pres, c1::text, q_sec, c3::text, q_com, 'pour'));
  reset role;
  if (select quorum_reached_at from public.ballots where id = b) is null then
    failures := failures || text 'quorum : pas noté au 3e votant';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', e4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'abstention', q_r2, 'pour', q_pres, c2::text, q_sec, c4::text, q_com, 'pour'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e6, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'abstention', q_pres, 'blanc', q_sec, c4::text, q_com, 'pour'));
  reset role;

  -- Thierno règle son retard pendant le vote : il entre dans la liste en votant.
  insert into public.dues_coverage (member_id, month, payment_id, amount_cents)
  select lt, mo::date, pay, 500 from generate_series('2026-09-01'::date, '2026-12-01'::date, interval '1 month') mo;
  perform set_config('request.jwt.claims', json_build_object('sub', lt, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_r2, 'contre', q_pres, c1::text, q_sec, 'blanc', q_com, 'contre'));
  reset role;
  select count(*) into n from public.ballot_electors where ballot_id = b;
  if n <> 9 then failures := failures || ('vote : ' || n || ' inscrits après le paiement de Thierno'); end if;

  -- Chaque question a autant de voix que de votants, et aucun bulletin n'existe.
  select count(*) into n from (
    select c.question_id from private.ballot_counts c join public.ballot_questions q on q.id = c.question_id
    where q.ballot_id = b group by c.question_id having sum(c.votes) <> 6
  ) x;
  if n <> 0 then failures := failures || text 'secret : totaux faux'; end if;

  -- Pendant le vote, personne ne voit les résultats, pas même le bureau.
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.assembly_admin();
  if exists (select 1 from jsonb_array_elements(j -> 'assembly' -> 'ballots' -> 0 -> 'questions') q where q -> 'result' <> 'null'::jsonb) then
    failures := failures || text 'secret : résultats visibles pendant le vote';
  end if;
  if jsonb_array_length(j -> 'emargement') <> 9
     or (select count(*) from jsonb_array_elements(j -> 'emargement') e where e ->> 'voted_at' is not null) <> 6 then
    failures := failures || text 'émargement : mauvais compte';
  end if;
  n := public.remind_voters(b);
  if n <> 3 then failures := failures || ('relance : ' || n || ' au lieu de 3'); end if;
  begin
    perform public.remind_voters(b);
    failures := failures || text 'relance : deux rappels de suite';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.publish_results(ag);
    failures := failures || text 'publication : pendant le vote';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- 7. Fermeture à l'heure, égalité, second tour ------------------------------------
  perform set_config('aegb.now', '2026-12-12 17:00+01', true);
  perform private.elections_tick();
  if (select status from public.ballots where id = b) <> 'ferme' or (select status from public.assemblies where id = ag) <> 'depouillement' then
    failures := failures || text 'fermeture : pas fermé à l''heure';
  end if;
  if exists (select 1 from private.ballot_counts c join public.ballot_questions q on q.id = c.question_id where q.ballot_id = b) then
    failures := failures || text 'fermeture : totaux restés après le dépouillement';
  end if;
  if (select outcome from public.ballot_results where question_id = q_r1) <> 'adoptee'
     or (select counts from public.ballot_results where question_id = q_r1) <> '{"pour": 4, "contre": 1, "abstention": 1}'
     or (select expressed from public.ballot_results where question_id = q_r1) <> 5
     or (select outcome from public.ballot_results where question_id = q_r2) <> 'adoptee'
     or (select winner from public.ballot_results where question_id = q_pres) is distinct from c1
     or (select outcome from public.ballot_results where question_id = q_sec) <> 'egalite'
     or (select tied from public.ballot_results where question_id = q_sec) <> (select array_agg(x order by x::text) from unnest(array[c3, c4]) x)
     or (select outcome from public.ballot_results where question_id = q_com) <> 'pourvu'
     or (select counts from public.ballot_results where question_id = q_com) <> '{"pour": 4, "contre": 2, "blanc": 0}' then
    failures := failures || text 'dépouillement : résultats faux';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.assembly_view();
  if exists (select 1 from jsonb_array_elements(j -> 'ballots' -> 0 -> 'questions') q where q -> 'result' <> 'null'::jsonb) then
    failures := failures || text 'dépouillement : résultats visibles par les membres avant publication';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.assembly_admin();
  if (j -> 'assembly' -> 'ballots' -> 0 -> 'questions' -> 2 -> 'result' ->> 'outcome') is distinct from 'pourvu' then
    failures := failures || text 'dépouillement : le bureau ne voit pas les résultats';
  end if;
  begin
    perform public.publish_results(ag);
    failures := failures || text 'publication : avant le second tour';
  exception when invalid_parameter_value then null;
  end;
  b2 := public.open_second_round(ag);
  begin
    perform public.open_second_round(ag);
    failures := failures || text 'second tour : ouvert deux fois';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  select id into q_sec from public.ballot_questions where ballot_id = b2;
  select count(*) into n from public.ballot_electors where ballot_id = b2;
  if n <> 9 or (select count(*) from public.ballot_questions where ballot_id = b2) <> 1 then
    failures := failures || ('second tour : ' || n || ' inscrits');
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b2, jsonb_build_object(q_sec, c4::text));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b2, jsonb_build_object(q_sec, c3::text));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.cast_vote(b2, jsonb_build_object(q_sec, c1::text));
    failures := failures || text 'second tour : vote pour un candidat éliminé';
  exception when invalid_parameter_value then null;
  end;
  perform public.cast_vote(b2, jsonb_build_object(q_sec, c4::text));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.close_vote(b2);
  reset role;
  if t <> 'ferme' or (select winner from public.ballot_results where question_id = q_sec) is distinct from c4 then
    failures := failures || text 'second tour : mauvais résultat';
  end if;

  -- 8. Publication et passation ------------------------------------------------------
  set local role authenticated;
  perform public.publish_results(ag);
  begin
    perform public.confirm_handover(ag);
    failures := failures || text 'passation : confirmée par le secrétariat';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select body into t from public.posts p join public.assemblies a on a.results_post_id = p.id where a.id = ag;
  if t not like '%6 votants sur 9 inscrits (67 %)%' or t not like '%Rapport moral 2026 : adoptée (80 % de pour)%'
     or t not like '%Présidence : Alpha Diallo (60 %)%' or t not like '%Secrétariat général : Djénabou Barry (67 %, au second tour)%'
     or t not like '%Trésorerie : aucun candidat, poste vacant%' or t not like '%Communication : Binta Camara (67 % de pour)%'
     or t not like '%le 1er janvier 2027.' then
    failures := failures || ('publication : annonce ' || coalesce(t, '-'));
  end if;
  select count(*) into n from public.role_handovers where assembly_id = ag and effective_on = '2027-01-01';
  if n <> 3 then failures := failures || ('passation : ' || n || ' postes au lieu de 3'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.assembly_view();
  if j ->> 'status' <> 'publiee' or (j -> 'ballots' -> 1 -> 'questions' -> 0 -> 'result' ->> 'winner') is distinct from c4::text then
    failures := failures || text 'publication : résultats invisibles pour les membres';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if jsonb_array_length(public.pending_handovers()) <> 3 then failures := failures || text 'passation : liste'; end if;
  n := public.confirm_handover(ag);
  reset role;
  if n <> 3 or exists (select 1 from public.bureau_roles where code = 'presidence' and holder_id = e1) then
    failures := failures || text 'passation : appliquée avant le 1er janvier';
  end if;
  perform set_config('aegb.today', '2027-01-01', true);
  perform private.elections_tick();
  if not exists (select 1 from public.bureau_roles where code = 'presidence' and holder_id = e1)
     or not exists (select 1 from public.bureau_roles where code = 'secretariat' and holder_id = e4)
     or not exists (select 1 from public.bureau_roles where code = 'communication' and holder_id = e7)
     or exists (select 1 from public.bureau_roles where holder_id = sec) then
    failures := failures || text 'passation : postes mal attribués le 1er janvier';
  end if;
  update public.bureau_roles set holder_id = sec where code = 'secretariat';

  -- 9. Quorum non atteint, puis seconde AG -----------------------------------------
  perform set_config('aegb.today', '2026-12-13', true);
  perform set_config('aegb.now', '2026-12-13 10:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ag2 := public.save_assembly(null, 'ordinaire', '2027-01-09 14:00+01', 'Maison des étudiants', '2027-01-09 15:00+01',
    '2027-01-09 16:00+01', '2027-01-05 23:59+01', null,
    '[{"kind": "resolution", "title": "Règlement intérieur"}, {"kind": "election", "title": "Élection partielle", "seats": ["projets"]}]');
  perform public.send_convocation(ag2);
  reset role;
  perform set_config('aegb.now', '2026-12-20 10:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', e8, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c8 := public.submit_candidacy(ag2, 'projets', 'Accueillir les nouveaux à la gare.');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.decide_candidacy(c8, true);
  reset role;

  -- Le vote s'ouvre tout seul à l'heure annoncée.
  perform set_config('aegb.today', '2027-01-09', true);
  perform set_config('aegb.now', '2027-01-09 15:00+01', true);
  perform private.elections_tick();
  select id into b from public.ballots where assembly_id = ag2 and round = 1;
  if b is null or (select opened_by_name from public.ballots where id = b) <> 'AEGB, automatique' then
    failures := failures || text 'ouverture automatique : pas ouvert à l''heure';
  end if;
  select id into q_r1 from public.ballot_questions where ballot_id = b and kind = 'resolution';
  select id into q_pres from public.ballot_questions where ballot_id = b and kind = 'poste';
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'pour', q_pres, 'pour'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.close_vote(b);
  reset role;
  if t <> 'carence' or (select status from public.assemblies where id = ag2) <> 'carence'
     or (select status from public.ballots where id = b) <> 'detruit' then
    failures := failures || ('carence : ' || t);
  end if;
  if exists (select 1 from private.ballot_counts c join public.ballot_questions q on q.id = c.question_id where q.ballot_id = b)
     or exists (select 1 from public.ballot_results r join public.ballot_questions q on q.id = r.question_id where q.ballot_id = b) then
    failures := failures || text 'carence : bulletins pas détruits';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.convene_second_assembly(ag2, '2027-01-13 14:00+01', 'Maison des étudiants', '2027-01-13 15:00+01', '2027-01-13 16:00+01');
    failures := failures || text 'seconde AG : 4 jours après la première';
  exception when invalid_parameter_value then null;
  end;
  ag3 := public.convene_second_assembly(ag2, '2027-01-23 14:00+01', 'Maison des étudiants', '2027-01-23 15:00+01', '2027-01-23 16:00+01');
  reset role;
  if (select convocation from public.assemblies where id = ag3) <> 2 or (select status from public.assemblies where id = ag3) <> 'convoquee'
     or not exists (select 1 from public.candidacies where assembly_id = ag3 and member_id = e8 and status = 'validee')
     or (select count(*) from public.assembly_items where assembly_id = ag3) <> 2 then
    failures := failures || text 'seconde AG : mal convoquée';
  end if;
  select count(*) into n from public.messages where meta ->> 'type' = 'seconde' and meta ->> 'assembly' = ag3::text;
  if n <> 12 then failures := failures || ('seconde AG : ' || n || ' messages'); end if;

  -- Sans quorum : un seul votant suffit.
  perform set_config('aegb.today', '2027-01-23', true);
  perform set_config('aegb.now', '2027-01-23 15:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b := public.open_vote(ag3);
  reset role;
  select id into q_r1 from public.ballot_questions where ballot_id = b and kind = 'resolution';
  select id into q_pres from public.ballot_questions where ballot_id = b and kind = 'poste';
  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cast_vote(b, jsonb_build_object(q_r1, 'contre', q_pres, 'pour'));
  j := public.assembly_view();
  if (j ->> 'convocation')::integer <> 2 or (j -> 'first' ->> 'voters')::integer <> 1
     or (j -> 'ballots' -> 0 ->> 'quorum')::integer <> 0 then
    failures := failures || ('seconde AG : vue ' || (j -> 'first')::text);
  end if;
  reset role;
  perform set_config('aegb.now', '2027-01-23 16:00+01', true);
  perform private.elections_tick();
  if (select status from public.assemblies where id = ag3) <> 'depouillement'
     or (select outcome from public.ballot_results where question_id = q_r1) <> 'rejetee'
     or (select outcome from public.ballot_results where question_id = q_pres) <> 'pourvu' then
    failures := failures || text 'seconde AG : dépouillement sans quorum';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_results(ag3);
  reset role;
  if (select effective_on from public.role_handovers where assembly_id = ag3) <> '2027-01-23' then
    failures := failures || text 'élection partielle : prise de poste immédiate';
  end if;

  -- 10. Annulation ---------------------------------------------------------------------
  perform set_config('aegb.now', '2027-01-24 10:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ag := public.save_assembly(null, 'extraordinaire', '2027-03-06 14:00+01', 'UFR Sciences', '2027-03-06 15:00+01',
    '2027-03-06 16:00+01', null, null, '[{"kind": "resolution", "title": "Modifier les statuts"}]');
  perform public.cancel_assembly(ag);
  reset role;
  if exists (select 1 from public.assemblies where id = ag) then failures := failures || text 'annulation : brouillon pas effacé'; end if;
  set local role authenticated;
  ag := public.save_assembly(null, 'extraordinaire', '2027-03-06 14:00+01', 'UFR Sciences', '2027-03-06 15:00+01',
    '2027-03-06 16:00+01', null, null, '[{"kind": "resolution", "title": "Modifier les statuts"}]');
  perform public.send_convocation(ag);
  begin
    perform public.cancel_assembly(ag, '');
    failures := failures || text 'annulation : sans motif';
  exception when invalid_parameter_value then null;
  end;
  perform public.cancel_assembly(ag, 'Le texte des statuts n''est pas prêt.');
  reset role;
  if (select status from public.assemblies where id = ag) <> 'annulee'
     or (select count(*) from public.messages where meta ->> 'type' = 'annulation' and meta ->> 'assembly' = ag::text) <> 12 then
    failures := failures || text 'annulation : AG convoquée';
  end if;

  -- 11. Vider les essais --------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.clear_elections();
    failures := failures || text 'vider : possible pour le secrétariat';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.clear_elections();
  reset role;
  if n < 4 or exists (select 1 from public.assemblies) or exists (select 1 from public.messages where kind = 'assemblee')
     or exists (select 1 from public.posts where official and title like 'Résultats de l''AG%') then
    failures := failures || ('vider : ' || n || ' AG effacées');
  end if;

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
