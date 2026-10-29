-- Test des cotisations et du journal financier (lot 4) : mois dus, paiement
-- par carte confirmé par HelloAsso seulement, encaissement par le bureau,
-- quittances, journal en ajout seul, contre-passation, admin numérique
-- discret, relance du 1er du mois, réglages, vider les essais.
--
-- Comme les autres tests, le script crée des comptes fictifs, joue des
-- scénarios en se faisant passer pour chacun, puis lève une erreur qui annule
-- tout : la base reste intacte. Le message final commence par « TESTS OK » ou
-- par « ÉCHEC ».
--
-- À lancer dans l'éditeur SQL de Supabase (ou avec psql) en tant que postgres.
-- La date du jour est fixée par le réglage aegb.today, que seule une
-- connexion d'administration peut utiliser.

do $$
declare
  a uuid := gen_random_uuid();   -- Awa, étudiante validée en septembre
  b uuid := gen_random_uuid();   -- Bakary, étudiant validé en novembre
  c uuid := gen_random_uuid();   -- Coumba, alumni (ne paie pas)
  d uuid := gen_random_uuid();   -- Djibril, étudiant validé avant le début officiel
  w uuid := gen_random_uuid();   -- Wouri, inscrit en attente
  tr uuid := gen_random_uuid();  -- poste Trésorerie
  sec uuid := gen_random_uuid(); -- poste Secrétariat général (pas d'accès à l'argent)
  g uuid;                        -- admin numérique (titulaire actuel, ou fictif)
  old_tr uuid;
  old_sec uuid;
  n0 integer;                    -- dernier numéro du journal avant le test
  r0 integer;                    -- dernière quittance de l'année avant le test
  pay uuid;
  pay2 uuid;
  pay3 uuid;
  e bigint;
  num integer;
  n integer;
  t text;
  j jsonb;
  failures text[] := '{}';
