-- Lot 5 : personne ne valide ni ne refuse sa propre candidature. Un autre
-- membre du bureau s'en charge. Et « 1 votant » au singulier.

create or replace function public.decide_candidacy(p_id uuid, p_valid boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.candidacies;
  a public.assemblies;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_label text;
begin
  perform private.require('elections');
  select * into c from public.candidacies where id = p_id for update;
  if not found then
    raise exception 'Cette candidature n''existe plus.' using errcode = 'P0002';
  end if;
  select * into a from public.assemblies where id = c.assembly_id;
  if a.status <> 'convoquee' then
    raise exception 'Le vote est ouvert : les candidatures ne changent plus.' using errcode = '22023';
  end if;
  if c.member_id = auth.uid() then
    raise exception 'Un autre membre du bureau vérifie ta candidature.' using errcode = '42501';
  end if;
  if c.status = 'retiree' then
    raise exception 'Cette candidature a été retirée.' using errcode = '22023';
  end if;
  select label into v_label from public.bureau_roles where code = c.role_code;

  if p_valid then
    if c.status = 'validee' then
      return;
    end if;
    if private.vote_right(c.member_id) not in ('actif', 'suspendu') then
      raise exception 'Ce membre n''est plus un membre actif étudiant (article 15).' using errcode = '22023';
    end if;
    if exists (select 1 from public.candidacies o where o.assembly_id = c.assembly_id and o.member_id = c.member_id
               and o.id <> c.id and o.status in ('deposee', 'validee')) then
      raise exception 'Ce membre a déjà une autre candidature en cours.' using errcode = '22023';
    end if;
    update public.candidacies
    set status = 'validee', decided_at = now(), decided_by_name = private.signature(auth.uid()), reason = null
    where id = p_id;
    perform private.assembly_message(c.member_id,
      'Ta candidature au poste ' || v_label || ' est validée. Elle apparaît dans l''onglet Votes.',
      jsonb_build_object('type', 'candidature_validee', 'assembly', a.id, 'role', c.role_code, 'label', v_label));
    perform private.log_activity('elections', 'validation_candidature',
      'a validé la candidature de ' || private.full_name(c.member_id) || ' au poste ' || v_label,
      c.member_id, jsonb_build_object('ag', a.id, 'poste', c.role_code));
  else
    if v_reason is null or char_length(v_reason) > 300 then
      raise exception 'Donne le motif du refus (300 caractères au plus) : il est envoyé au membre.' using errcode = '22023';
    end if;
    update public.candidacies
    set status = 'refusee', decided_at = now(), decided_by_name = private.signature(auth.uid()), reason = v_reason
    where id = p_id;
    perform private.assembly_message(c.member_id,
      'Ta candidature au poste ' || v_label || ' n''a pas été retenue. Motif : ' || v_reason,
      jsonb_build_object('type', 'candidature_refusee', 'assembly', a.id, 'role', c.role_code, 'label', v_label, 'reason', v_reason));
    perform private.log_activity('elections', 'refus_candidature',
      'a refusé la candidature de ' || private.full_name(c.member_id) || ' au poste ' || v_label,
      c.member_id, jsonb_build_object('ag', a.id, 'poste', c.role_code, 'motif', v_reason));
  end if;
end;
$$;

-- « 1 votant », pas « 1 votants », dans le journal et l'annonce des résultats.

create function private.votants(p integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p || case when p > 1 then ' votants' else ' votant' end;
$$;

create or replace function private.close_ballot(p_ballot uuid, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.ballots;
  a public.assemblies;
  q record;
  v_electors integer;
  v_voters integer;
  v_quorum integer;
  v_by text := coalesce(private.signature(p_actor), 'AEGB, automatique');
begin
  select * into b from public.ballots where id = p_ballot for update;
  if not found or b.status <> 'ouvert' then
    raise exception 'Ce vote est déjà fermé.' using errcode = '22023';
  end if;
  select * into a from public.assemblies where id = b.assembly_id for update;
  select count(*) into v_electors from public.ballot_electors where ballot_id = p_ballot;
  select count(*) into v_voters from public.ballot_voters where ballot_id = p_ballot;
  v_quorum := private.quorum_needed(a.kind, a.convocation, b.round, v_electors);

  if v_voters < v_quorum then
    delete from private.ballot_counts c using public.ballot_questions bq
    where bq.id = c.question_id and bq.ballot_id = p_ballot;
    update public.ballots
    set status = 'detruit', closed_at = private.clock(), closed_by_name = v_by, electors = v_electors, voters = v_voters
    where id = p_ballot;
    update public.assemblies set status = 'carence' where id = a.id;
    -- Les candidatures validées restent valables pour la seconde AG.
    perform private.log_activity('elections', 'fermeture_vote',
      'a fermé le vote' || case when p_actor is null then ' à l''heure prévue' else '' end
        || ' : quorum non atteint (' || private.votants(v_voters) || ' sur ' || v_electors || ', il en fallait ' || v_quorum
        || '). Bulletins détruits sans être lus.',
      null, jsonb_build_object('ag', a.id, 'tour', b.round, 'inscrits', v_electors, 'votants', v_voters, 'quorum', v_quorum), p_actor);
    return 'carence';
  end if;

  for q in select id from public.ballot_questions where ballot_id = p_ballot order by position loop
    perform private.count_question(q.id, a.kind);
  end loop;
  delete from private.ballot_counts c using public.ballot_questions bq
  where bq.id = c.question_id and bq.ballot_id = p_ballot;
  update public.ballots
  set status = 'ferme', closed_at = private.clock(), closed_by_name = v_by, electors = v_electors, voters = v_voters
  where id = p_ballot;
  update public.assemblies set status = 'depouillement' where id = a.id;
  perform private.log_activity('elections', 'fermeture_vote',
    'a fermé le vote' || case when b.round = 2 then ' du second tour' else '' end
      || case when p_actor is null then ' à l''heure prévue' else '' end
      || ' : ' || private.votants(v_voters) || ' sur ' || v_electors || ' inscrits',
    null, jsonb_build_object('ag', a.id, 'tour', b.round, 'inscrits', v_electors, 'votants', v_voters), p_actor);
  return 'ferme';
end;
$$;

create or replace function public.publish_results(p_assembly uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  b1 public.ballots;
  r record;
  v_body text;
  v_res text := '';
  v_seats text := '';
  v_post uuid;
  v_year integer;
  v_effective date;
begin
  perform private.require('elections');
  select * into a from public.assemblies where id = p_assembly for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if a.status <> 'depouillement' then
    raise exception 'Il n''y a pas de résultats à publier.' using errcode = '22023';
  end if;
  select * into b1 from public.ballots where assembly_id = p_assembly and round = 1;
  if exists (select 1 from public.ballot_questions q join public.ballot_results x on x.question_id = q.id
             where q.ballot_id = b1.id and x.outcome = 'egalite')
     and not exists (select 1 from public.ballots where assembly_id = p_assembly and round = 2) then
    raise exception 'Ouvre d''abord le second tour pour départager l''égalité.' using errcode = '22023';
  end if;

  v_year := extract(year from coalesce(a.mandate_start, (a.held_at at time zone 'Europe/Paris')::date))::integer;
  v_effective := coalesce(a.mandate_start, private.today());

  for r in
    select q.title, x.outcome, x.expressed, coalesce((x.counts ->> 'pour')::integer, 0) as pour
    from public.ballot_questions q join public.ballot_results x on x.question_id = q.id
    where q.ballot_id = b1.id and q.kind = 'resolution'
    order by q.position
  loop
    v_res := v_res || chr(10) || '• ' || r.title || ' : '
      || case when r.outcome = 'adoptee' then 'adoptée' else 'rejetée' end
      || ' (' || private.percent(r.pour, r.expressed) || ' de pour)';
  end loop;

  for r in
    select s.*, br.sort_order from private.seat_outcomes(p_assembly) s
    join public.bureau_roles br on br.code = s.role_code
    order by br.sort_order
  loop
    v_seats := v_seats || chr(10) || '• ' || r.label || ' : '
      || case
           when r.outcome = 'pourvu' then
             (select private.full_name(c.member_id) from public.candidacies c where c.id = r.winner)
             || ' (' || private.percent(r.votes, r.expressed) || case when r.single then ' de pour' else '' end
             || case when r.round = 2 then ', au second tour' else '' end || ')'
           when r.outcome = 'egalite' then 'égalité au second tour, le règlement intérieur tranche'
           else 'poste vacant' end;
    if r.outcome = 'pourvu' then
      insert into public.role_handovers (assembly_id, role_code, member_id, effective_on)
      select p_assembly, r.role_code, c.member_id, v_effective from public.candidacies c where c.id = r.winner;
    end if;
  end loop;
  -- Les postes sans candidat validé.
  for r in
    select br.label from public.assembly_items it
    cross join lateral unnest(it.seats) s (code)
    join public.bureau_roles br on br.code = s.code
    where it.assembly_id = p_assembly and it.kind = 'election'
      and not exists (select 1 from public.ballot_questions q join public.ballots b on b.id = q.ballot_id
                      where b.assembly_id = p_assembly and q.role_code = s.code)
    order by br.sort_order
  loop
    v_seats := v_seats || chr(10) || '• ' || r.label || ' : aucun candidat, poste vacant';
  end loop;

  v_body := 'Le vote de ' || private.assembly_label(a) || ' est clos : ' || private.votants(b1.voters) || ' sur ' || b1.electors
    || ' inscrits (' || private.percent(b1.voters, b1.electors) || ').'
    || case when v_res <> '' then chr(10) || chr(10) || 'Résolutions' || v_res else '' end
    || case when v_seats <> '' then chr(10) || chr(10) || 'Bureau ' || v_year || v_seats else '' end
    || chr(10) || chr(10) || 'Le détail et le procès-verbal sont dans l''onglet Votes.'
    || case when v_seats <> '' then
         case when a.mandate_start is null then ' Les nouveaux titulaires prennent leur poste dès la passation.'
              else ' Les nouveaux titulaires prennent leur poste le ' || private.french_date(a.mandate_start) || '.' end
       else '' end;
  v_post := private.assembly_post('Résultats de l''AG du ' || private.day_label(a.held_at), v_body, auth.uid());

  update public.assemblies
  set status = 'publiee', published_at = now(), published_by_name = private.signature(auth.uid()), results_post_id = v_post
  where id = p_assembly;
  perform private.log_activity('elections', 'publication',
    'a publié les résultats de ' || private.assembly_label(a), null, jsonb_build_object('ag', a.id, 'annonce', v_post));
  return v_post;
end;
$$;

revoke all on function private.votants(integer) from public, anon, authenticated;
