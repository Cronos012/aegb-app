-- Test des notifications (lot 7) : la cloche et ses regroupements, la file
-- des appareils et les réglages (types coupés, heures calmes, aperçu caché),
-- les mentions et réponses du grand groupe, les annonces (tout de suite et
-- programmées), les messages du compte AEGB, les notifications du bureau par
-- poste, la veille de la fermeture d'un vote, « Vu » réciproque, le numéro
-- et « qui peut m'écrire », les appareils (retirer, essai), l'envoi par la
-- fonction serveur, et « Supprimer mon compte ».
--
-- Comme les autres tests, le script crée des comptes fictifs, joue des
-- scénarios en se faisant passer pour chacun, puis lève une erreur qui annule
-- tout : la base reste intacte. Le message final commence par « TESTS OK » ou
-- par « ÉCHEC ».
--
-- Les notifications des messages partent à la validation de la transaction :
-- le test les déclenche avec « set constraints all immediate ».

do $$
declare
  a uuid := gen_random_uuid();    -- Awa
  b uuid := gen_random_uuid();    -- Bakary
  c uuid := gen_random_uuid();    -- Coumba
  d uuid := gen_random_uuid();    -- Djibril
  w uuid := gen_random_uuid();    -- Wassa, inscription en attente
  w2 uuid := gen_random_uuid();   -- Wouri, inscription en attente
  com uuid := gen_random_uuid();  -- poste Communication (annonces, modération)
  pj uuid := gen_random_uuid();   -- poste Projets et intégration (comptes, compte AEGB)
  sec uuid := gen_random_uuid();  -- poste Secrétariat général (comptes, élections)
  tr uuid := gen_random_uuid();   -- poste Trésorerie
  old_roles jsonb;
  dev_b uuid := gen_random_uuid();
  dev_b2 uuid := gen_random_uuid();
  dev_c uuid := gen_random_uuid();
  dev_pj uuid := gen_random_uuid();
  t0 timestamptz;
  gg uuid;
  ab uuid;
  ac uuid;
  ba uuid;
  aegb_a uuid;
  post_b uuid := gen_random_uuid();
  ann uuid := gen_random_uuid();
  ann2 uuid := gen_random_uuid();
  msg uuid;
  cm uuid;
  ag uuid := gen_random_uuid();
  bal uuid := gen_random_uuid();
  pay uuid;
  n integer;
  t text;
  j jsonb;
  ts timestamptz;
  ok boolean;
  failures text[] := '{}';
begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, meta::jsonb, now(), now(), now()
  from (values
    (a, 'no-a@test.invalid', '{"first_name":"Awa","last_name":"Diallo","member_type":"etudiant","charter_version":"1"}'),
    (b, 'no-b@test.invalid', '{"first_name":"Bakary","last_name":"Bah","member_type":"etudiant","charter_version":"1"}'),
    (c, 'no-c@test.invalid', '{"first_name":"Coumba","last_name":"Camara","member_type":"alumni","charter_version":"1"}'),
    (d, 'no-d@test.invalid', '{"first_name":"Djibril","last_name":"Diaby","member_type":"etudiant","charter_version":"1"}'),
    (com, 'no-com@test.invalid', '{"first_name":"Fanta","last_name":"Keita","member_type":"etudiant","charter_version":"1"}'),
    (pj, 'no-pj@test.invalid', '{"first_name":"Mohamed","last_name":"Kaba","member_type":"etudiant","charter_version":"1"}'),
    (sec, 'no-sec@test.invalid', '{"first_name":"Hawa","last_name":"Condé","member_type":"alumni","charter_version":"1"}'),
    (tr, 'no-tr@test.invalid', '{"first_name":"Lansana","last_name":"Touré","member_type":"alumni","charter_version":"1"}')
  ) x (id, email, meta);

  -- 1. Réglages et confidentialité créés avec le profil ----------------------
  select count(*) into n from public.notification_settings s join public.member_privacy v using (member_id)
  where member_id in (a, b, c, d, com, pj, sec, tr)
    and s.prives and s.grand_groupe and s.calme and s.calme_debut = '22:00' and s.calme_fin = '08:00' and s.apercu
    and v.show_online and v.show_seen and v.phone_visibility = 'bureau' and v.who_can_write = 'tous';
  if n <> 8 then failures := failures || ('réglages : ' || n || ' membres sur 8 avec les réglages de départ'); end if;

  update public.profiles set status = 'actif', validated_at = now() where id in (a, b, c, d, com, pj, sec, tr);
  update public.member_contacts set phone = '06 11 22 33 44' where id = c;

  select jsonb_object_agg(code, holder_id) into old_roles from public.bureau_roles where not locked;
  update public.bureau_roles set holder_id = null where not locked;
  update public.bureau_roles set holder_id = com, assigned_at = now() where code = 'communication';
  update public.bureau_roles set holder_id = pj, assigned_at = now() where code = 'projets';
  update public.bureau_roles set holder_id = sec, assigned_at = now() where code = 'secretariat';
  update public.bureau_roles set holder_id = tr, assigned_at = now() where code = 'tresorerie';
  gg := private.grand_groupe();

  -- Demain, 15 h à Paris : hors des heures calmes.
  t0 := ((now() at time zone 'Europe/Paris')::date + 1 + time '15:00') at time zone 'Europe/Paris';
  perform set_config('aegb.now', t0::text, true);

  -- La bienvenue de la validation est dans la cloche, avec le lien vers AEGB
  set constraints all immediate;
  select count(*) into n from public.notifications
  where member_id = a and category = 'compte' and text = '**Bienvenue dans l''AEGB** : ton compte est validé.'
    and link like '/app/messages/%';
  if n <> 1 then failures := failures || text 'bienvenue : pas dans la cloche'; end if;
  delete from public.notifications where member_id in (a, b, c, d, com, pj, sec, tr);

  -- 2. Les appareils -----------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.touch_device(dev_b, 'android', 'Android · Chrome');
  if j <> '{"push": false, "other": false, "revoked": false}'::jsonb then failures := failures || ('appareil : premier passage ' || j::text); end if;
  perform public.save_push_device(dev_b, 'https://push.example.test/b1', repeat('B', 87), repeat('a', 22));
  j := public.touch_device(dev_b, 'android', 'Android · Chrome');
  if not (j ->> 'push')::boolean then failures := failures || text 'appareil : abonnement non retenu'; end if;
  perform public.touch_device(dev_b2, 'ordinateur', 'Windows · Edge');
  perform public.save_push_device(dev_b2, 'https://push.example.test/b2', repeat('B', 87), repeat('a', 22));
  select jsonb_array_length(public.my_devices()) into n;
  if n <> 2 then failures := failures || ('appareils : ' || n || ' dans la liste au lieu de 2'); end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- L'identifiant d'un appareil d'un autre compte n'est pas repris.
  j := public.touch_device(dev_b, 'android', 'Android · Chrome');
  if not (j ->> 'other')::boolean then failures := failures || text 'appareil : identifiant d''un autre compte accepté'; end if;
  perform public.touch_device(dev_c, 'iphone', 'iPhone · Safari');
  -- Le même navigateur passe à un autre compte : l'ancien abonnement s'arrête.
  perform public.save_push_device(dev_c, 'https://push.example.test/b2', repeat('C', 87), repeat('c', 22));
  reset role;
  select count(*) into n from public.devices where id = dev_b2 and endpoint is null;
  if n <> 1 then failures := failures || text 'appareil : abonnement gardé par l''ancien compte'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_push_device(dev_c, 'https://push.example.test/c1', repeat('C', 87), repeat('c', 22));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_push_device(dev_b2, 'https://push.example.test/b2', repeat('B', 87), repeat('a', 22));
  reset role;
  -- Un membre ne lit pas directement les appareils.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform 1 from public.devices;
    failures := failures || text 'appareils : table lisible directement';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 3. Message privé : vers les appareils, pas dans la cloche ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ab := public.open_private(b);
  perform public.send_message(ab, gen_random_uuid(), 'Tu viens ce soir ?');
  set constraints all immediate;
  reset role;
  select count(*) into n from private.push_outbox
  where member_id = b and category = 'prives' and tag = 'conv:' || ab and title = 'Awa Diallo' and body = 'Tu viens ce soir ?'
    and link = '/app/messages/' || ab and not quiet and due_at = t0 and sent_at is null;
  if n <> 1 then failures := failures || text 'privé : pas dans la file de Bakary'; end if;
  select count(*) into n from public.notifications where member_id = b;
  if n <> 0 then failures := failures || text 'privé : rangé dans la cloche'; end if;
  select count(*) into n from private.push_outbox where member_id = a;
  if n <> 0 then failures := failures || text 'privé : l''expéditrice est prévenue'; end if;

  -- Aperçu caché : le texte ne part pas, le nombre de messages si.
  update public.notification_settings set apercu = false where member_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(ab, gen_random_uuid(), 'On part à 18 h 30.');
  set constraints all immediate;
  reset role;
  select body into t from private.push_outbox where member_id = b order by id desc limit 1;
  if t is distinct from '2 nouveaux messages' then failures := failures || ('aperçu caché : « ' || coalesce(t, '') || ' »'); end if;
  update public.notification_settings set apercu = true where member_id = b;

  -- Messages privés coupés : rien ne part.
  update public.notification_settings set prives = false where member_id = b;
  select count(*) into n from private.push_outbox where member_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(ab, gen_random_uuid(), 'Tu es là ?');
  set constraints all immediate;
  reset role;
  if (select count(*) from private.push_outbox where member_id = b) <> n then failures := failures || text 'réglages : message privé parti alors que coupé'; end if;
  update public.notification_settings set prives = true where member_id = b;

  -- Heures calmes : la notification attend 8 h, sans réveiller personne.
  ts := ((now() at time zone 'Europe/Paris')::date + 1 + time '23:30') at time zone 'Europe/Paris';
  perform set_config('aegb.now', ts::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(ab, gen_random_uuid(), 'Bonne nuit');
  set constraints all immediate;
  reset role;
  select count(*) into n from private.push_outbox
  where member_id = b and body = 'Bonne nuit' and quiet
    and due_at = ((now() at time zone 'Europe/Paris')::date + 2 + time '08:00') at time zone 'Europe/Paris';
  if n <> 1 then failures := failures || text 'heures calmes : pas reportée à 8 h'; end if;
  -- Avant 8 h, la fonction serveur ne la prend pas.
  j := public.push_claim();
  if j @? '$[*].items[*] ? (@.body == "Bonne nuit")' then failures := failures || text 'heures calmes : envoyée la nuit'; end if;
  update private.push_outbox set sent_at = now() where member_id = b and claimed_at is not null;
  -- Heures calmes coupées : elle part tout de suite.
  update public.notification_settings set calme = false where member_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(ab, gen_random_uuid(), 'Encore là ?');
  set constraints all immediate;
  reset role;
  select count(*) into n from private.push_outbox where member_id = b and body = 'Encore là ?' and not quiet and due_at = ts;
  if n <> 1 then failures := failures || text 'heures calmes coupées : reportée quand même'; end if;
  update public.notification_settings set calme = true where member_id = b;
  -- Heures calmes de 13 h à 15 h (sans passer minuit), à 14 h.
  update public.notification_settings set calme_debut = '13:00', calme_fin = '15:00' where member_id = b;
  perform set_config('aegb.now', (t0 - interval '1 hour')::text, true);
  select private.quiet_until(s) into ts from public.notification_settings s where member_id = b;
  if ts is distinct from t0 then failures := failures || ('heures calmes de jour : fin ' || coalesce(ts::text, 'absente')); end if;
  update public.notification_settings set calme_debut = '22:00', calme_fin = '08:00' where member_id = b;
  perform set_config('aegb.now', t0::text, true);
  -- Le réveil à 8 h : la file part en une fois (voir la fonction serveur).
  update private.push_outbox set sent_at = now() where member_id = b and sent_at is null;

  -- 4. Grand groupe : mention et réponse dans la cloche -----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  msg := gen_random_uuid();
  perform public.send_message(gg, msg, 'Qui a les clés de la salle ?');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(gg, gen_random_uuid(), 'Moi ! @awa diallo tu peux les prendre ?', msg);
  set constraints all immediate;
  reset role;
  select count(*) into n from public.notifications
  where member_id = b and category = 'grand_groupe' and icon = 'reponse' and actors = array[c]
    and text = '**Coumba Camara** a répondu à ton message : « Moi ! @awa diallo tu peux les prendre ? »'
    and link = '/app/messages/' || gg;
  if n <> 1 then failures := failures || text 'grand groupe : réponse absente'; end if;
  select count(*) into n from public.notifications
  where member_id = a and category = 'grand_groupe' and icon = 'mention' and text like '**Coumba Camara** t''a mentionné : «%';
  if n <> 1 then failures := failures || text 'grand groupe : mention absente'; end if;
  select count(*) into n from public.notifications where member_id in (d, com, pj) and category = 'grand_groupe';
  if n <> 0 then failures := failures || text 'grand groupe : tout le monde est prévenu'; end if;
  select count(*) into n from private.push_outbox where member_id = b and title = 'Coumba Camara · Grand groupe';
  if n <> 1 then failures := failures || text 'grand groupe : réponse pas partie vers les appareils'; end if;
  -- Grand groupe coupé : la cloche garde la mention, rien ne part.
  update public.notification_settings set grand_groupe = false where member_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(gg, gen_random_uuid(), '@Bakary Bah merci !');
  set constraints all immediate;
  reset role;
  select count(*) into n from public.notifications where member_id = b and icon = 'mention';
  if n <> 1 then failures := failures || text 'grand groupe coupé : mention absente de la cloche'; end if;
  select count(*) into n from private.push_outbox where member_id = b and title = 'Coumba Camara · Grand groupe';
  if n <> 1 then failures := failures || text 'grand groupe coupé : mention partie vers les appareils'; end if;
  update public.notification_settings set grand_groupe = true where member_id = b;

  -- 5. Réactions et commentaires : regroupés, une fois par heure au plus -----
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_post(post_b, 'Quelqu''un a des notes du cours de mardi ?');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.react(post_b, null, 'jaime');
  perform public.react(post_b, null, 'jadore');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.react(post_b, null, 'soutien');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.react(post_b, null, 'rire');
  reset role;
  select count(*), max(text) into n, t from public.notifications where member_id = b and icon = 'reaction';
  if n <> 1 or t is distinct from '**Djibril Diaby** et 2 autres personnes ont réagi à ta publication' then
    failures := failures || ('réactions : ' || n || ' lignes, « ' || coalesce(t, '') || ' »');
  end if;
  select count(*) into n from private.push_outbox where member_id = b and tag = 'publication:' || post_b;
  if n <> 1 then failures := failures || ('réactions : ' || n || ' notifications parties au lieu d''une'); end if;
  select title || ' / ' || body into t from private.push_outbox where member_id = b and tag = 'publication:' || post_b;
  if t is distinct from 'Awa Diallo / a réagi à ta publication' then failures := failures || ('réactions : sur l''appareil « ' || coalesce(t, '') || ' »'); end if;
  -- Lue, la suivante ouvre une nouvelle ligne ; une heure plus tard, elle repart.
  update public.notifications set read_at = now() where member_id = b and icon = 'reaction';
  perform set_config('aegb.now', (t0 + interval '61 minutes')::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.react(post_b, null, 'wouah');
  reset role;
  select count(*) into n from public.notifications where member_id = b and icon = 'reaction';
  if n <> 2 then failures := failures || text 'réactions : pas de nouvelle ligne après lecture'; end if;
  select count(*) into n from private.push_outbox where member_id = b and tag = 'publication:' || post_b;
  if n <> 2 then failures := failures || text 'réactions : pas repartie une heure après'; end if;
  perform set_config('aegb.now', t0::text, true);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_comment(post_b, 'J''ai les notes, je te les envoie.');
  select id into cm from public.comments where post_id = post_b and author_id = a;
  reset role;
  select count(*) into n from public.notifications
  where member_id = b and icon = 'commentaire' and text = '**Awa Diallo** a commenté ta publication : « J''ai les notes, je te les envoie. »';
  if n <> 1 then failures := failures || text 'commentaire : absent pour l''auteur'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_comment(post_b, 'Merci Awa !', cm);
  reset role;
  select count(*) into n from public.notifications where member_id = a and icon = 'reponse' and text = '**Coumba Camara** a répondu à ton commentaire : « Merci Awa ! »';
  if n <> 1 then failures := failures || text 'commentaire : réponse absente'; end if;
  select max(text) into t from public.notifications where member_id = b and icon = 'commentaire';
  if t is distinct from '**Coumba Camara** et une autre personne ont commenté ta publication' then failures := failures || ('commentaires : « ' || coalesce(t, '') || ' »'); end if;
  select count(*) into n from private.push_outbox where member_id = b and tag = 'publication:' || post_b and created_at = t0;
  if n <> 1 then failures := failures || text 'commentaires : partis en plus des réactions dans l''heure'; end if;

  -- 6. Annonces : tout de suite, ou à leur heure, une seule fois ---------------
  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_announcement(ann, 'Assemblée générale le samedi 12 décembre', 'À l''UFR Sciences.', 'tous', false);
  reset role;
  select count(*) into n from public.notifications
  where link = '/app/fil/' || ann and category = 'annonces' and official and text = '**Bureau de l''AEGB** : Assemblée générale le samedi 12 décembre'
    and member_id in (a, b, c, d, pj, sec, tr);
  if n <> 7 then failures := failures || ('annonce : ' || n || ' membres prévenus sur 7'); end if;
  select count(*) into n from private.push_outbox where member_id = c and title = 'Bureau de l''AEGB · Annonce' and body = 'Assemblée générale le samedi 12 décembre';
  if n <> 1 then failures := failures || text 'annonce : pas partie vers les appareils'; end if;
  -- Annonces toujours reçues, même avec tout coupé.
  update public.notification_settings set prives = false, groupes = false, grand_groupe = false, reactions = false,
    votes = false, evenements = false, cotisation = false, poste = false where member_id = c;
  perform set_config('aegb.now', now()::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_announcement(ann2, 'Soirée de fin de semestre', 'Vendredi soir.', 'alumni', false, now() + interval '1 hour');
  reset role;
  select count(*) into n from public.notifications where link = '/app/fil/' || ann2;
  if n <> 0 then failures := failures || text 'annonce programmée : partie avant son heure'; end if;
  perform set_config('aegb.now', (now() + interval '61 minutes')::text, true);
  perform private.notifications_tick();
  perform private.notifications_tick();
  select count(*) into n from public.notifications where link = '/app/fil/' || ann2;
  if n <> 3 then failures := failures || ('annonce programmée : ' || n || ' membres prévenus au lieu des 3 alumni de l''essai'); end if;
  select count(*) into n from public.notifications where link = '/app/fil/' || ann2 and member_id in (c, sec, tr);
  if n <> 3 then failures := failures || text 'annonce programmée : pas pour son public'; end if;
  select count(*) into n from private.push_outbox where member_id = c and body = 'Soirée de fin de semestre';
  if n <> 1 then failures := failures || text 'annonce : coupée par les réglages'; end if;
  update public.notification_settings set prives = true, groupes = true, grand_groupe = true, reactions = true,
    votes = true, evenements = true, cotisation = true, poste = true where member_id = c;
  perform set_config('aegb.now', t0::text, true);

  -- 7. Les messages du compte AEGB ----------------------------------------
  perform private.dues_message(c, 'relance', 'Bonjour Coumba, ta cotisation de novembre n''est pas encore réglée, soit 5 €.', '{}'::jsonb);
  set constraints all immediate;
  select count(*) into n from public.notifications
  where member_id = c and category = 'cotisation' and official and link = '/app/cotisation'
    and text = '**Cotisation en retard** : Bonjour Coumba, ta cotisation de novembre n''est pas encore réglée, soit 5 €.';
  if n <> 1 then failures := failures || text 'compte AEGB : relance de cotisation absente'; end if;
  select count(*) into n from private.push_outbox where member_id = c and title = 'Cotisation en retard' and body like 'Bonjour Coumba,%';
  if n <> 1 then failures := failures || text 'compte AEGB : relance pas partie vers les appareils'; end if;
  -- Une réponse du bureau au compte AEGB part comme un message privé.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  aegb_a := public.my_aegb();
  perform public.send_message(aegb_a, gen_random_uuid(), 'Bonjour, il me faut une attestation.');
  set constraints all immediate;
  reset role;
  select count(*) into n from public.notifications
  where member_id = pj and category = 'poste' and chip = 'Compte AEGB' and link = '/bureau/aegb/' || aegb_a
    and text = '**Awa Diallo** a écrit au compte AEGB : « Bonjour, il me faut une attestation. »' and read_at is null;
  if n <> 1 then failures := failures || text 'bureau : message au compte AEGB absent'; end if;
  select count(*) into n from public.notifications where member_id in (com, tr) and chip = 'Compte AEGB';
  if n <> 0 then failures := failures || text 'bureau : message AEGB envoyé à un poste sans le droit'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.touch_device(dev_pj, 'android', 'Android · Chrome');
  perform public.save_push_device(dev_pj, 'https://push.example.test/pj', repeat('P', 87), repeat('p', 22));
  perform public.send_message(aegb_a, gen_random_uuid(), 'Bonjour Awa, je te la prépare.');
  set constraints all immediate;
  reset role;
  select count(*) into n from public.notifications where member_id = pj and chip = 'Compte AEGB' and read_at is null;
  if n <> 0 then failures := failures || text 'bureau : notification AEGB pas lue après la réponse'; end if;

  -- 8. Le bureau : comptes, signalements, candidatures, paiements ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (w, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-w@test.invalid',
          '{"first_name":"Wassa","last_name":"Sow","member_type":"etudiant","charter_version":"1"}', null, now(), now());
  select count(*) into n from public.notifications where chip = 'Comptes';
  if n <> 0 then failures := failures || text 'comptes : prévenu avant la confirmation de l''email'; end if;
  update auth.users set email_confirmed_at = now() where id = w;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (w2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-w2@test.invalid',
          '{"first_name":"Wouri","last_name":"Sylla","member_type":"etudiant","charter_version":"1"}', now(), now(), now());
  select count(*) into n from public.notifications
  where chip = 'Comptes' and text = '**2 comptes** attendent leur validation' and member_id in (pj, sec) and read_at is null;
  if n <> 2 then failures := failures || ('comptes : ' || n || ' notifications regroupées au lieu de 2'); end if;
  select count(*) into n from public.notifications where chip = 'Comptes' and member_id in (com, tr);
  if n <> 0 then failures := failures || text 'comptes : poste sans le droit prévenu'; end if;
  update public.profiles set status = 'actif', validated_at = now() where id in (w, w2);
  select count(*) into n from public.notifications where chip = 'Comptes' and read_at is null;
  if n <> 0 then failures := failures || text 'comptes : toujours à traiter une fois tout validé'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.report_content(post_b, null, 'spam');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.report_content(post_b, null, 'irrespect');
  reset role;
  select count(*), max(text) into n, t from public.notifications where member_id = com and chip = 'Modération';
  if n <> 1 or t is distinct from 'Une publication de Bakary Bah a été **signalée** 2 fois' then
    failures := failures || ('modération : ' || n || ' lignes, « ' || coalesce(t, '') || ' »');
  end if;
  select title into t from private.push_outbox where member_id = pj limit 0;

  insert into public.assemblies (id, status, held_at, place, vote_opens_at, vote_closes_at, candidacy_until)
  values (ag, 'convoquee', t0 + interval '20 days', 'UFR Sciences', t0 + interval '20 days', t0 + interval '20 days 2 hours', t0 + interval '10 days');
  insert into public.candidacies (assembly_id, role_code, member_id, statement)
  values (ag, 'secretariat', d, 'Je veux aider l''association.');
  select count(*) into n from public.notifications
  where member_id = sec and chip = 'Élections' and text = '**Nouvelle candidature** : Djibril Diaby pour « Secrétariat général »' and actors = array[d];
  if n <> 1 then failures := failures || text 'élections : candidature absente'; end if;
  insert into public.candidacies (assembly_id, role_code, member_id, statement, paper)
  values (ag, 'tresorerie', b, 'Sur papier.', true);
  select count(*) into n from public.notifications where member_id = sec and chip = 'Élections';
  if n <> 1 then failures := failures || text 'élections : candidature papier notifiée'; end if;

  insert into public.dues_payments (member_id, member_name, method, months, monthly_cents, amount_cents)
  values (a, 'Awa Diallo', 'carte', array[date '2026-11-01'], 500, 500) returning id into pay;
  update public.dues_payments set status = 'confirme', confirmed_at = private.clock() where id = pay;
  select count(*) into n from public.notifications
  where member_id = tr and chip = 'Trésorerie' and text = '**1 paiement** par carte reçu cette semaine' and link = '/bureau/cotisations';
  if n <> 1 then failures := failures || text 'trésorerie : paiement par carte absent'; end if;
  insert into public.dues_payments (member_id, member_name, method, months, monthly_cents, amount_cents, status, confirmed_at)
  values (b, 'Bakary Bah', 'especes', array[date '2026-11-01'], 500, 500, 'en_attente', null) returning id into pay;
  update public.dues_payments set status = 'confirme', confirmed_at = private.clock() where id = pay;
  select count(*) into n from public.notifications where member_id = tr and chip = 'Trésorerie';
  if n <> 1 then failures := failures || text 'trésorerie : paiement en espèces notifié'; end if;

  insert into public.member_warnings (member_id, given_by, given_by_name, reason)
  values (d, com, 'Le bureau', 'Merci de rester courtois dans le grand groupe.');
  select count(*) into n from public.notifications
  where member_id = d and category = 'compte' and official and text = '**Le bureau** t''a adressé un avertissement : « Merci de rester courtois dans le grand groupe. »';
  if n <> 1 then failures := failures || text 'avertissement : absent'; end if;

  -- 9. La veille de la fermeture d'un vote, pour qui n'a pas voté -----------
  update public.assemblies set status = 'vote' where id = ag;
  insert into public.ballots (id, assembly_id, round, opened_at, opened_by_name, closes_at)
  values (bal, ag, 1, t0 - interval '2 days', 'Le bureau', t0 + interval '20 hours');
  insert into public.ballot_electors (ballot_id, member_id) values (bal, a), (bal, b), (bal, c);
  insert into public.ballot_voters (ballot_id, member_id) values (bal, a);
  perform private.notifications_tick();
  perform private.notifications_tick();
  select count(*) into n from public.notifications where link = '/app/votes' and text like '**Rappel de vote** : le vote ferme %et tu n''as pas encore voté.';
  if n <> 2 then failures := failures || ('veille du vote : ' || n || ' rappels au lieu de 2'); end if;
  select count(*) into n from public.notifications where member_id = a and link = '/app/votes';
  if n <> 0 then failures := failures || text 'veille du vote : rappel à qui a déjà voté'; end if;
  delete from public.ballot_voters where ballot_id = bal;
  delete from public.ballot_electors where ballot_id = bal;
  delete from public.ballots where id = bal;
  delete from public.candidacies where assembly_id = ag;
  delete from public.assemblies where id = ag;

  -- 10. La cloche du membre --------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.my_notifications();
  if jsonb_array_length(j) < 5 then failures := failures || ('cloche : ' || jsonb_array_length(j) || ' notifications seulement'); end if;
  if j -> 0 ->> 'id' is null or j @? '$[*] ? (@.category == "annonces" && @.official != true)' then
    failures := failures || text 'cloche : forme inattendue';
  end if;
  if not j @? '$[*] ? (@.icon == "reaction" && @.actor.first_name == "Djibril" && @.others == 2)' then
    failures := failures || text 'cloche : réactions sans la personne ou le nombre';
  end if;
  select count(*) into n from public.notifications;
  if n <> (select count(*) from public.notifications where member_id = b) then failures := failures || text 'cloche : voit celle des autres'; end if;
  n := (public.my_badge() ->> 'notifications')::integer;
  if n < 4 then failures := failures || ('pastille : ' || n); end if;
  if (public.my_badge() ->> 'total')::integer <> n + 3 then failures := failures || ('icône : ' || (public.my_badge() ->> 'total') || ' au lieu de ' || (n + 3)); end if;
  perform public.mark_link_read('/app/fil/' || post_b);
  select count(*) into n from public.notifications where link = '/app/fil/' || post_b and read_at is null;
  if n <> 0 then failures := failures || text 'cloche : publication ouverte, notifications pas lues'; end if;
  perform public.mark_read(gg);
  select count(*) into n from public.notifications where link = '/app/messages/' || gg and read_at is null;
  if n <> 0 then failures := failures || text 'cloche : conversation ouverte, notifications pas lues'; end if;
  perform public.mark_notifications_read();
  if (public.my_badge() ->> 'notifications')::integer <> 0 then failures := failures || text 'cloche : « Tout lire » laisse des notifications'; end if;
  reset role;

  -- 11. Réglages et confidentialité -------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_notification_settings('{"reactions": false, "calme_debut": "23:00", "apercu": false}');
  j := public.my_settings();
  if j -> 'notifications' ->> 'reactions' <> 'false' or j -> 'notifications' ->> 'calme_debut' <> '23:00'
     or j -> 'notifications' ->> 'apercu' <> 'false' or j -> 'notifications' ->> 'prives' <> 'true' or j -> 'poste' <> 'null'::jsonb then
    failures := failures || ('réglages : ' || j::text);
  end if;
  begin
    perform public.save_notification_settings('{"annonces": false}');
    failures := failures || text 'réglages : annonces coupées';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.my_settings();
  if j -> 'poste' ->> 'role' <> 'Projets et intégration' or j -> 'poste' -> 'receives' <> '["comptes à valider", "compte AEGB"]'::jsonb then
    failures := failures || ('réglages du poste : ' || coalesce(j ->> 'poste', 'absent'));
  end if;
  j := public.reachable_members();
  if (j ->> 'reachable')::integer <> 3 or (j ->> 'iphone')::integer <> 1 or (j ->> 'ordinateur')::integer <> 1 then
    failures := failures || ('membres joignables : ' || j::text);
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.reachable_members();
    failures := failures || text 'membres joignables : visibles par un membre';
  exception when insufficient_privilege then null;
  end;
  -- Le numéro : au bureau seulement, sauf si le membre le montre.
  if public.member_contact(c) ->> 'phone' is not null then failures := failures || text 'numéro : visible par un membre'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_privacy('{"phone_visibility": "membres", "who_can_write": "conversations"}');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.member_contact(c) ->> 'phone' is distinct from '06 11 22 33 44' then failures := failures || text 'numéro : caché alors que montré'; end if;
  -- Qui peut m'écrire : Awa a déjà parlé avec Coumba dans le grand groupe, pas en privé.
  if (public.member_contact(c) ->> 'can_write')::boolean then failures := failures || text 'qui peut m''écrire : bouton Écrire montré'; end if;
  ac := public.open_private(c);
  begin
    perform public.send_message(ac, gen_random_uuid(), 'Salut Coumba');
    failures := failures || text 'qui peut m''écrire : message parti';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not (public.member_contact(c) ->> 'can_write')::boolean then failures := failures || text 'qui peut m''écrire : le bureau ne peut pas écrire'; end if;
  perform public.send_message(public.open_private(c), gen_random_uuid(), 'Bonjour Coumba, c''est pour l''AG.');
  reset role;
  -- Une conversation commencée : l'autre peut répondre.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(ac, gen_random_uuid(), 'Coucou Awa');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(ac, gen_random_uuid(), 'Coucou !');
  if not (public.member_contact(c) ->> 'can_write')::boolean then failures := failures || text 'qui peut m''écrire : conversation commencée refusée'; end if;
  reset role;

  -- « Vu » réciproque
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.mark_read(ab);
  -- Les lectures des autres ne se lisent plus directement.
  select count(*) into n from public.conversation_members where conversation_id = ab;
  if n <> 1 then failures := failures || text 'vu : lectures de l''autre lisibles directement'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.conversation_info(ab) -> 'other' ->> 'last_read_at' is null then failures := failures || text 'vu : caché sans raison'; end if;
  reset role;
  update public.member_privacy set show_seen = false where member_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.conversation_info(ab) -> 'other' ->> 'last_read_at' is not null then failures := failures || text 'vu : montré alors que caché par l''autre'; end if;
  reset role;
  update public.member_privacy set show_seen = true where member_id = b;
  update public.member_privacy set show_seen = false where member_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.conversation_info(ab) -> 'other' ->> 'last_read_at' is not null then failures := failures || text 'vu : pas réciproque'; end if;
  reset role;
  update public.member_privacy set show_seen = true where member_id = a;

  -- 12. Retirer un appareil, l'essai ----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := public.test_push(dev_b);
  if not ok then failures := failures || text 'essai : pas parti'; end if;
  perform public.revoke_device(dev_b2);
  select jsonb_array_length(public.my_devices()) into n;
  if n <> 1 then failures := failures || text 'retirer : appareil encore dans la liste'; end if;
  reset role;
  select count(*) into n from private.push_outbox where member_id = b and category = 'essai' and device_id = dev_b and not quiet;
  if n <> 1 then failures := failures || text 'essai : pas pour cet appareil seulement'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.touch_device(dev_b2, 'ordinateur', 'Windows · Edge');
  if not (j ->> 'revoked')::boolean then failures := failures || text 'retirer : l''appareil ne se déconnecte pas'; end if;
  j := public.touch_device(dev_b2, 'ordinateur', 'Windows · Edge');
  if (j ->> 'revoked')::boolean then failures := failures || text 'retirer : reconnexion impossible'; end if;
  perform public.forget_device(dev_b2);
  reset role;

  -- 13. L'envoi par la fonction serveur ----------------------------------------
  update private.push_outbox set sent_at = now() where member_id <> b;
  perform set_config('aegb.now', (t0 + interval '2 hours')::text, true);
  j := public.push_claim();
  if jsonb_array_length(j) <> 1 or j -> 0 ->> 'member_id' <> b::text
     or jsonb_array_length(j -> 0 -> 'devices') <> 1 or j -> 0 -> 'devices' -> 0 ->> 'endpoint' <> 'https://push.example.test/b1'
     or (j -> 0 ->> 'badge')::integer < 1 then
    failures := failures || ('envoi : ' || left(j::text, 300));
  end if;
  if jsonb_array_length(public.push_claim()) <> 0 then failures := failures || text 'envoi : pris deux fois'; end if;
  perform public.push_done(array(select (x ->> 'id')::bigint from jsonb_array_elements(j -> 0 -> 'items') x));
  select string_agg(category || ':' || title || ':' || due_at::text, ', ') into t from private.push_outbox where sent_at is null;
  if t is not null then failures := failures || ('envoi : pas marqué comme envoyé ' || t); end if;
  perform public.push_device_result(dev_b, false, true);
  select count(*) into n from public.devices where id = dev_b and endpoint is null;
  if n <> 1 then failures := failures || text 'envoi : abonnement disparu gardé'; end if;

  -- 14. Supprimer mon compte -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.request_account_deletion();
    failures := failures || text 'suppression : acceptée pour un membre du bureau';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.request_account_deletion();
  if (j ->> 'purge_on')::timestamptz::date <> (now() + interval '30 days')::date then failures := failures || ('suppression : date ' || j::text); end if;
  reset role;
  select count(*) into n from public.devices where member_id = c;
  if n <> 0 then failures := failures || text 'suppression : appareils gardés'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id = c;
  if n <> 0 then failures := failures || text 'suppression : profil encore visible'; end if;
  begin
    perform public.send_message(ac, gen_random_uuid(), 'Tu es partie ?');
    failures := failures || text 'suppression : message privé accepté';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id = c and deletion_requested_at is not null;
  if n <> 1 then failures := failures || text 'suppression : le bureau ne voit plus le compte fermé'; end if;
  reset role;
  perform private.dues_message(c, 'relance', 'Rappel.', '{}'::jsonb);
  set constraints all immediate;
  select count(*) into n from public.notifications where member_id = c and text like '%Rappel.';
  if n <> 0 then failures := failures || text 'suppression : notifications pour un compte fermé'; end if;
  if jsonb_array_length(public.accounts_to_purge()) <> 0 then failures := failures || text 'suppression : effacé avant 30 jours'; end if;
  -- Se reconnecter : tout revient.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.cancel_account_deletion() then failures := failures || text 'suppression : pas annulée'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.request_account_deletion();
  reset role;
  update public.profiles set deletion_requested_at = now() - interval '31 days' where id = c;
  j := public.accounts_to_purge();
  if jsonb_array_length(j) <> 1 or j -> 0 ->> 'id' <> c::text or j -> 0 ->> 'name' <> 'Coumba Camara' then
    failures := failures || ('suppression : à effacer ' || j::text);
  end if;
  -- L'effacement (fait par la fonction serveur) : les messages restent sans nom.
  perform public.account_purged(c, 'Coumba Camara');
  delete from auth.users where id = c;
  select count(*) into n from public.messages where conversation_id = gg and sender_id is null and body like 'Moi !%';
  if n <> 1 then failures := failures || text 'effacement : message du grand groupe effacé'; end if;
  select count(*) into n from public.activity_log where action = 'compte_efface' and subject_name = 'Coumba Camara';
  if n <> 1 then failures := failures || text 'effacement : pas au journal'; end if;

  update public.bureau_roles r set holder_id = (old_roles ->> r.code)::uuid where not locked;

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
