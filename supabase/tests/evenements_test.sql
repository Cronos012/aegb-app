-- Test des événements et des documents (lot 6) : brouillon invisible,
-- publication dans le fil, « Je participe », liste d'attente et place
-- libérée, paiement par carte (HelloAsso) et sur place, désinscription et
-- remboursement par contre-passation, changement de date et de lieu, réservé
-- aux membres à jour, rappel de la veille à 18 h, pointage, annulation, AG
-- ajoutée toute seule, documents et leurs niveaux de lecture, procès-verbal
-- d'AG rangé tout seul.
--
-- Comme les autres tests, le script crée des comptes fictifs, joue des
-- scénarios en se faisant passer pour chacun, puis lève une erreur qui annule
-- tout : la base reste intacte. Le message final commence par « TESTS OK » ou
-- par « ÉCHEC ».
--
-- À lancer avec psql en tant que postgres. Le jour et l'heure sont fixés par
-- les réglages aegb.today et aegb.now.

do $$
declare
  a uuid := gen_random_uuid();   -- Awa, alumni
  b uuid := gen_random_uuid();   -- Bakary, alumni
  c uuid := gen_random_uuid();   -- Coumba, alumni
  d uuid := gen_random_uuid();   -- Djibril, étudiant en retard de cotisation
  p uuid := gen_random_uuid();   -- poste Projets et intégration (événements)
  tr uuid := gen_random_uuid();  -- poste Trésorerie
  sec uuid := gen_random_uuid(); -- poste Secrétariat général (documents)
  g uuid;
  old_roles jsonb;
  ev uuid := gen_random_uuid();
  ev2 uuid := gen_random_uuid();
  ag uuid := gen_random_uuid();
  agev uuid;
  doc uuid := gen_random_uuid();
  doc2 uuid := gen_random_uuid();
  pay uuid;
  led bigint;
  n integer;
  t text;
  j jsonb;
  failures text[] := '{}';
begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, meta::jsonb, now(), now(), now()
  from (values
    (a, 'ev-a@test.invalid', '{"first_name":"Awa","last_name":"Diallo","member_type":"alumni","charter_version":"1"}'),
    (b, 'ev-b@test.invalid', '{"first_name":"Bakary","last_name":"Bah","member_type":"alumni","charter_version":"1"}'),
    (c, 'ev-c@test.invalid', '{"first_name":"Coumba","last_name":"Camara","member_type":"alumni","charter_version":"1"}'),
    (d, 'ev-d@test.invalid', '{"first_name":"Djibril","last_name":"Diaby","member_type":"etudiant","charter_version":"1"}'),
    (p, 'ev-p@test.invalid', '{"first_name":"Mohamed","last_name":"Kaba","member_type":"etudiant","charter_version":"1"}'),
    (tr, 'ev-tr@test.invalid', '{"first_name":"Lansana","last_name":"Touré","member_type":"alumni","charter_version":"1"}'),
    (sec, 'ev-sec@test.invalid', '{"first_name":"Hawa","last_name":"Condé","member_type":"alumni","charter_version":"1"}')
  ) x (id, email, meta);
  update public.profiles set status = 'actif', validated_at = '2026-09-10 12:00+02' where id in (a, b, c, d, p, tr, sec);
  update public.profiles set member_type = 'alumni' where id in (a, b, c, tr, sec);

  select jsonb_object_agg(code, holder_id) into old_roles from public.bureau_roles where not locked;
  update public.bureau_roles set holder_id = null where not locked;
  update public.bureau_roles set holder_id = p, assigned_at = now() where code = 'projets';
  update public.bureau_roles set holder_id = tr, assigned_at = now() where code = 'tresorerie';
  update public.bureau_roles set holder_id = sec, assigned_at = now() where code = 'secretariat';
  select holder_id into g from public.bureau_roles where code = 'admin_numerique';
  if g is null then
    g := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ev-g@test.invalid',
      '{"first_name":"Garant","last_name":"Test","member_type":"alumni","charter_version":"1"}', now(), now(), now());
    update public.profiles set status = 'actif', validated_at = now() where id = g;
    update public.bureau_roles set holder_id = g, assigned_at = now() where code = 'admin_numerique';
  end if;

  update public.dues_settings set monthly_cents = 500, start_month = '2026-09-01', paying_types = '{etudiant}';
  perform set_config('aegb.today', '2026-11-20', true);
  perform set_config('aegb.now', '2026-11-20 10:00+01', true);

  -- 1. Le brouillon : seul le bureau des événements le voit ----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_event(ev, '{"title":"Soirée","starts_at":"2026-12-05 19:00+01","place":"Maison de l''étudiant"}'::jsonb);
    failures := failures || text 'droits : un membre crée un événement';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_event(ev, '{"title":"Soirée","starts_at":"2026-11-01 19:00+01","place":"Brest"}'::jsonb);
    failures := failures || text 'création : date passée acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_event(ev, '{"title":"Visio","starts_at":"2026-12-05 19:00+01","online":true,"link":"pas un lien"}'::jsonb);
    failures := failures || text 'création : lien de visio invalide accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_event(ev, '{"title":"Soirée","starts_at":"2026-12-05 19:00+01","place":"Brest","member_price_cents":500,"pay_in_app":false,"pay_on_site":false}'::jsonb);
    failures := failures || text 'création : événement payant sans moyen de payer';
  exception when invalid_parameter_value then null;
  end;
  j := public.save_event(ev, jsonb_build_object(
    'title', 'Soirée de fin de semestre', 'description', 'Repas, musique et jeux.',
    'starts_at', '2026-12-05 19:00+01', 'ends_at', '2026-12-05 23:00+01', 'place', 'Maison de l''étudiant',
    'capacity', 2, 'member_price_cents', 500, 'guest_price_cents', 800));
  if j ->> 'status' <> 'brouillon' then failures := failures || ('création : ' || j::text); end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if jsonb_array_length(public.events_list()) <> 0 then failures := failures || text 'brouillon : visible dans la liste'; end if;
  begin
    perform public.event_view(ev);
    failures := failures || text 'brouillon : visible en détail';
  exception when no_data_found then null;
  end;
  begin
    perform public.join_event(ev);
    failures := failures || text 'brouillon : inscription possible';
  exception when no_data_found then null;
  end;
  begin
    perform 1 from public.events;
    failures := failures || text 'table : lisible directement';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 2. La publication : la carte arrive dans le fil --------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.save_event(ev, jsonb_build_object(
    'title', 'Soirée de fin de semestre', 'description', 'Repas, musique et jeux.',
    'starts_at', '2026-12-05 19:00+01', 'ends_at', '2026-12-05 23:00+01', 'place', 'Maison de l''étudiant',
    'capacity', 2, 'member_price_cents', 500, 'guest_price_cents', 800), true);
  reset role;
  if j ->> 'status' <> 'publie' then failures := failures || ('publication : ' || j::text); end if;
  select count(*) into n from public.posts po join public.events e on e.post_id = po.id
  where e.id = ev and po.event_id = ev and po.official and po.title = 'Soirée de fin de semestre';
  if n <> 1 then failures := failures || text 'publication : carte du fil absente'; end if;
  select count(*) into n from public.activity_log where category = 'evenements' and action = 'publication' and actor_id = p;
  if n <> 1 then failures := failures || text 'publication : journal d''activité'; end if;

  -- 3. Je participe, liste d'attente ------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.join_event(ev);
  if j ->> 'status' <> 'inscrit' then failures := failures || ('inscription : Awa ' || j::text); end if;
  j := public.join_event(ev);
  if j ->> 'status' <> 'inscrit' then failures := failures || text 'inscription : deux fois'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.join_event(ev);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.join_event(ev);
  if j ->> 'status' <> 'attente' or (j ->> 'rank')::integer <> 1 then failures := failures || ('attente : Coumba ' || j::text); end if;
  j := public.event_view(ev);
  if (j ->> 'going')::integer <> 2 or (j ->> 'waiting')::integer <> 1 or j -> 'mine' ->> 'status' <> 'attente'
     or (j -> 'mine' ->> 'rank')::integer <> 1 or jsonb_array_length(j -> 'faces') <> 2 then
    failures := failures || ('détail : ' || j::text);
  end if;
  begin
    perform public.start_event_payment(ev);
    failures := failures || text 'paiement : sur la liste d''attente';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.join_event(ev);
  if j ->> 'status' <> 'attente' or (j ->> 'rank')::integer <> 2 then failures := failures || ('attente : Djibril ' || j::text); end if;
  j := public.event_people(ev);
  if jsonb_array_length(j -> 'going') <> 2 or jsonb_array_length(j -> 'waiting') <> 2
     or j -> 'waiting' -> 0 ->> 'id' <> c::text or j -> 'going' -> 0 ? 'present' then
    failures := failures || ('qui y va : ' || j::text);
  end if;
  reset role;

  -- 4. Awa se désiste : Coumba prend la place et le compte AEGB la prévient --------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_event(ev);
  reset role;
  select status into t from public.event_participants where event_id = ev and member_id = c;
  if t is distinct from 'inscrit' then failures := failures || text 'place libérée : Coumba pas inscrite'; end if;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = c and m.kind = 'evenement' and m.meta ->> 'type' = 'place';
  if t is null or t not like 'Bonne nouvelle, Coumba%' or t not like '%5 €, à payer dans l''appli ou à l''entrée.' then
    failures := failures || ('place libérée : message ' || coalesce(t, '(rien)'));
  end if;
  select count(*) into n from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = d and m.kind = 'evenement';
  if n <> 0 then failures := failures || text 'place libérée : Djibril prévenu à tort'; end if;

  -- 5. Coumba paie dans l'appli : rien ne compte avant HelloAsso ----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.start_event_payment(ev);
  pay := (j ->> 'id')::uuid;
  if (j ->> 'amount_cents')::integer <> 500 then failures := failures || ('paiement : montant ' || j::text); end if;
  begin
    perform public.helloasso_confirm(pay, 'faux', null);
    failures := failures || text 'paiement : confirmé par le membre';
  exception when insufficient_privilege then null;
  end;
  if (public.event_view(ev) ->> 'paid')::boolean then failures := failures || text 'paiement : payé avant HelloAsso'; end if;
  j := public.event_payment_status(pay);
  if j ->> 'status' <> 'en_attente' then failures := failures || ('paiement : état ' || j::text); end if;
  reset role;
  set local role service_role;
  j := public.helloasso_payment(pay);
  if j ->> 'kind' <> 'evenement' or (j ->> 'amount_cents')::integer <> 500 or j ->> 'label' <> 'Soirée de fin de semestre'
     or j ->> 'member_id' <> c::text then
    failures := failures || ('helloasso : ' || j::text);
  end if;
  perform public.helloasso_attach(pay, 123456789);
  j := public.helloasso_confirm(pay, 'HA-9', '2026-11-20');
  j := public.helloasso_confirm(pay, 'HA-9', '2026-11-20');
  if not coalesce((j ->> 'already')::boolean, false) then failures := failures || text 'helloasso : confirmé deux fois'; end if;
  reset role;
  select count(*) into n from public.ledger_entries l join public.event_payments v on v.ledger_id = l.id
  where v.id = pay and l.category = 'evenements' and l.method = 'helloasso' and l.amount_cents = 500
    and l.member_id = c and l.label = 'Événement : Soirée de fin de semestre' and l.created_by_name = 'Automatique';
  if n <> 1 then failures := failures || text 'helloasso : écriture du journal'; end if;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = c and m.kind = 'evenement' and m.meta ->> 'type' = 'paiement';
  if t is distinct from 'Paiement reçu : ta place pour « Soirée de fin de semestre », 5 €, par carte. Merci, à bientôt !' then
    failures := failures || ('helloasso : reçu ' || coalesce(t, '(rien)'));
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.event_view(ev);
  if not (j ->> 'paid')::boolean or j -> 'payment' ->> 'method' <> 'carte' then failures := failures || ('payé : ' || j::text); end if;
  begin
    perform public.start_event_payment(ev);
    failures := failures || text 'paiement : payé deux fois';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- 6. Bakary paie sur place ; un membre ne peut pas l'encaisser ----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.record_event_payment(ev, b);
    failures := failures || text 'encaisser : par un membre';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.record_event_payment(ev, b);
  begin
    perform public.record_event_payment(ev, b);
    failures := failures || text 'encaisser : deux fois';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_event_payment(ev, d);
    failures := failures || text 'encaisser : sans place';
  exception when invalid_parameter_value then null;
  end;
  j := public.event_admin(ev);
  if (select count(*) from jsonb_array_elements(j -> 'people') x where x -> 'payment' is not null and x -> 'payment' <> 'null'::jsonb) <> 2
     or jsonb_array_length(j -> 'refunds') <> 0 then
    failures := failures || ('bureau : paiements ' || (j -> 'people')::text);
  end if;
  reset role;
  select count(*) into n from public.ledger_entries l join public.event_payments v on v.ledger_id = l.id
  where v.event_id = ev and v.member_id = b and l.method = 'especes' and l.created_by_name = 'Mohamed Kaba';
  if n <> 1 then failures := failures || text 'encaisser : écriture du journal'; end if;

  -- 7. Bakary se désinscrit : sa place est à rembourser, Djibril prend la place -------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_event(ev);
  reset role;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = b and m.kind = 'evenement' and m.meta ->> 'type' = 'desinscription';
  if t is distinct from 'Tu ne vas plus à « Soirée de fin de semestre ». Tu avais payé ta place 5 € : le trésorier te la rembourse.' then
    failures := failures || ('désinscription : ' || coalesce(t, '(rien)'));
  end if;
  select status into t from public.event_participants where event_id = ev and member_id = d;
  if t is distinct from 'inscrit' then failures := failures || text 'désinscription : Djibril pas inscrit'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.event_admin(ev);
  if jsonb_array_length(j -> 'refunds') <> 1 or j -> 'refunds' -> 0 ->> 'member_id' <> b::text then
    failures := failures || ('remboursement : liste ' || (j -> 'refunds')::text);
  end if;
  led := (j -> 'refunds' -> 0 ->> 'ledger_id')::bigint;
  perform public.reverse_ledger_entry(led, 'rembourse');
  j := public.event_admin(ev);
  if jsonb_array_length(j -> 'refunds') <> 0 then failures := failures || text 'remboursement : toujours à faire'; end if;
  reset role;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = b and m.kind = 'evenement' and m.meta ->> 'type' = 'rembourse';
  if t is distinct from 'Le trésorier t''a remboursé ta place pour « Soirée de fin de semestre » (5 €).' then
    failures := failures || ('remboursement : message ' || coalesce(t, '(rien)'));
  end if;
  select count(*) into n from public.event_payments where event_id = ev and member_id = b and status = 'annule';
  if n <> 1 then failures := failures || text 'remboursement : paiement pas annulé'; end if;

  -- 8. Changement de date et de lieu : chaque participant est prévenu --------------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_event(ev, jsonb_build_object('title', 'Soirée de fin de semestre', 'starts_at', '2026-12-05 19:00+01',
      'place', 'Maison de l''étudiant', 'capacity', 2, 'member_price_cents', 700));
    failures := failures || text 'prix : changé après des paiements';
  exception when invalid_parameter_value then null;
  end;
  j := public.save_event(ev, jsonb_build_object(
    'title', 'Soirée de fin de semestre', 'description', 'Repas, musique et jeux.',
    'starts_at', '2026-12-06 19:00+01', 'ends_at', '2026-12-06 23:00+01', 'place', 'Salle du Bouguen',
    'capacity', 2, 'member_price_cents', 500, 'guest_price_cents', 800));
  if (j ->> 'notified')::integer <> 2 then failures := failures || ('changement : ' || j::text); end if;
  reset role;
  select m.meta into j from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = d and m.kind = 'evenement' and m.meta ->> 'type' = 'changement';
  if j is null or jsonb_array_length(j -> 'changes') <> 2 or j -> 'changes' -> 0 ->> 'after' <> 'dimanche 6 décembre, 19 h'
     or j -> 'changes' -> 1 ->> 'before' <> 'Maison de l''étudiant' or j -> 'changes' -> 1 ->> 'after' <> 'Salle du Bouguen' then
    failures := failures || ('changement : message ' || coalesce(j::text, '(rien)'));
  end if;
  select count(*) into n from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = a and m.kind = 'evenement' and m.meta ->> 'type' = 'changement';
  if n <> 0 then failures := failures || text 'changement : un non-participant prévenu'; end if;
  select title into t from public.posts where event_id = ev;
  if t <> 'Soirée de fin de semestre' then failures := failures || text 'changement : carte du fil'; end if;

  -- 9. Réservé aux membres à jour (article 8) ----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_event(ev2, jsonb_build_object('title', 'Atelier CV', 'starts_at', '2026-12-10 18:30+01',
    'online', true, 'link', 'https://meet.example.org/cv', 'up_to_date_only', true), true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.event_view(ev2);
  if (j ->> 'dues_ok')::boolean or not (j ->> 'up_to_date_only')::boolean or j ->> 'link' <> 'https://meet.example.org/cv' then
    failures := failures || ('réservé : détail ' || j::text);
  end if;
  begin
    perform public.join_event(ev2);
    failures := failures || text 'réservé : Djibril en retard inscrit';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.join_event(ev2);
  if j ->> 'status' <> 'inscrit' then failures := failures || text 'réservé : un alumni refusé'; end if;
  reset role;

  -- 10. Le rappel de la veille à 18 h -----------------------------------------------
  perform set_config('aegb.now', '2026-12-05 17:30+01', true);
  if private.send_event_reminders() <> 0 then failures := failures || text 'rappel : parti avant 18 h'; end if;
  perform set_config('aegb.now', '2026-12-05 18:05+01', true);
  n := private.send_event_reminders();
  if n <> 2 then failures := failures || ('rappel : ' || n || ' messages au lieu de 2'); end if;
  if private.send_event_reminders() <> 0 then failures := failures || text 'rappel : envoyé deux fois'; end if;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = d and m.kind = 'evenement' and m.meta ->> 'type' = 'rappel';
  if t is distinct from 'Petit rappel, Djibril : « Soirée de fin de semestre », c''est demain, dimanche 6 décembre, 19 h, à Salle du Bouguen. Ta place : 5 €, à payer dans l''appli ou à l''entrée.' then
    failures := failures || ('rappel : ' || coalesce(t, '(rien)'));
  end if;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = c and m.kind = 'evenement' and m.meta ->> 'type' = 'rappel';
  if t like '%Ta place%' then failures := failures || text 'rappel : prix demandé à qui a payé'; end if;

  -- 11. Le jour J : pointage, membre venu sans s'inscrire ------------------------------
  perform set_config('aegb.now', '2026-12-06 19:10+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.check_in(ev, c, true);
  perform public.check_in(ev, a, true);
  j := public.event_admin(ev);
  if (j ->> 'present')::integer <> 2 or (j ->> 'going')::integer <> 3 then failures := failures || ('pointage : ' || j::text); end if;
  perform public.check_in(ev, a, false);
  j := public.event_admin(ev);
  if (j ->> 'present')::integer <> 1 or (j ->> 'going')::integer <> 2 then failures := failures || text 'pointage : retrait du venu'; end if;
  begin
    perform public.check_in(ev2, c, true);
    failures := failures || text 'pointage : quatre jours avant';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.leave_event(ev);
    failures := failures || text 'désinscription : après le début';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.event_admin(ev);
    failures := failures || text 'bureau : un membre lit les présents';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 12. Annulation : chaque participant est prévenu, avec le remboursement -------------
  perform set_config('aegb.now', '2026-11-20 10:00+01', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.cancel_event(ev, '');
    failures := failures || text 'annulation : sans motif';
  exception when invalid_parameter_value then null;
  end;
  n := public.cancel_event(ev, 'La salle n''est plus disponible.');
  if n <> 2 then failures := failures || ('annulation : ' || n || ' prévenus'); end if;
  j := public.event_admin(ev);
  if jsonb_array_length(j -> 'refunds') <> 1 or j -> 'refunds' -> 0 ->> 'member_id' <> c::text then
    failures := failures || ('annulation : remboursements ' || (j -> 'refunds')::text);
  end if;
  reset role;
  select m.body into t from public.messages m join public.conversations cv on cv.id = m.conversation_id
  where cv.member_id = c and m.kind = 'evenement' and m.meta ->> 'type' = 'annulation';
  if t is distinct from '« Soirée de fin de semestre », prévu dimanche 6 décembre, 19 h, est annulé. La salle n''est plus disponible. Tu avais payé ta place 5 € : le trésorier te la rembourse.' then
    failures := failures || ('annulation : ' || coalesce(t, '(rien)'));
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from jsonb_array_elements(public.events_list()) x where x ->> 'id' = ev::text and x ->> 'status' = 'annule') <> 1 then
    failures := failures || text 'annulation : disparue de la liste';
  end if;
  begin
    perform public.join_event(ev);
    failures := failures || text 'annulation : inscription possible';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  -- 13. L'AG s'ajoute toute seule aux événements ----------------------------------------
  if not exists (select 1 from public.assemblies where status in ('brouillon', 'convoquee', 'vote', 'depouillement')) then
    insert into public.assemblies (id, held_at, place, vote_opens_at, vote_closes_at)
    values (ag, '2026-12-12 14:00+01', 'UFR Sciences, Brest', '2026-12-12 14:30+01', '2026-12-12 16:00+01');
    if exists (select 1 from public.events where assembly_id = ag) then failures := failures || text 'AG : ajoutée en brouillon'; end if;
    update public.assemblies set status = 'convoquee', convened_at = now(), convened_by_name = 'Hawa Condé' where id = ag;
    select count(*) into n from public.events
    where assembly_id = ag and status = 'publie' and title = 'Assemblée générale ordinaire' and post_id is null
      and description like '%de 14 h 30 à 16 h.';
    if n <> 1 then failures := failures || text 'AG : absente des événements'; end if;
    select id into agev from public.events where assembly_id = ag;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    j := public.event_view(agev);
    if j -> 'assembly' ->> 'kind' <> 'ordinaire' then failures := failures || ('AG : détail ' || j::text); end if;
    perform public.join_event(agev);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.cancel_event(agev, 'non');
      failures := failures || text 'AG : annulée depuis les événements';
    exception when invalid_parameter_value then null;
    end;
    reset role;
    update public.assemblies set status = 'publiee', published_by_name = 'Hawa Condé', published_at = now() where id = ag;
    select count(*) into n from public.documents
    where assembly_id = ag and category_id = '6a0f5d2e-0001-4a6e-9b1a-0000000000a2' and visibility = 'tous'
      and title = 'Procès-verbal de l''AG ordinaire du samedi 12 décembre 2026';
    if n <> 1 then failures := failures || text 'PV : absent des documents'; end if;
  end if;

  -- 14. Les documents et leurs niveaux de lecture ----------------------------------------
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('documents', doc || '/v1-statuts.pdf', sec::text, '{"size": 245000, "mimetype": "application/pdf"}'),
    ('documents', doc || '/v2-statuts.pdf', sec::text, '{"size": 250000, "mimetype": "application/pdf"}'),
    ('documents', doc2 || '/v1-recepisse.pdf', sec::text, '{"size": 90000, "mimetype": "application/pdf"}');
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_document(doc, '6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Statuts', 'tous', jsonb_build_object('path', doc || '/v1-statuts.pdf'));
    failures := failures || text 'documents : ajout sans le droit';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_document(doc, '6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Statuts', 'tous', null);
    failures := failures || text 'documents : sans fichier';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_document(doc, '6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Statuts', 'tous', jsonb_build_object('path', doc2 || '/v1-recepisse.pdf'));
    failures := failures || text 'documents : fichier d''un autre dossier';
  exception when invalid_parameter_value then null;
  end;
  j := public.save_document(doc, '6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Statuts de l''AEGB', 'tous',
    jsonb_build_object('path', doc || '/v1-statuts.pdf', 'file_name', 'statuts.pdf'), true);
  if (j -> 'file' ->> 'size_bytes')::bigint <> 245000 or j -> 'file' ->> 'mime' <> 'application/pdf' then
    failures := failures || ('documents : fichier ' || j::text);
  end if;
  j := public.save_document(doc, '6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Statuts de l''AEGB', 'public',
    jsonb_build_object('path', doc || '/v2-statuts.pdf', 'file_name', 'statuts-2026.pdf'));
  if jsonb_array_length(j -> 'versions') <> 2 or j -> 'file' ->> 'file_name' <> 'statuts-2026.pdf' then
    failures := failures || ('documents : versions ' || j::text);
  end if;
  perform public.save_document(doc2, '6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Récépissé de la sous-préfecture', 'bureau',
    jsonb_build_object('path', doc2 || '/v1-recepisse.pdf'), true);
  reset role;
  select count(*) into n from public.posts where document_id = doc and official and title = 'Nouveau document : Statuts de l''AEGB';
  if n <> 1 then failures := failures || text 'documents : annonce dans le fil'; end if;
  select count(*) into n from public.posts where document_id = doc2;
  if n <> 0 then failures := failures || text 'documents : document du bureau annoncé'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.documents_list();
  if exists (select 1 from jsonb_array_elements(j -> 'documents') x where x ->> 'id' = doc2::text) then
    failures := failures || text 'documents : un membre voit un document du bureau';
  end if;
  if not exists (select 1 from jsonb_array_elements(j -> 'documents') x where x ->> 'id' = doc::text and x -> 'versions' = 'null'::jsonb) then
    failures := failures || ('documents : liste membre ' || (j -> 'documents')::text);
  end if;
  if not public.can_read_document_file(doc || '/v2-statuts.pdf') or public.can_read_document_file(doc || '/v1-statuts.pdf')
     or public.can_read_document_file(doc2 || '/v1-recepisse.pdf') then
    failures := failures || text 'documents : fichiers lisibles par un membre';
  end if;
  begin
    perform public.delete_document(doc);
    failures := failures || text 'documents : supprimé par un membre';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.can_read_document_file(doc || '/v1-statuts.pdf') or not public.can_read_document_file(doc2 || '/v1-recepisse.pdf') then
    failures := failures || text 'documents : le bureau ne lit pas tout';
  end if;
  reset role;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
  if not public.can_read_document_file(doc || '/v2-statuts.pdf') then failures := failures || text 'documents : public illisible sans connexion'; end if;
  if jsonb_array_length(public.public_documents()) <> 1 then failures := failures || text 'documents : liste publique'; end if;
  begin
    perform public.documents_list();
    failures := failures || text 'documents : liste des membres sans connexion';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select array_agg(x order by x) from unnest(public.delete_document(doc)) x)
     is distinct from array[doc || '/v1-statuts.pdf', doc || '/v2-statuts.pdf'] then
    failures := failures || text 'documents : fichiers à retirer';
  end if;
  begin
    perform public.delete_document_category('6a0f5d2e-0001-4a6e-9b1a-0000000000a1');
    failures := failures || text 'catégories : supprimée avec des documents';
  exception when invalid_parameter_value then null;
  end;
  perform public.save_document_category(null, 'Partenaires');
  begin
    perform public.save_document_category(null, 'partenaires');
    failures := failures || text 'catégories : en double';
  exception when unique_violation then null;
  end;
  reset role;

  -- 15. Vider les essais ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.clear_events();
    failures := failures || text 'vider : avec des places au journal';
  exception when invalid_parameter_value then null;
  end;
  if not public.journal_locked() then
    perform public.clear_finances();
    perform public.clear_events();
  end if;
  reset role;
  if exists (select 1 from public.events where assembly_id is null) or exists (select 1 from public.posts where event_id is not null) then
    failures := failures || text 'vider : événements restants';
  end if;

  update public.bureau_roles r set holder_id = (old_roles ->> r.code)::uuid where not locked;

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