begin
  -- Comptes fictifs ---------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-a@test.invalid',
     '{"first_name":"Awa","last_name":"Diallo","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-b@test.invalid',
     '{"first_name":"Bakary","last_name":"Bah","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-c@test.invalid',
     '{"first_name":"Coumba","last_name":"Camara","member_type":"alumni","charter_version":"1"}', now(), now(), now()),
    (d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-d@test.invalid',
     '{"first_name":"Djibril","last_name":"Diaby","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (w, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-w@test.invalid',
     '{"first_name":"Wouri","last_name":"Wane","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (tr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-tr@test.invalid',
     '{"first_name":"Lansana","last_name":"Touré","member_type":"etudiant","charter_version":"1"}', now(), now(), now()),
    (sec, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-sec@test.invalid',
     '{"first_name":"Sira","last_name":"Sow","member_type":"etudiant","charter_version":"1"}', now(), now(), now());

  update public.profiles set status = 'actif', validated_at = '2026-09-10 12:00+02' where id in (a, c, tr, sec);
  update public.profiles set status = 'actif', validated_at = '2026-11-03 12:00+01' where id = b;
  update public.profiles set status = 'actif', validated_at = '2026-07-01 12:00+02' where id = d;
  update public.profiles set member_type = 'alumni' where id = c;

  select holder_id into old_tr from public.bureau_roles where code = 'tresorerie';
  update public.bureau_roles set holder_id = tr, assigned_at = now() where code = 'tresorerie';
  select holder_id into old_sec from public.bureau_roles where code = 'secretariat';
  update public.bureau_roles set holder_id = sec, assigned_at = now() where code = 'secretariat';
  select holder_id into g from public.bureau_roles where code = 'admin_numerique';
  if g is null then
    g := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cot-g@test.invalid',
      '{"first_name":"Garant","last_name":"Test","member_type":"etudiant","charter_version":"1"}', now(), now(), now());
    update public.profiles set status = 'actif', validated_at = now() where id = g;
    update public.bureau_roles set holder_id = g, assigned_at = now() where code = 'admin_numerique';
  end if;

  -- Les réglages proposés pour les essais
  update public.dues_settings
  set monthly_cents = 500, start_month = '2026-09-01', paying_types = '{etudiant}', reminders = true;
  select last into n0 from private.ledger_counter;
  select coalesce((select last from private.receipt_counters where year = 2026), 0) into r0;

  -- 1. Libellés ----------------------------------------------------------------
  t := private.months_label(array['2026-09-01', '2026-10-01']::date[]);
  if t <> 'Septembre et octobre 2026' then failures := failures || ('libellé : ' || t); end if;
  t := private.months_label(array['2026-12-01', '2026-10-01', '2026-11-01']::date[]);
  if t <> 'Octobre à décembre 2026' then failures := failures || ('libellé : ' || t); end if;
  t := private.months_label(array(select generate_series('2026-09-01'::date, '2027-03-01', interval '1 month')::date));
  if t <> 'Septembre 2026 à mars 2027' then failures := failures || ('libellé : ' || t); end if;
  t := private.months_label(array['2026-12-01', '2027-01-01']::date[]);
  if t <> 'Décembre 2026 et janvier 2027' then failures := failures || ('libellé : ' || t); end if;
  t := private.months_label(array['2026-09-01', '2026-11-01', '2027-02-01']::date[]);
  if t <> 'Septembre, novembre 2026 et février 2027' then failures := failures || ('libellé : ' || t); end if;
  t := private.months_label(array['2026-11-01']::date[]);
  if t <> 'Novembre 2026' then failures := failures || ('libellé : ' || t); end if;
  if private.euros(1550) <> '15,50 €' or private.euros(500) <> '5 €' or private.euros(1005) <> '10,05 €' then
    failures := failures || text 'libellé : montant en euros';
  end if;
  if private.french_date('2027-03-01') <> '1er mars 2027' or private.french_date('2026-11-30') <> '30 novembre 2026' then
    failures := failures || text 'libellé : date en français';
  end if;

  -- 2. Où en est chacun, le 15 novembre 2026 ---------------------------------------
  perform set_config('aegb.today', '2026-11-15', true);
  j := private.dues_state(a);
  if j ->> 'status' is distinct from 'retard'
     or j -> 'late' is distinct from '["2026-09-01", "2026-10-01"]'::jsonb
     or (j ->> 'late_cents')::integer is distinct from 1000
     or not (j ->> 'vote_suspended')::boolean
     or (j ->> 'radiation_possible')::boolean
     or j ->> 'first_unpaid' is distinct from '2026-09-01'
     or j ->> 'paid_until' is not null
     or jsonb_array_length(j -> 'months') <> 12
     or j -> 'months' -> 0 ->> 'state' is distinct from 'retard'
     or j -> 'months' -> 2 ->> 'state' is distinct from 'en_cours'
     or j -> 'months' -> 3 ->> 'state' is distinct from 'a_venir' then
    failures := failures || ('état : Awa en retard mal calculée : ' || j::text);
  end if;
  j := private.dues_state(b);
  if j ->> 'status' is distinct from 'a_jour' or j ->> 'dues_from' is distinct from '2026-11-01'
     or j -> 'months' -> 1 ->> 'state' is distinct from 'pas_du' or (j ->> 'vote_suspended')::boolean then
    failures := failures || ('état : arrivée en novembre mal calculée : ' || j::text);
  end if;
  j := private.dues_state(c);
  if j ->> 'status' is distinct from 'pas_due' or (j ->> 'paying')::boolean or (j ->> 'votes')::boolean or (j ->> 'vote_suspended')::boolean then
    failures := failures || text 'état : un alumni doit payer ou vote';
  end if;
  perform set_config('aegb.today', '2026-08-15', true);
  j := private.dues_state(d);
  if j ->> 'status' is distinct from 'pas_encore' or j ->> 'horizon' is distinct from '2027-08-01'
     or jsonb_array_length(j -> 'months') <> 24 then
    failures := failures || ('état : avant le début officiel : ' || j::text);
  end if;
  perform set_config('aegb.today', '2026-11-15', true);

  -- 3. Un inscrit en attente ne voit rien ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.my_dues();
    failures := failures || text 'en attente : voit une cotisation';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.dues_settings;
  if n <> 0 then failures := failures || text 'en attente : lit les réglages'; end if;
  reset role;

  -- 4. Paiement par carte : rien ne compte avant la confirmation ---------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.my_dues();
  if j ->> 'status' is distinct from 'retard' then failures := failures || text 'membre : ne voit pas son retard'; end if;
  select count(*) into n from public.dues_settings;
  if n <> 1 then failures := failures || text 'membre : ne lit pas les réglages'; end if;
  j := public.start_card_payment('2026-11-20');
  pay := (j ->> 'id')::uuid;
  if j -> 'months' is distinct from '["2026-09-01", "2026-10-01", "2026-11-01"]'::jsonb
     or (j ->> 'amount_cents')::integer is distinct from 1500
     or j ->> 'label' is distinct from 'Septembre à novembre 2026' then
    failures := failures || ('carte : mauvais mois ou montant : ' || j::text);
  end if;
  begin
    perform public.start_card_payment('2027-09-01');
    failures := failures || text 'carte : mois trop lointain accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.start_card_payment('2026-08-01');
    failures := failures || text 'carte : mois d''avant le début accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.helloasso_confirm(pay, 'faux', null);
    failures := failures || text 'carte : un membre confirme lui-même son paiement';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_payment(a, '2026-11-01', 'especes');
    failures := failures || text 'carte : un membre encaisse des espèces';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.dues_coverage (member_id, month, payment_id, amount_cents) values (a, '2026-12-01', pay, 500);
    failures := failures || text 'carte : un membre écrit ses mois payés';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.dues_payments set status = 'confirme' where id = pay;
    failures := failures || text 'carte : un membre confirme son paiement par la table';
  exception when insufficient_privilege then null;
  end;
  if public.my_dues() ->> 'status' is distinct from 'retard' then
    failures := failures || text 'carte : compté avant la confirmation';
  end if;
  select count(*) into n from public.ledger_entries;
  if n <> 0 then failures := failures || text 'membre : lit le journal financier'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.start_card_payment('2026-11-01');
    failures := failures || text 'carte : un alumni paie';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into n from public.dues_payments;
  if n <> 0 then failures := failures || text 'membre : voit les paiements des autres'; end if;
  reset role;

  -- 5. HelloAsso confirme ----------------------------------------------------------
  set local role service_role;
  j := public.helloasso_payment(pay);
  if j ->> 'email' is distinct from 'cot-a@test.invalid' or (j ->> 'amount_cents')::integer is distinct from 1500
     or j ->> 'status' is distinct from 'en_attente' then
    failures := failures || ('helloasso : paiement mal décrit : ' || j::text);
  end if;
  perform public.helloasso_attach(pay, 987654321);
  j := public.helloasso_confirm(pay, 'HA-1', '2026-11-15');
  if j ->> 'receipt' is distinct from ('2026-' || lpad((r0 + 1)::text, 4, '0'))
     or (j ->> 'number')::integer is distinct from n0 + 1 then
    failures := failures || ('helloasso : quittance ou numéro : ' || j::text);
  end if;
  j := public.helloasso_confirm(pay, 'HA-1', '2026-11-15');
  if not coalesce((j ->> 'already')::boolean, false) then failures := failures || text 'helloasso : confirmé deux fois'; end if;
  reset role;

  select count(*) into n from public.ledger_entries
  where payment_id = pay and number = n0 + 1 and amount_cents = 1500 and method = 'helloasso'
    and label = 'Cotisation septembre à novembre 2026' and created_by is null and created_by_name = 'Automatique';
  if n <> 1 then failures := failures || text 'helloasso : écriture absente, doublée ou mal remplie'; end if;
  select count(*) into n from public.dues_coverage where payment_id = pay;
  if n <> 3 then failures := failures || text 'helloasso : mois payés'; end if;
  select count(*) into n from public.dues_receipts where payment_id = pay and amount_cents = 1500 and reference = 'HA-1';
  if n <> 1 then failures := failures || text 'helloasso : quittance'; end if;
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = a and m.kind = 'cotisation' and m.as_aegb and m.meta ->> 'type' = 'recu'
    and m.body = 'Septembre à novembre 2026, 15 €, par carte. Tu es à jour jusqu''au 30 novembre 2026.';
  if n <> 1 then
    select m.body into t from public.messages m join public.conversations x on x.id = m.conversation_id
    where x.kind = 'aegb' and x.member_id = a and m.kind = 'cotisation' limit 1;
    failures := failures || ('helloasso : message de quittance : ' || coalesce(t, '(rien)'));
  end if;
  j := private.dues_state(a);
  if j ->> 'status' is distinct from 'a_jour' or j ->> 'paid_until' is distinct from '2026-11-30' then
    failures := failures || ('helloasso : Awa pas à jour : ' || j::text);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dues_receipts;
  if n <> 1 then failures := failures || text 'membre : ne voit pas sa quittance'; end if;
  reset role;

  -- 6. La trésorerie encaisse des espèces ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.record_payment(b, '2027-01-01', 'especes', '2026-11-14', 'Remis en main propre');
  pay2 := (j ->> 'payment')::uuid;
  if (j ->> 'amount_cents')::integer is distinct from 1500 or (j ->> 'number')::integer is distinct from n0 + 2 then
    failures := failures || ('espèces : montant ou numéro : ' || j::text);
  end if;
  begin
    perform public.record_payment(b, '2027-02-01', 'carte');
    failures := failures || text 'espèces : carte saisie à la main';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_payment(b, '2027-02-01', 'cheque', '2026-12-01');
    failures := failures || text 'espèces : date dans le futur acceptée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_payment(b, '2026-12-01', 'cheque');
    failures := failures || text 'espèces : mois déjà payés encaissés deux fois';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into n from public.dues_matrix() where member_id in (a, b, c, d);
  if n <> 4 then failures := failures || ('trésorerie : matrice (' || n || ')'); end if;
  select count(*) into n from public.dues_payments where member_id = a;
  if n <> 1 then failures := failures || text 'trésorerie : ne voit pas les paiements'; end if;
  select count(*) into n from public.ledger_entries where number in (n0 + 1, n0 + 2);
  if n <> 2 then failures := failures || text 'trésorerie : ne lit pas le journal'; end if;
  if public.member_dues(b) ->> 'paid_until' is distinct from '2027-01-31' then
    failures := failures || text 'trésorerie : fiche de Bakary';
  end if;
  reset role;

  select count(*) into n from public.ledger_entries
  where payment_id = pay2 and method = 'especes' and created_by = tr and created_by_name = 'Lansana Touré'
    and label = 'Cotisation novembre 2026 à janvier 2027' and note = 'Remis en main propre' and entry_date = '2026-11-14';
  if n <> 1 then failures := failures || text 'espèces : écriture mal remplie'; end if;
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = b and m.kind = 'cotisation' and m.meta ->> 'type' = 'recu'
    and m.body = 'Novembre 2026 à janvier 2027, 15 €, en espèces. Tu es à jour jusqu''au 31 janvier 2027.';
  if n <> 1 then failures := failures || text 'espèces : message de quittance'; end if;
  select count(*) into n from public.activity_log
  where category = 'argent' and action = 'encaissement' and actor_id = tr and subject_id = b
    and summary = 'a encaissé 15 € en espèces (novembre 2026 à janvier 2027)';
  if n <> 1 then failures := failures || text 'espèces : absent du journal d''activité'; end if;

  -- Le secrétariat n'a pas accès à l'argent
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.record_payment(b, '2027-02-01', 'especes');
    failures := failures || text 'secrétariat : encaisse';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.dues_matrix();
    failures := failures || text 'secrétariat : voit la matrice';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.member_dues(a);
    failures := failures || text 'secrétariat : voit la cotisation d''un membre';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.ledger_entries;
  if n <> 0 then failures := failures || text 'secrétariat : lit le journal financier'; end if;
  select count(*) into n from public.dues_payments where member_id <> sec;
  if n <> 0 then failures := failures || text 'secrétariat : voit les paiements'; end if;
  reset role;

  -- 7. Écritures libres, journal en ajout seul ----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  num := public.add_ledger_entry('2026-11-10', '  Location de salle  ', 'evenements', -8000, 'virement');
  if num <> n0 + 3 then failures := failures || ('écriture : numéro ' || num); end if;
  begin
    perform public.add_ledger_entry('2026-11-10', 'Cotisation de Awa', 'cotisation', 500, 'especes');
    failures := failures || text 'écriture : cotisation saisie à la main';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.add_ledger_entry('2026-11-10', 'Don', 'dons', 0, 'especes');
    failures := failures || text 'écriture : montant nul accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.add_ledger_entry('2026-11-10', 'Don', 'dons', 1000, 'helloasso');
    failures := failures || text 'écriture : HelloAsso saisi à la main';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.ledger_entries (number, entry_date, label, category, amount_cents, method, created_by_name)
    values (999, '2026-11-10', 'Fausse', 'autre', 100, 'especes', 'X');
    failures := failures || text 'écriture : insérée directement';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ledger_entries set label = 'Modifiée' where number = num;
    failures := failures || text 'écriture : modifiée par la trésorerie';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select count(*) into n from public.ledger_entries
  where number = num and label = 'Location de salle' and amount_cents = -8000 and category = 'evenements';
  if n <> 1 then failures := failures || text 'écriture : mal enregistrée'; end if;
  begin
    update public.ledger_entries set label = 'Modifiée' where number = num;
    failures := failures || text 'journal : modifié par l''administration';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ledger_entries where number = num;
    failures := failures || text 'journal : effacé par l''administration';
  exception when insufficient_privilege then null;
  end;

  -- 8. Contre-passation ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into e from public.ledger_entries where payment_id = pay2;
  num := public.reverse_ledger_entry(e, 'montant', 'Erreur de saisie');
  if num <> n0 + 4 then failures := failures || ('correction : numéro ' || num); end if;
  begin
    perform public.reverse_ledger_entry(e, 'montant');
    failures := failures || text 'correction : passée deux fois';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.reverse_ledger_entry((select id from public.ledger_entries where reverses = e), 'autre');
    failures := failures || text 'correction : une correction corrigée';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.reverse_ledger_entry((select id from public.ledger_entries where number = n0 + 3), 'bof');
    failures := failures || text 'correction : motif inconnu accepté';
  exception when invalid_parameter_value then null;
  end;
  num := public.reverse_ledger_entry((select id from public.ledger_entries where number = n0 + 3), 'autre', null, false);
  reset role;

  select count(*) into n from public.ledger_entries
  where reverses = e and amount_cents = -1500 and category = 'correction' and method = 'especes' and member_id = b
    and label = 'Contre-passation, montant erroné' and reason = 'montant' and note = 'Erreur de saisie'
    and entry_date = '2026-11-15';
  if n <> 1 then failures := failures || text 'correction : écriture inverse mal remplie'; end if;
  select count(*) into n from public.ledger_entries where number = num and amount_cents = 8000;
  if n <> 1 then failures := failures || text 'correction : dépense mal corrigée'; end if;
  select count(*) into n from public.dues_payments where id = pay2 and status = 'annule' and cancelled_at is not null;
  if n <> 1 then failures := failures || text 'correction : paiement pas annulé'; end if;
  select count(*) into n from public.dues_coverage where payment_id = pay2;
  if n <> 0 then failures := failures || text 'correction : mois toujours payés'; end if;
  select count(*) into n from public.dues_receipts where payment_id = pay2 and cancelled_at is not null;
  if n <> 1 then failures := failures || text 'correction : quittance pas annulée'; end if;
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = b and m.kind = 'cotisation' and m.meta ->> 'type' = 'annule'
    and m.body = 'Ton paiement « Novembre 2026 à janvier 2027 » (15 €) a été annulé : montant erroné. Ces mois sont de nouveau à payer.';
  if n <> 1 then failures := failures || text 'correction : message au membre'; end if;
  if private.dues_state(b) ->> 'first_unpaid' is distinct from '2026-11-01' then
    failures := failures || text 'correction : novembre pas redevenu dû';
  end if;
  select count(*) into n from public.activity_log
  where category = 'argent' and action = 'correction' and actor_id = tr and subject_id = b;
  if n <> 1 then failures := failures || text 'correction : absente du journal d''activité'; end if;

  -- 9. Deux paiements pour le même mois : trop-perçu noté -----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  pay3 := (public.start_card_payment('2026-12-01') ->> 'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.record_payment(a, '2026-12-01', 'virement', null, null, false);
  reset role;
  set local role service_role;
  perform public.helloasso_confirm(pay3, 'HA-2', null);
  reset role;
  select count(*) into n from public.ledger_entries where payment_id = pay3 and note = 'Trop-perçu : 1 mois était déjà payé.';
  if n <> 1 then failures := failures || text 'trop-perçu : non noté'; end if;
  select count(*) into n from public.dues_coverage where member_id = a and month = '2026-12-01' and payment_id <> pay3;
  if n <> 1 then failures := failures || text 'trop-perçu : mois payé deux fois'; end if;

  -- 10. L'admin numérique encaisse, signé « Le bureau » ------------------------------
  t := private.full_name(g);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.record_payment(d, '2026-10-01', 'cheque');
  select id into e from public.ledger_entries where number = (j ->> 'number')::integer;
  select count(*) into n from public.discreet_ledger_authors(array[e]) where actor_name = t;
  if n <> 1 then failures := failures || text 'discret : vrai auteur introuvable par l''admin'; end if;
  reset role;
  select count(*) into n from public.ledger_entries where id = e and created_by is null and created_by_name = 'Le bureau';
  if n <> 1 then failures := failures || text 'discret : écriture pas signée « Le bureau »'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.discreet_ledger_authors(array[e]);
    failures := failures || text 'discret : la trésorerie voit le vrai auteur';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 11. Relance du 1er décembre ----------------------------------------------------------
  perform set_config('aegb.today', '2026-12-01', true);
  perform private.send_dues_reminders();
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = b and m.kind = 'cotisation' and m.meta ->> 'type' = 'relance'
    and m.body = 'Bonjour Bakary, ta cotisation de novembre 2026 n''est pas encore réglée, soit 5 €.'
      || ' Tant qu''elle ne l''est pas, ton droit de vote et ton éligibilité au bureau sont suspendus (article 32 des statuts).';
  if n <> 1 then
    select m.body into t from public.messages m join public.conversations x on x.id = m.conversation_id
    where x.kind = 'aegb' and x.member_id = b and m.kind = 'cotisation' and m.meta ->> 'type' = 'relance' limit 1;
    failures := failures || ('relance : message à Bakary : ' || coalesce(t, '(rien)'));
  end if;
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id in (a, c) and m.kind = 'cotisation' and m.meta ->> 'type' = 'relance';
  if n <> 0 then failures := failures || text 'relance : envoyée à un membre à jour ou qui ne paie pas'; end if;
  perform private.send_dues_reminders();
  select count(*) into n from public.messages m join public.conversations x on x.id = m.conversation_id
  where x.kind = 'aegb' and x.member_id = b and m.kind = 'cotisation' and m.meta ->> 'type' = 'relance';
  if n <> 1 then failures := failures || text 'relance : envoyée deux fois le même mois'; end if;
  -- Article 32 : radiation possible après trois mois de retard et un rappel resté sans effet.
  perform set_config('aegb.today', '2027-01-15', true);
  if (private.dues_state(b) ->> 'radiation_possible')::boolean then
    failures := failures || text 'radiation : possible dès deux mois de retard';
  end if;
  perform set_config('aegb.today', '2027-02-15', true);
  j := private.dues_state(b);
  if not (j ->> 'radiation_possible')::boolean or jsonb_array_length(j -> 'late') <> 3 then
    failures := failures || ('radiation : pas possible après trois mois et un rappel : ' || j::text);
  end if;
  if (private.dues_state(a) ->> 'radiation_possible')::boolean then
    failures := failures || text 'radiation : possible sans rappel';
  end if;
  update public.dues_settings set reminders = false;
  perform set_config('aegb.today', '2027-01-01', true);
  if private.send_dues_reminders() <> 0 then failures := failures || text 'relance : envoyée alors qu''elle est coupée'; end if;
  update public.dues_settings set reminders = true;
  perform set_config('aegb.today', '2026-11-15', true);

  -- 12. Réglages ------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', sec, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_dues_settings(1000, '2026-09-01', '{etudiant}', true);
    failures := failures || text 'réglages : changés par le secrétariat';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_dues_settings(1000, '2026-09-15', '{etudiant}', true);
    failures := failures || text 'réglages : début en milieu de mois accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_dues_settings(50, '2026-09-01', '{etudiant}', true);
    failures := failures || text 'réglages : montant trop petit accepté';
  exception when invalid_parameter_value then null;
  end;
  perform public.save_dues_settings(1000, '2026-09-01', '{etudiant}', true, '  12 rue de Siam, Brest ', 'W291000000');
  reset role;
  select count(*) into n from public.dues_settings
  where monthly_cents = 1000 and org_address = '12 rue de Siam, Brest' and updated_by_name = 'Lansana Touré';
  if n <> 1 then failures := failures || text 'réglages : mal enregistrés'; end if;
  j := private.dues_state(a);
  if (j ->> 'monthly_cents')::integer <> 1000 or (j -> 'months' -> 0 ->> 'amount_cents')::integer <> 500 then
    failures := failures || text 'réglages : le nouveau prix change les mois déjà payés';
  end if;
  select count(*) into n from public.activity_log
  where category = 'argent' and action = 'reglages_cotisation' and actor_id = tr
    and summary = 'a changé les réglages de la cotisation (10 € par mois)';
  if n <> 1 then failures := failures || text 'réglages : absents du journal d''activité'; end if;

  -- 13. En juillet, on peut payer l'année suivante ----------------------------------------
  perform set_config('aegb.today', '2027-07-10', true);
  j := private.dues_state(a);
  if j ->> 'horizon' is distinct from '2028-08-01' or jsonb_array_length(j -> 'months') <> 24 then
    failures := failures || ('juillet : année suivante absente : ' || j::text);
  end if;
  perform set_config('aegb.today', '2026-11-15', true);

  -- 14. Bouton « Payer ma cotisation » dans la bienvenue ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_welcome('Bienvenue {Prénom} !', array['charte', 'cotisation'], true);
  reset role;
  select count(*) into n from public.aegb_settings where welcome_actions @> array['cotisation'];
  if n <> 1 then failures := failures || text 'bienvenue : bouton cotisation refusé'; end if;

  -- 15. Vider les essais, puis verrouiller ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.clear_finances();
    failures := failures || text 'vider : possible pour la trésorerie';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.clear_finances();
  reset role;
  select count(*) into n from public.ledger_entries;
  if n <> 0 then failures := failures || text 'vider : journal financier pas vide'; end if;
  select count(*) into n from public.dues_payments;
  if n <> 0 then failures := failures || text 'vider : paiements restants'; end if;
  select count(*) into n from public.messages where kind = 'cotisation';
  if n <> 0 then failures := failures || text 'vider : cartes de cotisation restantes'; end if;
  if (select last from private.ledger_counter) <> 0 then failures := failures || text 'vider : numérotation pas remise à zéro'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  num := public.add_ledger_entry('2026-11-01', 'Solde de départ', 'ouverture', 25000, 'virement');
  reset role;
  if num <> 1 then failures := failures || ('vider : premier numéro après remise à zéro ' || num); end if;
  insert into private.journal_lock (only_row, locked_at) values (true, now())
  on conflict (only_row) do update set locked_at = now();
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.clear_finances();
    failures := failures || text 'vider : possible après le verrouillage';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  perform set_config('aegb.clear_finances', 'on', true);
  begin
    delete from public.ledger_entries where number = 1;
    failures := failures || text 'verrou : journal effacé après le lancement';
  exception when insufficient_privilege then null;
  end;
  perform set_config('aegb.clear_finances', 'off', true);

  update public.bureau_roles set holder_id = old_tr where code = 'tresorerie';
  update public.bureau_roles set holder_id = old_sec where code = 'secretariat';

  if cardinality(failures) = 0 then
    raise exception 'TESTS OK : toutes les vérifications passent (base remise dans son état initial)';
  else
    raise exception 'ÉCHEC : %', array_to_string(failures, ' | ');
  end if;
end;
$$;
