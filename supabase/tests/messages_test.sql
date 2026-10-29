-- Test des règles des messages (lot 3) : arrivée d'un membre, conversations
-- privées, bureau tenu à l'écart, blocage, fichiers, petits groupes, compte
-- officiel AEGB, message de bienvenue et messages signalés.
--
-- Comme les autres tests, le script crée des comptes fictifs, joue des
-- scénarios en se faisant passer pour chacun, puis lève une erreur qui annule
-- tout : la base reste intacte. Le message final commence par « TESTS OK » ou
-- par « ÉCHEC ».
--
-- À lancer dans l'éditeur SQL de Supabase (ou avec psql) en tant que postgres.

do $$
declare
  a uuid := gen_random_uuid();   -- Awa, membre
  b uuid := gen_random_uuid();   -- Bakary, membre
  c uuid := gen_random_uuid();   -- Coumba, membre
  w uuid := gen_random_uuid();   -- Wouri, inscrit en attente
  pj uuid := gen_random_uuid();  -- poste Projets et intégration (compte AEGB)
  com uuid := gen_random_uuid(); -- poste Communication (modération)
  g uuid;                        -- admin numérique (titulaire actuel, ou fictif)
  old_pj uuid;
  old_com uuid;
  gg uuid;                       -- grand groupe
  ab uuid;                       -- conversation privée Awa / Bakary
  aa uuid;                       -- conversation d'Awa avec AEGB
  grp uuid;                      -- petit groupe
  grp2 uuid;
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid();
  m4 uuid := gen_random_uuid();
  m5 uuid := gen_random_uuid();
  m6 uuid := gen_random_uuid();
  m7 uuid := gen_random_uuid();
  m8 uuid := gen_random_uuid();
  m9 uuid := gen_random_uuid();
  n integer;
  ok boolean;
  t text;
  j jsonb;
  paths text[];
  failures text[] := '{}';

begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-a@test.invalid',
     '{"first_name":"Awa","last_name":"Diallo","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-b@test.invalid',
     '{"first_name":"Bakary","last_name":"Bah","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-c@test.invalid',
     '{"first_name":"Coumba","last_name":"Camara","member_type":"alumni","charter_version":"1"}', now(), now(), now()),
    (w, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-w@test.invalid',
     '{"first_name":"Wouri","last_name":"Wane","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (pj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-pj@test.invalid',
     '{"first_name":"Penda","last_name":"Joof","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (com, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-com@test.invalid',
     '{"first_name":"Cheikh","last_name":"Oumar","member_type":"etudiant","charter_version":"1"}', now(), now(), now());

  select holder_id into old_pj from public.bureau_roles where code = 'projets';
  update public.bureau_roles set holder_id = pj, assigned_at = now() where code = 'projets';
  select holder_id into old_com from public.bureau_roles where code = 'communication';
  update public.bureau_roles set holder_id = com, assigned_at = now() where code = 'communication';
  select holder_id into g from public.bureau_roles where code = 'admin_numerique';
  if g is null then
    g := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msg-g@test.invalid',
      '{"first_name":"Garant","last_name":"Test","member_type":"etudiant","charter_version":"1"}', now(), now(), now());
    update public.profiles set status = 'actif', validated_at = now() where id = g;
    update public.bureau_roles set holder_id = g, assigned_at = now() where code = 'admin_numerique';
  end if;
  gg := private.grand_groupe();

  -- 1. La validation ouvre le grand groupe, la conversation AEGB et la bienvenue
  update public.profiles set status = 'actif', validated_at = now(), city = 'Lyon' where id in (a, b, c, pj, com);
  update public.profiles set member_type = 'alumni' where id = c;

  select count(*) into n from public.conversation_members where conversation_id = gg and member_id in (a, b, c, pj, com);
  if n <> 5 then failures := failures || text 'arrivée : pas tous dans le grand groupe'; end if;
  select count(*) into n from public.conversation_members where conversation_id = gg and member_id = w;
  if n <> 0 then failures := failures || text 'arrivée : un inscrit en attente est dans le grand groupe'; end if;
  select id into aa from public.conversations where kind = 'aegb' and member_id = a;
  if aa is null then failures := failures || text 'arrivée : pas de conversation AEGB'; end if;
  select count(*) into n from public.messages
  where conversation_id = aa and kind = 'bienvenue' and as_aegb and sender_id is null and body like 'Bonjour Awa,%';
  if n <> 1 then failures := failures || text 'arrivée : bienvenue absente ou mal remplie'; end if;
  select count(*) into n from public.messages
  where conversation_id = gg and kind = 'arrivee' and meta ->> 'member' = a::text
    and body = 'Awa Diallo vient de rejoindre l''AEGB. Souhaitez-lui la bienvenue !';
  if n <> 1 then failures := failures || text 'arrivée : pas d''annonce dans le grand groupe'; end if;

  -- Suspendu puis réactivé : pas de seconde bienvenue
  update public.profiles set status = 'suspendu', suspended_at = now() where id = c;
  update public.profiles set status = 'actif', suspended_at = null where id = c;
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = c and m.kind = 'bienvenue';
  if n <> 1 then failures := failures || text 'arrivée : bienvenue renvoyée à la réactivation'; end if;
  select count(*) into n from public.messages where conversation_id = gg and kind = 'arrivee' and meta ->> 'member' = c::text;
  if n <> 1 then failures := failures || text 'arrivée : annonce renvoyée à la réactivation'; end if;

  -- 2. Un inscrit en attente n'a pas de messages ------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.my_conversations();
    failures := failures || text 'en attente : voit ses conversations';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.conversations;
  if n <> 0 then failures := failures || text 'en attente : voit des conversations'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.open_private(w);
    failures := failures || text 'privé : conversation ouverte avec un inscrit en attente';
  exception when no_data_found then null;
  end;

  -- 3. Conversation privée -----------------------------------------------------
  ab := public.open_private(b);
  if public.open_private(b) <> ab then failures := failures || text 'privé : deux conversations pour la même paire'; end if;
  begin
    perform public.open_private(a);
    failures := failures || text 'privé : conversation avec soi-même';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into n from public.my_conversations() where id = ab;
  if n <> 0 then failures := failures || text 'privé : conversation vide dans la liste'; end if;
  select count(*) into n from public.my_conversations() where id = gg and title = 'Grand groupe AEGB';
  if n <> 1 then failures := failures || text 'liste : grand groupe absent'; end if;
  select count(*) into n from public.my_conversations() where id = aa and title = 'AEGB' and unread = 1;
  if n <> 1 then failures := failures || text 'liste : bienvenue non comptée comme non lue'; end if;

  perform public.send_message(ab, m1, '  Salut Bakary  ');
  begin
    perform public.send_message(ab, m1, 'Encore');
    failures := failures || text 'privé : identifiant réutilisé';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_message(ab, gen_random_uuid(), '   ');
    failures := failures || text 'privé : message vide accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_message(ab, gen_random_uuid(), repeat('a', 4001));
    failures := failures || text 'privé : plus de 4 000 caractères acceptés';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform 1 from public.messages;
    failures := failures || text 'privé : table des messages lisible directement';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_conversations()
  where id = ab and other_id = a and unread = 1 and last_preview = 'Salut Bakary' and last_sender_id = a;
  if n <> 1 then failures := failures || text 'privé : la conversation n''arrive pas chez Bakary'; end if;
  perform public.mark_read(ab);
  select unread into n from public.my_conversations() where id = ab;
  if n <> 0 then failures := failures || text 'privé : « lu » non pris en compte'; end if;

  -- Répondre en citant, réagir
  perform public.send_message(ab, m2, 'Ça va ?', m1);
  select reply ->> 'excerpt' into t from public.conversation_messages(ab) where id = m2;
  if t is distinct from 'Salut Bakary' then failures := failures || text 'citer : extrait absent'; end if;
  perform public.react_message(m1, 'jadore');
  perform public.react_message(m1, 'rire');
  select reactions into j from public.conversation_messages(ab) where id = m1;
  if j <> jsonb_build_array(jsonb_build_object('kind', 'rire', 'member_id', b)) then
    failures := failures || text 'réagir : une réaction par personne non respectée';
  end if;
  perform public.react_message(m1, null);
  select jsonb_array_length(reactions) into n from public.conversation_messages(ab) where id = m1;
  if n <> 0 then failures := failures || text 'réagir : réaction non retirée'; end if;
  begin
    perform public.delete_message(m1);
    failures := failures || text 'supprimer : message d''un autre supprimé';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 4. Le bureau ne lit pas les conversations ---------------------------------
  foreach t in array array[c::text, pj::text, com::text, g::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.conversations where id = ab;
    if n <> 0 then failures := failures || ('confidentialité : ' || t || ' voit la conversation privée'); end if;
    select count(*) into n from public.conversation_members where conversation_id = ab;
    if n <> 0 then failures := failures || ('confidentialité : ' || t || ' voit les membres de la conversation'); end if;
    begin
      perform * from public.conversation_messages(ab);
      failures := failures || ('confidentialité : ' || t || ' lit la conversation privée');
    exception when no_data_found then null;
    end;
    begin
      perform public.send_message(ab, gen_random_uuid(), 'Intrus');
      failures := failures || ('confidentialité : ' || t || ' écrit dans la conversation privée');
    exception when no_data_found then null;
    end;
    reset role;
  end loop;

  -- 5. Fichiers ----------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('messages', ab::text || '/' || m3::text || '/0.jpg', a::text, '{"size": 1000}'),
         ('messages', ab::text || '/' || m3::text || '/1.jpg', a::text, '{"size": 1000}');
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('messages', 'pas-un-dossier/x.jpg', a::text);
    failures := failures || text 'fichiers : dépôt hors d''une conversation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_message(ab, m3, '', null, jsonb_build_array(
      jsonb_build_object('kind', 'photo', 'path', ab::text || '/' || m3::text || '/9.jpg')));
    failures := failures || text 'fichiers : fichier absent accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_message(ab, m3, '', null, jsonb_build_array(
      jsonb_build_object('kind', 'photo', 'path', ab::text || '/' || m3::text || '/0.jpg'),
      jsonb_build_object('kind', 'document', 'path', ab::text || '/' || m3::text || '/1.jpg')));
    failures := failures || text 'fichiers : photo et document mélangés';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_message(ab, m3, '', null, (
      select jsonb_agg(jsonb_build_object('kind', 'photo', 'path', ab::text || '/' || m3::text || '/' || i || '.jpg'))
      from generate_series(0, 10) i));
    failures := failures || text 'fichiers : 11 photos acceptées';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_message(ab, m3, '', null, jsonb_build_array(
      jsonb_build_object('kind', 'vocal', 'path', ab::text || '/' || m3::text || '/0.jpg', 'duration', 130)));
    failures := failures || text 'fichiers : vocal de plus de 2 minutes';
  exception when invalid_parameter_value then null;
  end;
  perform public.send_message(ab, m3, '', null, jsonb_build_array(
    jsonb_build_object('kind', 'photo', 'path', ab::text || '/' || m3::text || '/0.jpg', 'width', 800, 'height', 600),
    jsonb_build_object('kind', 'photo', 'path', ab::text || '/' || m3::text || '/1.jpg', 'width', 800, 'height', 600)));
  select last_preview into t from public.my_conversations() where id = ab;
  if t is distinct from '2 photos' then failures := failures || text 'fichiers : aperçu « 2 photos » absent'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'messages' and name like ab::text || '/' || m3::text || '/%';
  if n <> 2 then failures := failures || text 'fichiers : Bakary ne voit pas les photos'; end if;
  select jsonb_array_length(files) into n from public.conversation_messages(ab) where id = m3;
  if n <> 2 then failures := failures || text 'fichiers : photos absentes du message'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'messages' and name like ab::text || '/%';
  if n <> 0 then failures := failures || text 'fichiers : Coumba voit les photos d''une conversation privée'; end if;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('messages', ab::text || '/' || gen_random_uuid()::text || '/0.jpg', c::text);
    failures := failures || text 'fichiers : Coumba dépose dans une conversation privée';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Supprimer pour tous : il reste « Message supprimé », les fichiers partent
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  paths := public.delete_message(m3);
  if cardinality(paths) <> 2 then failures := failures || text 'supprimer : chemins des fichiers non rendus'; end if;
  select last_preview into t from public.my_conversations() where id = ab;
  if t is distinct from 'Message supprimé' then failures := failures || text 'supprimer : aperçu non mis à jour'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select deleted and body is null and files = '[]'::jsonb into ok from public.conversation_messages(ab) where id = m3;
  if not coalesce(ok, false) then failures := failures || text 'supprimer : contenu encore visible'; end if;
  select count(*) into n from storage.objects where bucket_id = 'messages' and name like ab::text || '/' || m3::text || '/%';
  if n <> 0 then failures := failures || text 'supprimer : fichiers encore lisibles'; end if;
  begin
    perform public.react_message(m3, 'jaime');
    failures := failures || text 'supprimer : réaction sur un message supprimé';
  exception when no_data_found then null;
  end;
  reset role;

  -- 6. Bloquer ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.mark_read(ab);
  perform public.block_member(a);
  select count(*) into n from public.blocks;
  if n <> 1 then failures := failures || text 'bloquer : blocage non enregistré'; end if;
  begin
    perform public.send_message(ab, gen_random_uuid(), 'Coucou');
    failures := failures || text 'bloquer : on écrit à un membre qu''on a bloqué';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.blocks;
  if n <> 0 then failures := failures || text 'bloquer : Awa voit qu''elle est bloquée'; end if;
  perform public.send_message(ab, m4, 'Tu es là ?');  -- part sans erreur
  select count(*) into n from public.conversation_messages(ab) where id = m4;
  if n <> 1 then failures := failures || text 'bloquer : Awa ne voit plus son propre message'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.conversation_messages(ab) where id = m4;
  if n <> 0 then failures := failures || text 'bloquer : le message arrive quand même'; end if;
  select unread into n from public.my_conversations() where id = ab;
  if n <> 0 then failures := failures || text 'bloquer : message compté comme non lu'; end if;
  select blocked into ok from public.my_conversations() where id = ab;
  if not coalesce(ok, false) then failures := failures || text 'bloquer : la liste ne dit pas « bloqué »'; end if;
  perform public.unblock_member(a);
  select count(*) into n from public.conversation_messages(ab) where id = m4;
  if n <> 0 then failures := failures || text 'bloquer : le message reçu pendant le blocage arrive au déblocage'; end if;
  perform public.send_message(ab, gen_random_uuid(), 'Désolé, me revoilà');
  reset role;

  -- 7. Petits groupes -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_group('  ', array[b]);
    failures := failures || text 'groupe : nom vide accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_group('Seule', array[a]);
    failures := failures || text 'groupe : groupe sans autre membre';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_group('Avec un inscrit', array[b, w]);
    failures := failures || text 'groupe : inscrit en attente ajouté';
  exception when invalid_parameter_value then null;
  end;
  grp := public.create_group('  Projet puits  ', array[b]);
  select title = 'Projet puits' into ok from public.conversations where id = grp;
  if not coalesce(ok, false) then failures := failures || text 'groupe : nom non nettoyé'; end if;
  select (j2 ->> 'manager')::boolean and (j2 ->> 'members_count')::integer = 2
  into ok from (select public.conversation_info(grp) as j2) x;
  if not coalesce(ok, false) then failures := failures || text 'groupe : la créatrice ne gère pas le groupe'; end if;
  perform public.add_group_members(grp, array[c, pj]);
  select body into t from public.conversation_messages(grp) where kind = 'systeme' order by created_at desc, body limit 1;
  if t not like 'Awa Diallo a ajouté % et %' then failures := failures || ('groupe : message d''ajout mal formé : ' || coalesce(t, '(rien)')); end if;
  begin
    perform public.add_group_members(grp, array[b]);
    failures := failures || text 'groupe : membre ajouté deux fois';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.leave_group(gg);
    failures := failures || text 'grand groupe : on peut le quitter';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_group(gg, 'Autre nom');
    failures := failures || text 'grand groupe : on peut le renommer';
  exception when no_data_found then null;
  end;
  perform public.send_message(grp, m5, 'Réunion samedi ?');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.update_group(grp, 'Renommé');
    failures := failures || text 'groupe : un membre renomme le groupe';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_group_member(grp, c);
    failures := failures || text 'groupe : un membre retire quelqu''un';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.my_conversations() where id = grp and unread = 1;
  if n <> 1 then failures := failures || text 'groupe : message non compté chez Bakary'; end if;
  perform public.send_message(grp, m6, 'Oui, 15 h');
  select count(*) into n from public.my_conversations() where id = grp and unread = 0;
  if n <> 1 then failures := failures || text 'groupe : ma réponse ne vaut pas lecture'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.remove_group_member(grp, pj);
  perform public.set_group_manager(grp, b, true);
  perform public.update_group(grp, 'Projet puits 2026');
  perform public.leave_group(grp);
  reset role;
  select count(*) into n from public.conversation_members where conversation_id = grp and is_manager;
  if n <> 1 then failures := failures || text 'groupe : gérants mal comptés après le départ'; end if;
  select is_manager into ok from public.conversation_members where conversation_id = grp and member_id = b;
  if not coalesce(ok, false) then failures := failures || text 'groupe : Bakary ne gère plus le groupe'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.conversation_messages(grp);
    failures := failures || text 'groupe : un membre retiré lit encore le groupe';
  exception when no_data_found then null;
  end;
  reset role;

  -- Le dernier gérant part : le plus ancien membre prend le relais
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  grp2 := public.create_group('Sortie', array[a, b]);
  perform public.leave_group(grp2);
  reset role;
  select count(*) into n from public.conversation_members where conversation_id = grp2 and is_manager;
  if n <> 1 then failures := failures || text 'groupe : personne ne prend le relais du gérant'; end if;

  -- 8. Signaler un message et le modérer ----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('messages', grp::text || '/' || m7::text || '/0.jpg', b::text, '{"size": 2000}');
  perform public.send_message(grp, m7, 'Regardez ça', null, jsonb_build_array(
    jsonb_build_object('kind', 'photo', 'path', grp::text || '/' || m7::text || '/0.jpg')));
  begin
    perform public.report_message(m7, 'spam');
    failures := failures || text 'signaler : on signale son propre message';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.report_message(m7, 'choquant') then failures := failures || text 'signaler : signalement refusé'; end if;
  if public.report_message(m7, 'choquant') then failures := failures || text 'signaler : signalé deux fois'; end if;
  select reported into ok from public.conversation_messages(grp) where id = m7;
  if not coalesce(ok, false) then failures := failures || text 'signaler : « signalé » absent'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into m8 from public.conversation_messages(aa) where kind = 'bienvenue' limit 1;
  begin
    perform public.report_message(m8, 'spam');
    failures := failures || text 'signaler : message d''AEGB signalé';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.moderate_message(m7, 'masquer');
    failures := failures || text 'modérer : un poste sans modération décide';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.moderation_queue()
  where message_id = m7 and place = 'groupe' and author_id = b and body = 'Regardez ça' and media_kind = 'photo' and reports = 1;
  if n <> 1 then failures := failures || text 'modérer : message absent de la file'; end if;
  if coalesce(public.moderation_pending(), 0) < 1 then failures := failures || text 'modérer : compteur sans le message'; end if;
  select count(*) into n from storage.objects where bucket_id = 'messages' and name = grp::text || '/' || m7::text || '/0.jpg';
  if n <> 1 then failures := failures || text 'modérer : la photo signalée est illisible pour la modération'; end if;
  select count(*) into n from storage.objects where bucket_id = 'messages' and name like grp::text || '/%' and name not like '%' || m7::text || '%';
  if n <> 0 then failures := failures || text 'modérer : la modération voit d''autres fichiers du groupe'; end if;
  begin
    perform public.moderate_message(m6, 'masquer');
    failures := failures || text 'modérer : décision sur un message non signalé';
  exception when invalid_parameter_value then null;
  end;
  perform public.moderate_message(m7, 'masquer_avertir');
  select count(*) into n from public.moderation_queue() where message_id = m7;
  if n <> 0 then failures := failures || text 'modérer : message encore dans la file'; end if;
  reset role;
  select count(*) into n from public.member_warnings where member_id = b and reason like 'Un message masqué%';
  if n <> 1 then failures := failures || text 'modérer : avertissement absent'; end if;
  select count(*) into n from public.moderation_decisions where message_id = m7 and decision = 'masquer_avertir' and reason = 'choquant';
  if n <> 1 then failures := failures || text 'modérer : décision non enregistrée'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select hidden and body is null and files = '[]'::jsonb into ok from public.conversation_messages(grp) where id = m7;
  if not coalesce(ok, false) then failures := failures || text 'modérer : message masqué encore lisible'; end if;
  select count(*) into n from storage.objects where bucket_id = 'messages' and name like grp::text || '/' || m7::text || '/%';
  if n <> 0 then failures := failures || text 'modérer : photo masquée encore lisible'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select hidden and body = 'Regardez ça' and hidden_reason is not null into ok from public.conversation_messages(grp) where id = m7;
  if not coalesce(ok, false) then failures := failures || text 'modérer : l''auteur ne voit pas son message masqué et pourquoi'; end if;
  reset role;

  -- 9. Le compte officiel AEGB ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.my_aegb() <> aa then failures := failures || text 'AEGB : mauvaise conversation'; end if;
  perform public.send_message(aa, m9, 'Bonjour, comment payer la cotisation ?');
  if public.aegb_pending() is not null then failures := failures || text 'AEGB : un membre voit le compteur du bureau'; end if;
  begin
    perform * from public.aegb_inbox();
    failures := failures || text 'AEGB : un membre voit la boîte du bureau';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.conversation_messages(aa);
    failures := failures || text 'AEGB : un membre lit la conversation d''un autre';
  exception when no_data_found then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.conversation_messages(aa);
    failures := failures || text 'AEGB : un poste sans le droit lit la conversation';
  exception when no_data_found then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.aegb_pending() <> 1 then failures := failures || ('AEGB : compteur à ' || coalesce(public.aegb_pending()::text, 'rien') || ' au lieu de 1'); end if;
  select count(*) into n from public.aegb_inbox() where id = aa and member_id = a and last_from_member;
  if n <> 1 then failures := failures || text 'AEGB : la question d''Awa n''est pas dans la boîte'; end if;
  perform public.send_message(aa, gen_random_uuid(), 'Bonjour Awa, par HelloAsso ou par carte.', m9);
  if public.aegb_pending() <> 0 then failures := failures || text 'AEGB : compteur non remis à zéro après la réponse'; end if;
  select count(*) into n from public.conversation_messages(aa) where as_aegb and kind = 'message' and sender_id is null and written_by_name = 'Penda Joof';
  if n <> 1 then failures := failures || text 'AEGB : le bureau ne voit pas qui a répondu'; end if;
  select count(*) into n from public.aegb_inbox() where id = aa and not last_from_member and replied_by_name = 'Penda Joof';
  if n <> 1 then failures := failures || text 'AEGB : boîte non mise à jour après la réponse'; end if;
  select (j2 ->> 'as_aegb')::boolean and j2 -> 'other' ->> 'id' = a::text into ok from (select public.conversation_info(aa) as j2) x;
  if not coalesce(ok, false) then failures := failures || text 'AEGB : en-tête du bureau incomplet'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.send_message(aa, gen_random_uuid(), 'Et le reçu arrive par e-mail.');
  reset role;
  select count(*) into n from public.aegb_replies r join public.messages m on m.id = r.message_id
  where m.conversation_id = aa and r.written_by_name = 'Le bureau' and r.written_by is null;
  if n <> 1 then failures := failures || text 'AEGB : la réponse de l''admin numérique n''est pas signée « Le bureau »'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.conversation_messages(aa) where as_aegb and kind = 'message' and written_by_name is null and sender_id is null;
  if n <> 2 then failures := failures || text 'AEGB : le membre voit qui a répondu, ou ne voit pas les réponses'; end if;
  select reply ->> 'sender_name' into t from public.conversation_messages(aa) where reply is not null limit 1;
  if t is distinct from 'Awa Diallo' then failures := failures || text 'AEGB : citation mal signée'; end if;
  reset role;

  -- 10. Le message de bienvenue ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_welcome('Salut', array['charte'], true);
    failures := failures || text 'bienvenue : un membre change le message';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.aegb_settings;
  if n <> 0 then failures := failures || text 'bienvenue : un membre lit les réglages'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_welcome('Salut', array['cotiser'], true);
    failures := failures || text 'bienvenue : bouton inconnu accepté';
  exception when invalid_parameter_value then null;
  end;
  perform public.save_welcome('Salut {Prénom} de {Ville}, {Type} !', array['charte'], false);
  aa := public.send_welcome_test();
  select count(*) into n from public.conversation_messages(aa)
  where kind = 'bienvenue' and body = 'Salut Penda de Lyon, étudiant !' and (meta ->> 'essai')::boolean;
  if n <> 1 then
    select body into t from public.conversation_messages(aa) where kind = 'bienvenue' order by created_at desc limit 1;
    failures := failures || ('bienvenue : essai mal rempli : ' || coalesce(t, '(rien)'));
  end if;
  reset role;
  select count(*) into n from public.activity_log where category = 'reglages' and action = 'bienvenue' and actor_id = pj;
  if n <> 1 then failures := failures || text 'bienvenue : changement absent du journal'; end if;

  -- Le nouveau texte part au prochain membre validé, sans annonce
  update public.profiles set status = 'actif', validated_at = now(), city = null where id = w;
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = w and m.kind = 'bienvenue' and m.body like 'Salut Wouri de , %';
  if n <> 1 then failures := failures || text 'bienvenue : nouveau texte non utilisé'; end if;
  select count(*) into n from public.messages where conversation_id = gg and kind = 'arrivee' and meta ->> 'member' = w::text;
  if n <> 0 then failures := failures || text 'bienvenue : annonce faite alors qu''elle est coupée'; end if;

  -- 11. Un membre suspendu n'a plus accès ----------------------------------------
  update public.profiles set status = 'suspendu', suspended_at = now() where id = c;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.conversation_messages(grp);
    failures := failures || text 'suspendu : lit encore un groupe';
  exception when insufficient_privilege or no_data_found then null;
  end;
  select count(*) into n from public.conversations;
  if n <> 0 then failures := failures || text 'suspendu : voit encore ses conversations'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select members into n from public.my_conversations() where id = grp;
  if n <> 1 then failures := failures || ('suspendu : encore compté dans le groupe (' || n || ')'); end if;
  reset role;

  update public.bureau_roles set holder_id = old_pj where code = 'projets';
  update public.bureau_roles set holder_id = old_com where code = 'communication';

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
