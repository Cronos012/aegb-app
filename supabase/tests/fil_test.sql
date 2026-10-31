-- Test des règles du fil d'actu (lot 2) : publications, réactions,
-- commentaires, signalements, modération, annonces et photos.
--
-- Comme le test du socle, le script crée des comptes fictifs, joue des
-- scénarios en se faisant passer pour chacun, puis lève une erreur qui annule
-- tout : la base reste intacte. Le message final commence par « TESTS OK » ou
-- par « ÉCHEC ».
--
-- À lancer dans l'éditeur SQL de Supabase (ou avec psql) en tant que postgres.

do $$
declare
  s uuid := gen_random_uuid();   -- étudiant actif
  al uuid := gen_random_uuid();  -- alumni actif
  w uuid := gen_random_uuid();   -- inscrit en attente
  com uuid := gen_random_uuid(); -- poste Communication (annonces et modération)
  g uuid;                        -- admin numérique (titulaire actuel, ou fictif)
  old_com uuid;
  p1 uuid := gen_random_uuid();  -- publication texte de s
  p2 uuid := gen_random_uuid();  -- publication photo de s
  p3 uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid();  -- annonce pour les étudiants
  a2 uuid := gen_random_uuid();  -- annonce programmée
  a3 uuid := gen_random_uuid();  -- annonce de l'admin numérique
  c1 uuid;
  c2 uuid;
  c3 uuid;
  n integer;
  ok boolean;
  t text;
  paths text[];
  failures text[] := '{}';

begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values
    (s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fil-s@test.invalid',
     '{"first_name":"Sara","last_name":"Sow","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (al, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fil-al@test.invalid',
     '{"first_name":"Aliou","last_name":"Ly","member_type":"alumni","charter_version":"1"}', now(), now(), now()),
    (w, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fil-w@test.invalid',
     '{"first_name":"Wouri","last_name":"Wane","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (com, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fil-com@test.invalid',
     '{"first_name":"Coumba","last_name":"Cissé","member_type":"etudiant","charter_version":"1"}', now(), now(), now());
  update public.profiles set status = 'actif', validated_at = now() where id in (s, al, com);
  update public.profiles set member_type = 'alumni' where id = al;

  select holder_id into old_com from public.bureau_roles where code = 'communication';
  update public.bureau_roles set holder_id = com, assigned_at = now() where code = 'communication';
  select holder_id into g from public.bureau_roles where code = 'admin_numerique';
  if g is null then
    g := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fil-g@test.invalid',
      '{"first_name":"Garant","last_name":"Test","member_type":"etudiant","charter_version":"1"}', now(), now(), now());
    update public.profiles set status = 'actif', validated_at = now() where id = g;
    update public.bureau_roles set holder_id = g, assigned_at = now() where code = 'admin_numerique';
  end if;

  -- 1. Un compte en attente ne publie pas et ne voit rien ---------------------
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_post(gen_random_uuid(), 'Bonjour');
    failures := failures || text 'en attente : a pu publier';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 2. Publier : texte, limites, photos --------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_post(p1, '  Premier message  ');
  select body = 'Premier message' into ok from public.posts where id = p1;
  if not coalesce(ok, false) then failures := failures || text 'publier : texte non enregistré ou non nettoyé'; end if;
  begin
    perform public.create_post(gen_random_uuid(), '   ');
    failures := failures || text 'publier : publication vide acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_post(gen_random_uuid(), repeat('a', 2001));
    failures := failures || text 'publier : plus de 2 000 caractères acceptés';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_post(p1, 'Encore');
    failures := failures || text 'publier : identifiant réutilisé';
  exception when invalid_parameter_value then null;
  end;
  -- Une photo qui n'a pas été déposée est refusée.
  begin
    perform public.create_post(p2, 'Photo', jsonb_build_array(jsonb_build_object('kind', 'photo', 'path', s::text || '/' || p2::text || '/0.jpg')));
    failures := failures || text 'photos : fichier absent accepté';
  exception when invalid_parameter_value then null;
  end;
  -- Dépôt dans son propre dossier : permis. Dans celui d'un autre, ou dans « bureau » : refusé.
  insert into storage.objects (bucket_id, name, metadata) values ('publications', s::text || '/' || p2::text || '/0.jpg', '{"size": 1000}');
  begin
    insert into storage.objects (bucket_id, name) values ('publications', al::text || '/' || p2::text || '/0.jpg');
    failures := failures || text 'photos : dépôt dans le dossier d''un autre';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('publications', 'bureau/' || p2::text || '/0.jpg');
    failures := failures || text 'photos : un membre dépose dans « bureau »';
  exception when insufficient_privilege then null;
  end;
  perform public.create_post(p2, '', jsonb_build_array(jsonb_build_object('kind', 'photo', 'path', s::text || '/' || p2::text || '/0.jpg', 'width', 1600, 'height', 1200)));
  select count(*) into n from public.post_media where post_id = p2;
  if n <> 1 then failures := failures || text 'photos : photo non rattachée'; end if;
  begin
    perform public.create_post(gen_random_uuid(), 'Cinq', (select jsonb_agg(jsonb_build_object('kind', 'photo', 'path', 'x' || i)) from generate_series(1, 5) i));
    failures := failures || text 'photos : cinq photos acceptées';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_post(gen_random_uuid(), 'Mélange', '[{"kind":"video","path":"a"},{"kind":"photo","path":"b"}]');
    failures := failures || text 'photos : vidéo avec photo acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.posts (id, author_id, body) values (gen_random_uuid(), s, 'Sans passer par la fonction');
    failures := failures || text 'publier : écriture directe dans la table';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 3. Qui voit quoi -----------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts where id in (p1, p2);
  if n <> 2 then failures := failures || format('lecture : un membre voit %s publications sur 2', n); end if;
  select count(*) into n from public.post_media where post_id = p2;
  if n <> 1 then failures := failures || text 'lecture : photo invisible'; end if;
  begin
    perform public.update_post(p1, 'Piraté');
    failures := failures || text 'modifier : publication d''un autre modifiée';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_post(p1);
    failures := failures || text 'supprimer : publication d''un autre supprimée';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts where id in (p1, p2);
  if n <> 0 then failures := failures || text 'lecture : un compte en attente voit le fil'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.update_post(p1, 'Premier message, corrigé');
  select edited_at is not null into ok from public.posts where id = p1;
  if not coalesce(ok, false) then failures := failures || text 'modifier : « modifiée » absent'; end if;
  reset role;

  -- 4. Réactions : une par personne, remplaçable, retirable -----------------
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.react(p1, null, 'jaime');
  perform public.react(p1, null, 'jadore');
  select count(*), max(kind::text) into n, t from public.reactions where post_id = p1 and member_id = al;
  if n <> 1 or t <> 'jadore' then failures := failures || text 'réactions : pas remplacée'; end if;
  perform public.react(p1, null, null);
  select count(*) into n from public.reactions where post_id = p1 and member_id = al;
  if n <> 0 then failures := failures || text 'réactions : pas retirée'; end if;
  perform public.react(p1, null, 'soutien');
  begin
    insert into public.reactions (member_id, post_id, kind) values (al, p2, 'rire');
    failures := failures || text 'réactions : écriture directe dans la table';
  exception when insufficient_privilege then null;
  end;

  -- 5. Commentaires : réponses sur un seul niveau ---------------------------
  c1 := public.add_comment(p1, 'Bravo !');
  begin
    perform public.add_comment(p1, '   ');
    failures := failures || text 'commentaires : vide accepté';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  c2 := public.add_comment(p1, 'Merci', c1);
  c3 := public.add_comment(p1, 'Réponse à la réponse', c2);
  select parent_id = c1 into ok from public.comments where id = c3;
  if not coalesce(ok, false) then failures := failures || text 'commentaires : plus d''un niveau de réponse'; end if;
  begin
    perform public.add_comment(p2, 'Mauvais endroit', c1);
    failures := failures || text 'commentaires : réponse rattachée à une autre publication';
  exception when invalid_parameter_value then null;
  end;
  perform public.react(null, c1, 'rire');

  -- 6. Signalements : anonymes, une fois par personne ------------------------
  begin
    perform public.report_content(p1, null, 'spam');
    failures := failures || text 'signaler : sa propre publication';
  exception when invalid_parameter_value then null;
  end;
  if not public.report_content(null, c1, 'irrespect') then failures := failures || text 'signaler : commentaire refusé'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.report_content(p1, null, 'spam') then failures := failures || text 'signaler : premier signalement refusé'; end if;
  if public.report_content(p1, null, 'fausse_info') then failures := failures || text 'signaler : deux fois le même contenu'; end if;
  begin
    perform public.moderation_queue();
    failures := failures || text 'modération : un membre lit la file';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.moderate(p1, null, 'masquer', 'spam');
    failures := failures || text 'modération : un membre masque';
  exception when insufficient_privilege then null;
  end;
  if public.moderation_pending() is not null then failures := failures || text 'modération : un membre voit le compteur'; end if;
  reset role;

  -- 7. Modération par la Communication ---------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.reports where post_id = p1 or comment_id = c1;
  if n <> 0 then failures := failures || text 'signaler : le bureau voit qui a signalé'; end if;
  select count(*) into n from public.moderation_queue() q where q.post_id = p1 and q.reports = 1;
  if n <> 1 then failures := failures || text 'modération : publication signalée absente de la file'; end if;
  if public.moderation_pending() < 2 then failures := failures || text 'modération : compteur faux'; end if;

  perform public.moderate(p1, null, 'garder');
  select count(*) into n from public.moderation_queue() q where q.post_id = p1;
  if n <> 0 then failures := failures || text 'modération : « garder » laisse le signalement'; end if;
  begin
    perform public.moderate(p1, null, 'garder');
    failures := failures || text 'modération : garder deux fois';
  exception when invalid_parameter_value then null;
  end;

  -- Le motif vient du signalement ; l'auteur reçoit un avertissement.
  perform public.moderate(null, c1, 'masquer_avertir');
  select hidden_reason = 'Propos irrespectueux' into ok from public.comments where id = c1;
  if not coalesce(ok, false) then failures := failures || text 'modération : motif du commentaire masqué'; end if;

  -- Masquer sans signalement : il faut un motif.
  begin
    perform public.moderate(p2, null, 'masquer');
    failures := failures || text 'modération : masqué sans motif';
  exception when invalid_parameter_value then null;
  end;
  perform public.moderate(p2, null, 'masquer', 'choquant');
  select count(*) into n from public.posts where id = p2;
  if n <> 1 then failures := failures || text 'modération : le bureau ne voit plus ce qu''il a masqué'; end if;
  select count(*) into n from public.moderation_decisions where post_id in (p1, p2) or comment_id = c1;
  if n <> 3 then failures := failures || format('modération : %s décisions au lieu de 3', n); end if;
  reset role;

  select count(*) into n from public.member_warnings where member_id = al;
  if n <> 1 then failures := failures || text 'modération : avertissement absent'; end if;

  -- Ce qui est masqué : l'auteur le voit, les autres non.
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts where id = p2;
  if n <> 0 then failures := failures || text 'masqué : un autre membre voit la publication'; end if;
  select count(*) into n from public.comments where id = c1;
  if n <> 1 then failures := failures || text 'masqué : l''auteur ne voit plus son commentaire'; end if;
  begin
    perform public.react(p2, null, 'jaime');
    failures := failures || text 'masqué : réaction sur une publication masquée';
  exception when no_data_found then null;
  end;
  select count(*) into n from public.moderation_decisions;
  if n <> 0 then failures := failures || text 'modération : un membre lit les décisions'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts where id = p2 and hidden_reason = 'Contenu choquant';
  if n <> 1 then failures := failures || text 'masqué : l''auteur ne voit pas sa publication et le motif'; end if;
  select count(*) into n from public.comments where id = c1;
  if n <> 0 then failures := failures || text 'masqué : un autre membre voit le commentaire'; end if;
  begin
    perform public.add_comment(p1, 'Réponse', c1);
    failures := failures || text 'masqué : réponse à un commentaire masqué';
  exception when no_data_found then null;
  end;
  reset role;

  -- 8. Annonces -----------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.publish_announcement(gen_random_uuid(), 'Pirate', '', 'tous', false);
    failures := failures || text 'annonces : un membre publie';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', com, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_announcement(a1, 'Réunion des étudiants', 'Jeudi 18 h', 'etudiants', true);
  select pinned_until > now() + interval '6 days' into ok from public.posts where id = a1;
  if not coalesce(ok, false) then failures := failures || text 'annonces : pas épinglée 7 jours'; end if;
  perform public.publish_announcement(a2, 'Assemblée générale', '', 'tous', true, now() + interval '1 day');
  begin
    perform public.publish_announcement(gen_random_uuid(), 'Trop tôt', '', 'tous', false, now() + interval '1 minute');
    failures := failures || text 'annonces : programmée dans moins de 5 minutes';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.publish_announcement(gen_random_uuid(), '  ', '', 'tous', false);
    failures := failures || text 'annonces : sans titre';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into n from public.announcements_overview() o where o.id in (a1, a2);
  if n <> 2 then failures := failures || text 'annonces : liste du bureau incomplète'; end if;
  select written_by_name into t from public.announcement_authors where post_id = a1;
  if t is distinct from 'Coumba Cissé' then failures := failures || text 'annonces : le bureau ne voit pas qui a écrit'; end if;
  insert into storage.objects (bucket_id, name) values ('publications', 'bureau/' || a3::text || '/0.jpg');
  begin
    perform public.moderate(a1, null, 'masquer', 'spam');
    failures := failures || text 'annonces : masquée depuis la modération';
  exception when invalid_parameter_value then null;
  end;
  if public.storage_used() < 1000 then failures := failures || text 'stockage : total faux'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts where id in (a1, a2);
  if n <> 1 then failures := failures || format('annonces : un étudiant voit %s annonces au lieu de 1', n); end if;
  select count(*) into n from public.announcement_authors where post_id = a1;
  if n <> 0 then failures := failures || text 'annonces : un membre voit qui a écrit'; end if;
  begin
    perform public.report_content(a1, null, 'spam');
    failures := failures || text 'annonces : signalée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.storage_used();
    failures := failures || text 'stockage : un membre lit le total';
  exception when insufficient_privilege then null;
  end;
  -- « Vue par » : seulement les annonces parues, seulement par leur public.
  perform public.mark_seen(array[a1, a2, p1]);
  begin
    select count(*) into n from public.post_views;
    failures := failures || text 'vues : un membre lit qui a vu quoi';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts where id in (a1, a2);
  if n <> 0 then failures := failures || text 'annonces : un alumni voit une annonce pour les étudiants'; end if;
  perform public.mark_seen(array[a1]);
  reset role;

  select count(*) into n from public.post_views where post_id in (a1, a2, p1);
  if n <> 1 then failures := failures || format('vues : %s vues comptées au lieu de 1', n); end if;

  -- L'admin numérique signe « Le bureau ».
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_announcement(a3, 'Mise à jour de l''appli', '', 'tous', false, null,
    jsonb_build_array(jsonb_build_object('kind', 'photo', 'path', 'bureau/' || a3::text || '/0.jpg')));
  select written_by is null and written_by_name = 'Le bureau' into ok from public.announcement_authors where post_id = a3;
  if not coalesce(ok, false) then failures := failures || text 'annonces : l''admin numérique n''est pas signé « Le bureau »'; end if;
  perform public.unpin_announcement(a1);
  paths := public.delete_announcement(a3);
  if paths is distinct from array['bureau/' || a3::text || '/0.jpg'] then failures := failures || text 'annonces : photos à effacer non rendues'; end if;
  reset role;

  -- 9. Supprimer sa publication emporte commentaires et réactions --------------
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  paths := public.delete_post(p2);
  if paths is distinct from array[s::text || '/' || p2::text || '/0.jpg'] then failures := failures || text 'supprimer : photos à effacer non rendues'; end if;
  perform public.delete_post(p1);
  reset role;
  select count(*) into n from public.comments where post_id = p1;
  if n <> 0 then failures := failures || text 'supprimer : commentaires restés'; end if;
  select count(*) into n from public.reactions where post_id = p1 or comment_id in (c1, c2, c3);
  if n <> 0 then failures := failures || text 'supprimer : réactions restées'; end if;
  select count(*) into n from public.moderation_decisions where excerpt like 'Premier message%';
  if n <> 1 then failures := failures || text 'supprimer : la décision de modération a disparu'; end if;

  -- 10. Un membre suspendu ne voit plus le fil --------------------------------
  update public.profiles set status = 'suspendu', suspended_at = now() where id = al;
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.posts;
  if n <> 0 then failures := failures || text 'suspendu : voit encore le fil'; end if;
  begin
    perform public.create_post(gen_random_uuid(), 'Encore là');
    failures := failures || text 'suspendu : publie encore';
  exception when insufficient_privilege then null;
  end;
  reset role;

  update public.bureau_roles set holder_id = old_com where code = 'communication';

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
