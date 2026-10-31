-- Lot 5 : l'assemblée générale et les élections (plan et maquettes validés
-- par Cronos le 30 octobre 2026). Tout suit les articles 10 à 16, 21, 25 et
-- 32 des statuts.
--
-- Le bureau prépare l'AG, envoie la convocation, vérifie les candidatures,
-- ouvre le vote, le ferme, voit les résultats puis les publie. Chaque membre
-- qui a le droit de vote dépose un bulletin, une seule fois.
--
-- Le secret du vote : la base garde d'un côté la liste de qui a voté
-- (l'émargement), de l'autre seulement les totaux de chaque choix. Aucun
-- bulletin n'est enregistré, ni avec un nom ni sans. À chaque vote, tous les
-- totaux du scrutin sont réécrits ensemble, pour que rien ne montre lesquels
-- ont bougé. Pendant le vote, les totaux restent dans le schéma privé, que
-- l'appli ne peut pas lire. À la fermeture, ils deviennent les résultats ;
-- si le quorum n'est pas atteint, ils sont effacés sans être lus.
--
-- Comme aux lots précédents, l'appli ne fait que lire, et seulement à travers
-- les fonctions ci-dessous : les tables du lot ne sont pas lisibles
-- directement.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- brouillon : rien n'est parti. convoquee : la convocation est partie, les
-- candidatures sont ouvertes. vote : un tour de scrutin est ouvert.
-- depouillement : le vote est fermé, seul le bureau voit les résultats.
-- publiee : les résultats sont dans le fil. carence : le quorum n'a pas été
-- atteint, les bulletins ont été détruits. annulee : le bureau a annulé l'AG.
create table public.assemblies (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'ordinaire' check (kind in ('ordinaire', 'extraordinaire')),
  -- 2 : seconde AG, convoquée après une première sans quorum (article 13).
  convocation smallint not null default 1 check (convocation in (1, 2)),
  first_id uuid references public.assemblies (id) on delete set null,
  status text not null default 'brouillon'
    check (status in ('brouillon', 'convoquee', 'vote', 'depouillement', 'publiee', 'carence', 'annulee')),
  held_at timestamptz not null,
  place text not null check (char_length(place) between 1 and 120),
  vote_opens_at timestamptz not null,
  vote_closes_at timestamptz not null,
  candidacy_until timestamptz,
  -- Prise de poste des élus : le 1er janvier (article 16). Vide pour une
  -- élection partielle (article 25) : tout de suite après la passation.
  mandate_start date,
  convened_at timestamptz,
  convened_by_name text,
  convened_count integer,
  convocation_post_id uuid references public.posts (id) on delete set null,
  published_at timestamptz,
  published_by_name text,
  results_post_id uuid references public.posts (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint assemblies_vote_window check (vote_closes_at > vote_opens_at),
  constraint assemblies_second check (convocation = 2 or first_id is null)
);

-- Une seule AG en cours à la fois, du brouillon au dépouillement.
create unique index assemblies_one_running on public.assemblies ((true))
  where status in ('brouillon', 'convoquee', 'vote', 'depouillement');
create index assemblies_held_idx on public.assemblies (held_at desc);

-- L'ordre du jour. Seuls ses points peuvent être votés (article 12).
-- resolution : pour, contre ou abstention. election : les postes de seats.
-- discussion : sans vote (questions diverses).
create table public.assembly_items (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies (id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  kind text not null check (kind in ('resolution', 'election', 'discussion')),
  title text not null check (char_length(title) between 1 and 120),
  detail text check (char_length(detail) <= 300),
  seats text[] not null default '{}',
  unique (assembly_id, position),
  constraint assembly_items_seats check ((kind = 'election') = (cardinality(seats) > 0))
);

create unique index assembly_items_one_election on public.assembly_items (assembly_id) where kind = 'election';

-- deposee : à vérifier par le bureau. validee : sur le bulletin.
-- refusee : avec un motif, envoyé au membre. retiree : par le membre, ou
-- par l'appli si sa cotisation n'est pas à jour à l'ouverture du vote.
create table public.candidacies (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies (id) on delete cascade,
  role_code text not null references public.bureau_roles (code),
  member_id uuid not null references public.profiles (id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 500),
  status text not null default 'deposee' check (status in ('deposee', 'validee', 'refusee', 'retiree')),
  -- Saisie par le bureau à partir d'une candidature reçue sur papier.
  paper boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_name text,
  reason text check (char_length(reason) <= 300),
  withdrawn_at timestamptz
);

-- Un seul poste par candidat et par élection.
create unique index candidacies_one_per_member on public.candidacies (assembly_id, member_id)
  where status in ('deposee', 'validee');
create index candidacies_assembly_idx on public.candidacies (assembly_id, role_code);
create index candidacies_member_idx on public.candidacies (member_id);

-- Un tour de scrutin. Le premier porte sur tout l'ordre du jour ; le second,
-- ouvert seulement en cas d'égalité, sur les postes à départager.
-- electors et voters sont figés à la fermeture.
create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies (id) on delete cascade,
  round smallint not null check (round in (1, 2)),
  status text not null default 'ouvert' check (status in ('ouvert', 'ferme', 'detruit')),
  opened_at timestamptz not null,
  opened_by_name text not null,
  closes_at timestamptz not null,
  closed_at timestamptz,
  closed_by_name text,
  quorum_reached_at timestamptz,
  electors integer,
  voters integer,
  unique (assembly_id, round)
);

-- Les questions du bulletin, figées à l'ouverture : chaque résolution, puis
-- chaque poste qui a au moins un candidat validé.
create table public.ballot_questions (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  position smallint not null,
  kind text not null check (kind in ('resolution', 'poste')),
  item_id uuid references public.assembly_items (id) on delete cascade,
  role_code text references public.bureau_roles (code),
  title text not null,
  detail text,
  -- Les candidatures, dans l'ordre du bulletin (par nom).
  candidates uuid[] not null default '{}',
  unique (ballot_id, position),
  constraint ballot_questions_shape check (
    (kind = 'resolution' and item_id is not null and role_code is null and cardinality(candidates) = 0)
    or (kind = 'poste' and role_code is not null and cardinality(candidates) > 0)
  )
);

-- Les totaux pendant le vote. Personne ne les lit avant la fermeture.
-- choice : pour, contre, abstention (résolution) ; pour, contre, blanc
-- (candidat seul) ; l'identifiant d'une candidature ou blanc (plusieurs).
create table private.ballot_counts (
  question_id uuid not null references public.ballot_questions (id) on delete cascade,
  choice text not null,
  votes integer not null default 0 check (votes >= 0),
  primary key (question_id, choice)
);

revoke all on private.ballot_counts from public, anon, authenticated;

-- Les résultats, écrits à la fermeture d'un tour où le quorum est atteint.
-- expressed : les suffrages exprimés, sans les blancs ni les abstentions
-- (article 13).
create table public.ballot_results (
  question_id uuid primary key references public.ballot_questions (id) on delete cascade,
  counts jsonb not null,
  expressed integer not null,
  outcome text not null check (outcome in ('adoptee', 'rejetee', 'pourvu', 'vacant', 'egalite')),
  winner uuid references public.candidacies (id) on delete set null,
  tied uuid[] not null default '{}'
);

-- La liste électorale, arrêtée à l'ouverture du vote : les étudiants actifs
-- et à jour. Un étudiant qui règle son retard pendant le vote y entre en
-- votant (article 32).
create table public.ballot_electors (
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (ballot_id, member_id)
);

-- L'émargement : qui a voté et à quelle heure, jamais pour qui.
create table public.ballot_voters (
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (ballot_id, member_id)
);

create table public.ballot_reminders (
  id bigint generated always as identity primary key,
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  sent_at timestamptz not null default now(),
  recipients integer not null,
  sent_by_name text not null
);

-- La passation : préparée à la publication des résultats, confirmée par le
-- poste qui attribue les postes, appliquée le jour de la prise de poste.
create table public.role_handovers (
  id bigint generated always as identity primary key,
  assembly_id uuid not null references public.assemblies (id) on delete cascade,
  role_code text not null references public.bureau_roles (code),
  member_id uuid not null references public.profiles (id) on delete cascade,
  effective_on date not null,
  confirmed_at timestamptz,
  confirmed_by_name text,
  applied_at timestamptz,
  unique (assembly_id, role_code)
);

-- Les messages du compte AEGB pour l'AG : convocation, ouverture du vote,
-- rappel, second tour, candidature validée ou refusée, annulation.
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('message', 'bienvenue', 'arrivee', 'systeme', 'cotisation', 'assemblee'));

-- ---------------------------------------------------------------------------
-- Heures, dates et libellés
-- ---------------------------------------------------------------------------

-- L'heure qu'il est. Les essais de la base peuvent fixer une autre heure
-- (réglage aegb.now), seulement depuis une connexion d'administration.
create function private.clock()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when session_user = 'postgres' and coalesce(current_setting('aegb.now', true), '') <> ''
      then current_setting('aegb.now', true)::timestamptz
    else now()
  end;
$$;

-- « 14 h », « 23 h 59 ».
create function private.hour_label(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select extract(hour from l)::integer || ' h'
         || case when extract(minute from l) = 0 then '' else ' ' || to_char(l, 'MI') end
  from (select p_at at time zone 'Europe/Paris' as l) s;
$$;

-- « samedi 12 décembre 2026 ».
create function private.day_label(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from l)::integer + 1]
         || ' ' || private.french_date(l::date)
  from (select p_at at time zone 'Europe/Paris' as l) s;
$$;

-- « l'AG ordinaire du samedi 12 décembre 2026 ».
create function private.assembly_label(a public.assemblies)
returns text
language sql
stable
set search_path = ''
as $$
  select case when a.convocation = 2 then 'la seconde AG ' else 'l''AG ' end
         || a.kind || ' du ' || private.day_label(a.held_at);
$$;

-- « 97 % ». Arrondi à l'unité, comme dans l'appli.
create function private.percent(p_part integer, p_total integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_total > 0 then round(100.0 * p_part / p_total)::integer else 0 end || ' %';
$$;

-- ---------------------------------------------------------------------------
-- Droits de vote et quorum
-- ---------------------------------------------------------------------------

-- actif : vote et peut se présenter. suspendu : étudiant en retard de
-- cotisation (article 32). consultatif : alumni, sympathisant ou membre
-- d'honneur (article 7). aucun : compte en attente ou suspendu.
create function private.vote_right(p_member uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_member;
  if not found or p.status <> 'actif' then
    return 'aucun';
  end if;
  if p.member_type <> 'etudiant' then
    return 'consultatif';
  end if;
  if coalesce((private.dues_state(p_member) ->> 'vote_suspended')::boolean, false) then
    return 'suspendu';
  end if;
  return 'actif';
end;
$$;

-- Le nombre de votants qu'il faut (articles 13 et 14) : un tiers de la
-- liste pour une AG ordinaire, la moitié pour une AG extraordinaire. Une
-- seconde AG ordinaire vote sans quorum, une seconde AG extraordinaire avec
-- un tiers. Le second tour n'en demande pas : le quorum est déjà atteint.
create function private.quorum_needed(p_kind text, p_convocation smallint, p_round smallint, p_electors integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_round = 2 then 0
    when p_convocation = 1 and p_kind = 'ordinaire' then (p_electors + 2) / 3
    when p_convocation = 1 then (p_electors + 1) / 2
    when p_kind = 'extraordinaire' then (p_electors + 2) / 3
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Ce que voient le membre et le bureau
-- ---------------------------------------------------------------------------

create function private.person_json(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_path', p.avatar_path,
    'formation', p.formation, 'school', p.school, 'member_type', p.member_type
  )
  from public.profiles p
  where p.id = p_member;
$$;

create function private.candidacy_json(c public.candidacies, p_staff boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'role', c.role_code,
    'member', private.person_json(c.member_id),
    'statement', c.statement,
    'status', c.status,
    'created_at', c.created_at,
    'reason', case when p_staff or c.member_id = auth.uid() then c.reason end,
    'outgoing', exists (select 1 from public.bureau_roles r where r.holder_id = c.member_id)
  ) || case when p_staff then jsonb_build_object(
    'paper', c.paper,
    'decided_at', c.decided_at,
    'decided_by_name', c.decided_by_name,
    'withdrawn_at', c.withdrawn_at,
    'right', private.vote_right(c.member_id)
  ) else '{}'::jsonb end;
$$;

create function private.ballot_json(b public.ballots, a public.assemblies, p_staff boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_electors integer;
  v_voters integer;
  v_results boolean := (p_staff and a.status in ('depouillement', 'publiee')) or a.status = 'publiee';
  v_questions jsonb;
  v_reminders jsonb;
begin
  v_electors := coalesce(b.electors, (select count(*)::integer from public.ballot_electors e where e.ballot_id = b.id));
  v_voters := coalesce(b.voters, (select count(*)::integer from public.ballot_voters v where v.ballot_id = b.id));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'position', q.position, 'kind', q.kind, 'item_id', q.item_id, 'role', q.role_code,
           'title', q.title, 'detail', q.detail, 'candidates', to_jsonb(q.candidates),
           'result', case when v_results and r.question_id is not null then jsonb_build_object(
             'counts', r.counts, 'expressed', r.expressed, 'outcome', r.outcome,
             'winner', r.winner, 'tied', to_jsonb(r.tied)) end
         ) order by q.position), '[]'::jsonb)
  into v_questions
  from public.ballot_questions q
  left join public.ballot_results r on r.question_id = q.id
  where q.ballot_id = b.id;

  if p_staff then
    select coalesce(jsonb_agg(jsonb_build_object('sent_at', m.sent_at, 'recipients', m.recipients, 'sent_by_name', m.sent_by_name)
             order by m.sent_at), '[]'::jsonb)
    into v_reminders
    from public.ballot_reminders m
    where m.ballot_id = b.id;
  end if;

  return jsonb_build_object(
    'id', b.id,
    'round', b.round,
    'status', b.status,
    'opened_at', b.opened_at,
    'opened_by_name', b.opened_by_name,
    'closes_at', b.closes_at,
    'closed_at', b.closed_at,
    'closed_by_name', b.closed_by_name,
    'quorum_reached_at', b.quorum_reached_at,
    'electors', v_electors,
    'voters', v_voters,
    'quorum', private.quorum_needed(a.kind, a.convocation, b.round, v_electors),
    'voted_at', (select v.voted_at from public.ballot_voters v where v.ballot_id = b.id and v.member_id = auth.uid()),
    'questions', v_questions,
    'reminders', v_reminders
  );
end;
$$;

create function private.assembly_json(p_id uuid, p_staff boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  f public.assemblies;
  fb public.ballots;
  v_me uuid := auth.uid();
  v_right text;
  v_items jsonb;
  v_seats jsonb;
  v_ballots jsonb;
  v_mine jsonb;
  v_first jsonb;
begin
  select * into a from public.assemblies where id = p_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'position', i.position, 'kind', i.kind, 'title', i.title, 'detail', i.detail, 'seats', to_jsonb(i.seats)
         ) order by i.position), '[]'::jsonb)
  into v_items
  from public.assembly_items i
  where i.assembly_id = p_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'role', r.code,
           'label', r.label,
           'candidates', coalesce((
             select jsonb_agg(private.candidacy_json(c, p_staff) order by p.last_name, p.first_name)
             from public.candidacies c
             join public.profiles p on p.id = c.member_id
             where c.assembly_id = p_id and c.role_code = r.code
               and (c.status = 'validee' or (p_staff and c.status in ('deposee', 'refusee')))
           ), '[]'::jsonb)
         ) order by r.sort_order), '[]'::jsonb)
  into v_seats
  from public.assembly_items i
  cross join lateral unnest(i.seats) s (code)
  join public.bureau_roles r on r.code = s.code
  where i.assembly_id = p_id and i.kind = 'election';

  select coalesce(jsonb_agg(private.ballot_json(b, a, p_staff) order by b.round), '[]'::jsonb)
  into v_ballots
  from public.ballots b
  where b.assembly_id = p_id;

  -- Ma candidature : la dernière que j'ai déposée pour cette AG.
  select private.candidacy_json(c, false) into v_mine
  from public.candidacies c
  where c.assembly_id = p_id and c.member_id = v_me
  order by c.created_at desc
  limit 1;

  v_right := private.vote_right(v_me);

  if a.first_id is not null then
    select * into f from public.assemblies where id = a.first_id;
    select * into fb from public.ballots where assembly_id = a.first_id and round = 1;
    v_first := jsonb_build_object(
      'id', f.id, 'held_at', f.held_at, 'status', f.status,
      'electors', fb.electors, 'voters', fb.voters,
      'quorum', case when fb.id is not null then private.quorum_needed(f.kind, f.convocation, 1::smallint, fb.electors) end
    );
  end if;

  return jsonb_build_object(
    'id', a.id,
    'kind', a.kind,
    'convocation', a.convocation,
    'status', a.status,
    'held_at', a.held_at,
    'place', a.place,
    'vote_opens_at', a.vote_opens_at,
    'vote_closes_at', a.vote_closes_at,
    'candidacy_until', a.candidacy_until,
    'mandate_start', a.mandate_start,
    'mandate_year', extract(year from coalesce(a.mandate_start, (a.held_at at time zone 'Europe/Paris')::date))::integer,
    'convened_at', a.convened_at,
    'convened_count', a.convened_count,
    'published_at', a.published_at,
    'cancelled_at', a.cancelled_at,
    'cancel_reason', a.cancel_reason,
    'now', private.clock(),
    'items', v_items,
    'seats', v_seats,
    'ballots', v_ballots,
    'first', v_first,
    'my', jsonb_build_object(
      'right', v_right,
      'late_cents', case when v_right = 'suspendu' then (private.dues_state(v_me) ->> 'late_cents')::integer end,
      'can_run', v_right = 'actif' and not private.is_guarantor(v_me),
      'candidacy', v_mine
    )
  );
end;
$$;

-- L'AG que voit un membre : la dernière convoquée, ou une AG précise.
-- Le brouillon et les AG annulées ne se voient pas.
create function public.assembly_view(p_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_member();
  select id into v_id
  from public.assemblies
  where status not in ('brouillon', 'annulee') and (p_id is null or id = p_id)
  order by held_at desc, created_at desc
  limit 1;
  if v_id is null then
    return null;
  end if;
  return private.assembly_json(v_id, false);
end;
$$;

-- L'AG que voit le bureau : celle en cours, sinon la dernière, avec les
-- candidatures à vérifier, la liste électorale, l'émargement et la passation.
create function public.assembly_admin(p_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  b public.ballots;
  j jsonb;
begin
  perform private.require('elections', 'lecture');
  if p_id is not null then
    select * into a from public.assemblies where id = p_id;
  else
    select * into a from public.assemblies
    order by (status in ('brouillon', 'convoquee', 'vote', 'depouillement')) desc, held_at desc, created_at desc
    limit 1;
  end if;

  j := jsonb_build_object(
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'convocation', h.convocation, 'status', h.status, 'held_at', h.held_at)
             order by h.held_at desc, h.created_at desc)
      from public.assemblies h
    ), '[]'::jsonb),
    'members', (select count(*) from public.profiles where status = 'actif'),
    -- La liste électorale qu'aurait le vote s'il s'ouvrait maintenant.
    'electorate', case when a.id is null or a.status in ('brouillon', 'convoquee') then (
                    select count(*) from public.profiles p
                    where p.status = 'actif' and p.member_type = 'etudiant' and private.vote_right(p.id) = 'actif') end,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label) order by r.sort_order)
      from public.bureau_roles r where not r.locked
    ), '[]'::jsonb)
  );
  if a.id is null then
    return jsonb_build_object('assembly', null) || j;
  end if;

  -- L'émargement du tour ouvert, ou du dernier tour.
  select * into b from public.ballots where assembly_id = a.id order by round desc limit 1;

  return j || jsonb_build_object(
    'assembly', private.assembly_json(a.id, true),
    'emargement', case when b.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(private.person_json(e.member_id) || jsonb_build_object('voted_at', v.voted_at)
             order by p.last_name, p.first_name)
      from public.ballot_electors e
      join public.profiles p on p.id = e.member_id
      left join public.ballot_voters v on v.ballot_id = e.ballot_id and v.member_id = e.member_id
      where e.ballot_id = b.id
    ), '[]'::jsonb) end,
    'handovers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'role', h.role_code, 'member', private.person_json(h.member_id), 'effective_on', h.effective_on,
               'confirmed_at', h.confirmed_at, 'confirmed_by_name', h.confirmed_by_name, 'applied_at', h.applied_at
             ) order by r.sort_order)
      from public.role_handovers h
      join public.bureau_roles r on r.code = h.role_code
      where h.assembly_id = a.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages du compte AEGB et annonces dans le fil
-- ---------------------------------------------------------------------------

create function private.assembly_message(p_member uuid, p_body text, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
begin
  if not exists (select 1 from public.profiles where id = p_member and status = 'actif') then
    return;
  end if;
  v_conv := private.ensure_aegb(p_member);
  insert into public.messages (conversation_id, kind, as_aegb, body, meta)
  values (v_conv, 'assemblee', true, p_body, coalesce(p_meta, '{}'::jsonb));
  update public.conversations set last_message_at = now(), changed_at = clock_timestamp() where id = v_conv;
end;
$$;

-- Une annonce officielle du bureau, épinglée une semaine.
create function private.assembly_post(p_title text, p_body text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.posts (id, author_id, official, title, body, audience, published_at, pinned_until)
  values (v_id, null, true, left(p_title, 120), left(p_body, 2000), 'tous', now(), now() + interval '7 days');
  insert into public.announcement_authors (post_id, written_by, written_by_name)
  values (v_id, case when private.is_guarantor(p_actor) then null else p_actor end,
          coalesce(private.signature(p_actor), 'AEGB, automatique'));
  return v_id;
end;
$$;

-- Ce que la convocation dit de l'AG, recopié dans chaque message.
create function private.assembly_summary(a public.assemblies)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'assembly', a.id,
    'kind', a.kind,
    'convocation', a.convocation,
    'held_at', a.held_at,
    'place', a.place,
    'vote_opens_at', a.vote_opens_at,
    'vote_closes_at', a.vote_closes_at,
    'candidacy_until', a.candidacy_until,
    'items', coalesce((select jsonb_agg(i.title order by i.position) from public.assembly_items i where i.assembly_id = a.id), '[]'::jsonb)
  );
$$;

-- Envoie la convocation (ou celle de la seconde AG) : un message à chaque
-- membre actif et une annonce dans le fil (article 12).
create function private.send_convocation(p_id uuid, p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  f public.assemblies;
  v_meta jsonb;
  v_when text;
  v_vote text;
  v_items text;
  v_body text;
  v_post uuid;
  m record;
  n integer := 0;
begin
  select * into a from public.assemblies where id = p_id;
  v_meta := private.assembly_summary(a);
  v_when := private.day_label(a.held_at) || ', ' || private.hour_label(a.held_at);
  v_vote := 'de ' || private.hour_label(a.vote_opens_at) || ' à ' || private.hour_label(a.vote_closes_at);
  select string_agg(i.position || '. ' || i.title, chr(10) order by i.position) into v_items
  from public.assembly_items i where i.assembly_id = p_id;
  if a.first_id is not null then
    select * into f from public.assemblies where id = a.first_id;
  end if;

  for m in select id, first_name from public.profiles where status = 'actif' loop
    v_body := case when a.convocation = 2
      then 'Bonjour ' || m.first_name || ', la première AG n''a pas réuni assez de votants. Le bureau te convoque à une seconde AG le '
        || v_when || ', à ' || a.place || '. Même ordre du jour ; '
        || case when a.kind = 'ordinaire' then 'cette fois, le vote compte quel que soit le nombre de votants.'
                else 'cette fois, il faut un tiers des inscrits.' end
      else 'Bonjour ' || m.first_name || ', le bureau te convoque à l''assemblée générale ' || a.kind || ' de l''AEGB, le '
        || v_when || ', à ' || a.place || '. Vote dans l''appli ' || v_vote || ', en salle ou à distance.'
      end;
    perform private.assembly_message(m.id, v_body,
      v_meta || jsonb_build_object('type', case when a.convocation = 2 then 'seconde' else 'convocation' end, 'first_name', m.first_name));
    n := n + 1;
  end loop;

  v_body := case when a.convocation = 2
    then 'La première assemblée générale, le ' || private.day_label(f.held_at) || ', n''a pas réuni assez de votants (article 13). '
      || 'Le bureau convoque tous les membres à une seconde AG, avec le même ordre du jour.'
    else 'Le bureau convoque tous les membres à l''assemblée générale ' || a.kind || ' de l''AEGB.' end
    || chr(10) || chr(10) || 'Quand : ' || v_when
    || chr(10) || 'Où : ' || a.place
    || chr(10) || 'Vote dans l''appli : ' || v_vote || ', en salle ou à distance'
    || chr(10) || chr(10) || 'Ordre du jour' || chr(10) || v_items
    || case when a.candidacy_until is not null
         then chr(10) || chr(10) || 'Candidatures au bureau jusqu''au ' || private.day_label(a.candidacy_until)
           || ', ' || private.hour_label(a.candidacy_until) || ', dans l''onglet Votes.'
         else '' end;
  v_post := private.assembly_post(
    case when a.convocation = 2 then 'Seconde assemblée générale' else 'Convocation à l''assemblée générale ' || a.kind end,
    v_body, p_actor);

  update public.assemblies
  set status = 'convoquee', convened_at = now(), convened_by_name = private.signature(p_actor),
      convened_count = n, convocation_post_id = v_post
  where id = p_id;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Préparer l'AG (bureau)
-- ---------------------------------------------------------------------------

-- Crée ou modifie le brouillon. p_items : l'ordre du jour, dans l'ordre,
-- [{"kind": "resolution", "title": "…", "detail": "…"},
--  {"kind": "election", "title": "…", "seats": ["presidence", …]}, …].
create function public.save_assembly(
  p_id uuid,
  p_kind text,
  p_held_at timestamptz,
  p_place text,
  p_vote_opens_at timestamptz,
  p_vote_closes_at timestamptz,
  p_candidacy_until timestamptz,
  p_mandate_start date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  v_id uuid := p_id;
  v_place text := btrim(coalesce(p_place, ''));
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_election boolean;
  v_day date := (p_held_at at time zone 'Europe/Paris')::date;
  it jsonb;
  i integer := 0;
  v_title text;
  v_seats text[];
begin
  perform private.require('elections');
  if p_id is not null then
    select * into a from public.assemblies where id = p_id for update;
    if not found then
      raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
    end if;
    if a.status <> 'brouillon' then
      raise exception 'La convocation est partie : l''AG ne se modifie plus.' using errcode = '22023';
    end if;
  elsif exists (select 1 from public.assemblies where status in ('brouillon', 'convoquee', 'vote', 'depouillement')) then
    raise exception 'Une AG est déjà en préparation ou en cours.' using errcode = '22023';
  end if;

  if coalesce(p_kind, '') not in ('ordinaire', 'extraordinaire') then
    raise exception 'Choisis une AG ordinaire ou extraordinaire.' using errcode = '22023';
  end if;
  if p_held_at is null or p_held_at <= private.clock() then
    raise exception 'Choisis une date à venir pour l''AG.' using errcode = '22023';
  end if;
  if v_place = '' or char_length(v_place) > 120 then
    raise exception 'Indique le lieu de l''AG (120 caractères au plus).' using errcode = '22023';
  end if;
  if p_vote_opens_at is null or p_vote_closes_at is null
     or (p_vote_opens_at at time zone 'Europe/Paris')::date <> v_day
     or (p_vote_closes_at at time zone 'Europe/Paris')::date <> v_day then
    raise exception 'Le vote dans l''appli a lieu le jour de l''AG.' using errcode = '22023';
  end if;
  if p_vote_closes_at < p_vote_opens_at + interval '15 minutes' then
    raise exception 'Laisse au moins un quart d''heure pour voter.' using errcode = '22023';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Ajoute au moins un point à l''ordre du jour.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 20 then
    raise exception 'Vingt points au plus à l''ordre du jour.' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_items) e where e ->> 'kind' in ('resolution', 'election')) then
    raise exception 'L''ordre du jour doit contenir au moins un point soumis au vote.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(v_items) e where e ->> 'kind' = 'election') > 1 then
    raise exception 'Une seule élection par AG : mets tous les postes dans le même point.' using errcode = '22023';
  end if;
  v_election := exists (select 1 from jsonb_array_elements(v_items) e where e ->> 'kind' = 'election');

  if v_election then
    if p_candidacy_until is null or p_candidacy_until <= private.clock() or p_candidacy_until >= p_vote_opens_at then
      raise exception 'Les candidatures se ferment avant l''ouverture du vote, à une date à venir.' using errcode = '22023';
    end if;
    if p_mandate_start is not null and p_mandate_start < v_day then
      raise exception 'La prise de poste ne peut pas précéder l''AG.' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.assemblies (kind, held_at, place, vote_opens_at, vote_closes_at, candidacy_until, mandate_start, created_by)
    values (p_kind, p_held_at, v_place, p_vote_opens_at, p_vote_closes_at,
            case when v_election then p_candidacy_until end, case when v_election then p_mandate_start end, auth.uid())
    returning id into v_id;
    perform private.log_activity('elections', 'preparation',
      'a commencé à préparer l''AG ' || p_kind || ' du ' || private.day_label(p_held_at), null, jsonb_build_object('ag', v_id));
  else
    update public.assemblies
    set kind = p_kind, held_at = p_held_at, place = v_place, vote_opens_at = p_vote_opens_at, vote_closes_at = p_vote_closes_at,
        candidacy_until = case when v_election then p_candidacy_until end,
        mandate_start = case when v_election then p_mandate_start end
    where id = v_id;
    delete from public.assembly_items where assembly_id = v_id;
  end if;

  for it in select value from jsonb_array_elements(v_items) loop
    i := i + 1;
    v_title := btrim(coalesce(it ->> 'title', ''));
    if v_title = '' or char_length(v_title) > 120 then
      raise exception 'Le point % de l''ordre du jour a besoin d''un titre (120 caractères au plus).', i using errcode = '22023';
    end if;
    if coalesce(it ->> 'kind', '') not in ('resolution', 'election', 'discussion') then
      raise exception 'Le point % de l''ordre du jour est mal décrit.', i using errcode = '22023';
    end if;
    v_seats := '{}';
    if it ->> 'kind' = 'election' then
      select coalesce(array_agg(distinct s), '{}') into v_seats
      from jsonb_array_elements_text(coalesce(it -> 'seats', '[]'::jsonb)) s;
      if cardinality(v_seats) = 0 then
        raise exception 'Choisis au moins un poste à élire.' using errcode = '22023';
      end if;
      if exists (select 1 from unnest(v_seats) s
                 where not exists (select 1 from public.bureau_roles r where r.code = s and not r.locked)) then
        raise exception 'Un des postes à élire n''existe pas.' using errcode = '22023';
      end if;
    end if;
    insert into public.assembly_items (assembly_id, position, kind, title, detail, seats)
    values (v_id, i, it ->> 'kind', v_title, nullif(left(btrim(coalesce(it ->> 'detail', '')), 300), ''), v_seats);
  end loop;

  return v_id;
end;
$$;

-- Le brouillon s'efface ; une AG convoquée s'annule, avec un message à
-- chaque membre. Plus rien ne s'annule une fois le vote ouvert.
create function public.cancel_assembly(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  m record;
begin
  perform private.require('elections');
  select * into a from public.assemblies where id = p_id for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if a.status = 'brouillon' then
    delete from public.assemblies where id = p_id;
    perform private.log_activity('elections', 'brouillon_efface',
      'a effacé le brouillon de l''AG du ' || private.day_label(a.held_at), null, jsonb_build_object('ag', p_id));
    return;
  end if;
  if a.status <> 'convoquee' then
    raise exception 'Le vote a commencé : l''AG ne s''annule plus.' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 300 then
    raise exception 'Donne le motif de l''annulation (300 caractères au plus) : il est envoyé aux membres.' using errcode = '22023';
  end if;

  update public.assemblies set status = 'annulee', cancelled_at = now(), cancel_reason = v_reason where id = p_id;
  update public.candidacies set status = 'retiree', withdrawn_at = now(), reason = 'AG annulée'
  where assembly_id = p_id and status in ('deposee', 'validee');
  for m in select id from public.profiles where status = 'actif' loop
    perform private.assembly_message(m.id,
      'L''assemblée générale du ' || private.day_label(a.held_at) || ' est annulée. ' || v_reason,
      private.assembly_summary(a) || jsonb_build_object('type', 'annulation', 'reason', v_reason));
  end loop;
  perform private.log_activity('elections', 'annulation',
    'a annulé ' || private.assembly_label(a), null, jsonb_build_object('ag', p_id, 'motif', v_reason));
end;
$$;

-- La convocation part au moins 15 jours avant l'AG (article 12). Plus tôt,
-- le bureau doit le confirmer (p_force).
create function public.send_convocation(p_id uuid, p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  n integer;
begin
  perform private.require('elections');
  select * into a from public.assemblies where id = p_id for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if a.status <> 'brouillon' then
    raise exception 'La convocation est déjà partie.' using errcode = '22023';
  end if;
  if a.vote_opens_at <= private.clock() or (a.candidacy_until is not null and a.candidacy_until <= private.clock()) then
    raise exception 'Les dates de l''AG sont passées : modifie-les avant d''envoyer.' using errcode = '22023';
  end if;
  if not coalesce(p_force, false) and a.held_at < private.clock() + interval '15 days' then
    raise exception 'La convocation doit partir au moins 15 jours avant l''AG (article 12).' using errcode = 'P0001',
      hint = 'trop_proche';
  end if;

  n := private.send_convocation(p_id, auth.uid());
  perform private.log_activity('elections', 'convocation',
    'a envoyé la convocation à ' || private.assembly_label(a) || ' (' || n || ' membres)', null,
    jsonb_build_object('ag', p_id, 'membres', n,
      'jours_avant', extract(day from a.held_at - private.clock())::integer));
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidatures (article 15)
-- ---------------------------------------------------------------------------

create function private.check_candidacy(a public.assemblies, p_member uuid, p_role text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_right text := private.vote_right(p_member);
begin
  if a.status <> 'convoquee' then
    raise exception 'Les candidatures ne sont pas ouvertes.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.assembly_items i where i.assembly_id = a.id and i.kind = 'election' and p_role = any (i.seats)) then
    raise exception 'Ce poste n''est pas à élire à cette AG.' using errcode = '22023';
  end if;
  if v_right = 'suspendu' then
    raise exception 'Il faut être à jour de sa cotisation pour se présenter (articles 15 et 32).' using errcode = '22023';
  end if;
  if v_right <> 'actif' then
    raise exception 'Seuls les membres actifs étudiants peuvent se présenter (article 15).' using errcode = '22023';
  end if;
  if private.is_guarantor(p_member) then
    raise exception 'Ton poste actuel ne permet pas de te présenter.' using errcode = '22023';
  end if;
  if exists (select 1 from public.candidacies c where c.assembly_id = a.id and c.member_id = p_member and c.status in ('deposee', 'validee')) then
    raise exception 'Une seule candidature par personne : retire d''abord celle qui est en cours.' using errcode = '22023';
  end if;
end;
$$;

create function public.submit_candidacy(p_assembly uuid, p_role text, p_statement text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  v_text text := btrim(coalesce(p_statement, ''));
  v_id uuid;
begin
  perform private.require_member();
  select * into a from public.assemblies where id = p_assembly for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if a.candidacy_until is null or a.candidacy_until <= private.clock() then
    raise exception 'Les candidatures sont fermées.' using errcode = '22023';
  end if;
  perform private.check_candidacy(a, auth.uid(), p_role);
  if v_text = '' or char_length(v_text) > 500 then
    raise exception 'Présente-toi en 500 caractères au plus.' using errcode = '22023';
  end if;
  insert into public.candidacies (assembly_id, role_code, member_id, statement)
  values (p_assembly, p_role, auth.uid(), v_text)
  returning id into v_id;
  perform private.log_activity('elections', 'candidature',
    'a déposé sa candidature au poste ' || (select label from public.bureau_roles where code = p_role),
    auth.uid(), jsonb_build_object('ag', p_assembly, 'poste', p_role));
  return v_id;
end;
$$;

-- Le membre retire sa candidature jusqu'à l'ouverture du vote.
create function public.withdraw_candidacy(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.candidacies;
begin
  perform private.require_member();
  select * into c from public.candidacies where id = p_id and member_id = auth.uid() for update;
  if not found then
    raise exception 'Cette candidature n''existe plus.' using errcode = 'P0002';
  end if;
  if c.status not in ('deposee', 'validee') then
    return;
  end if;
  if (select status from public.assemblies where id = c.assembly_id) <> 'convoquee' then
    raise exception 'Le vote est ouvert : la candidature ne se retire plus.' using errcode = '22023';
  end if;
  update public.candidacies set status = 'retiree', withdrawn_at = now(), reason = null where id = p_id;
  perform private.log_activity('elections', 'retrait_candidature',
    'a retiré sa candidature au poste ' || (select label from public.bureau_roles where code = c.role_code),
    auth.uid(), jsonb_build_object('ag', c.assembly_id, 'poste', c.role_code));
end;
$$;

-- Une candidature reçue sur papier, saisie par le bureau, jusqu'à
-- l'ouverture du vote. Elle reste à vérifier comme les autres.
create function public.add_paper_candidacy(p_assembly uuid, p_member uuid, p_role text, p_statement text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  v_text text := btrim(coalesce(p_statement, ''));
  v_id uuid;
begin
  perform private.require('elections');
  select * into a from public.assemblies where id = p_assembly for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  perform private.check_candidacy(a, p_member, p_role);
  if v_text = '' or char_length(v_text) > 500 then
    raise exception 'Recopie la présentation en 500 caractères au plus.' using errcode = '22023';
  end if;
  insert into public.candidacies (assembly_id, role_code, member_id, statement, paper)
  values (p_assembly, p_role, p_member, v_text, true)
  returning id into v_id;
  perform private.log_activity('elections', 'candidature_papier',
    'a saisi la candidature papier de ' || private.full_name(p_member) || ' au poste '
      || (select label from public.bureau_roles where code = p_role),
    p_member, jsonb_build_object('ag', p_assembly, 'poste', p_role));
  return v_id;
end;
$$;

-- Valider (le bureau a vérifié les absences de l'article 15) ou refuser avec
-- un motif. La décision se change jusqu'à l'ouverture du vote.
create function public.decide_candidacy(p_id uuid, p_valid boolean, p_reason text default null)
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

-- ---------------------------------------------------------------------------
-- Ouvrir, voter, relancer, fermer
-- ---------------------------------------------------------------------------

-- Ouvre un tour : la liste électorale, les questions, les totaux à zéro, et
-- un message à chaque électeur. p_actor vide : ouverture automatique.
create function private.open_ballot(p_assembly uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  c record;
  v_ballot uuid;
  v_pending integer;
  v_q uuid;
  v_pos integer := 0;
  v_ids uuid[];
  i record;
  m record;
  v_label text;
begin
  select * into a from public.assemblies where id = p_assembly for update;
  if a.status <> 'convoquee' then
    raise exception 'Le vote ne peut pas s''ouvrir maintenant.' using errcode = '22023';
  end if;
  if a.vote_closes_at <= private.clock() then
    raise exception 'L''heure de fermeture du vote est passée.' using errcode = '22023';
  end if;
  if a.candidacy_until is not null and a.candidacy_until > private.clock() then
    raise exception 'Les candidatures sont encore ouvertes.' using errcode = '22023';
  end if;
  select count(*) into v_pending from public.candidacies where assembly_id = p_assembly and status = 'deposee';
  if v_pending > 0 then
    raise exception 'Il reste % à vérifier avant d''ouvrir le vote.',
      case when v_pending = 1 then 'une candidature' else v_pending || ' candidatures' end using errcode = '22023';
  end if;

  -- Article 32 : un candidat qui n'est pas à jour à l'ouverture est retiré.
  for c in
    select cd.id, cd.member_id, cd.role_code, private.vote_right(cd.member_id) as v_right
    from public.candidacies cd
    where cd.assembly_id = p_assembly and cd.status = 'validee'
  loop
    if c.v_right <> 'actif' then
      select label into v_label from public.bureau_roles where code = c.role_code;
      update public.candidacies
      set status = 'retiree', withdrawn_at = now(),
          reason = case when c.v_right = 'suspendu' then 'Cotisation en retard à l''ouverture du vote (article 32)'
                        else 'N''est plus membre actif étudiant' end
      where id = c.id;
      perform private.assembly_message(c.member_id,
        'Ta candidature au poste ' || v_label || ' est retirée : '
          || case when c.v_right = 'suspendu' then 'ta cotisation n''était pas à jour à l''ouverture du vote (article 32).'
                  else 'tu n''es plus membre actif étudiant.' end,
        jsonb_build_object('type', 'candidature_retiree', 'assembly', a.id, 'role', c.role_code, 'label', v_label));
      perform private.log_activity('elections', 'retrait_candidature',
        'a retiré la candidature de ' || private.full_name(c.member_id) || ' au poste ' || v_label
          || case when c.v_right = 'suspendu' then ' : cotisation en retard à l''ouverture du vote' else ' : plus membre actif étudiant' end,
        c.member_id, jsonb_build_object('ag', a.id, 'poste', c.role_code), null);
    end if;
  end loop;

  insert into public.ballots (assembly_id, round, opened_at, opened_by_name, closes_at)
  values (p_assembly, 1, private.clock(), coalesce(private.signature(p_actor), 'AEGB, automatique'), a.vote_closes_at)
  returning id into v_ballot;

  -- Les résolutions, dans l'ordre du jour, puis les postes, dans l'ordre du bureau.
  for i in select * from public.assembly_items where assembly_id = p_assembly and kind = 'resolution' order by position loop
    v_pos := v_pos + 1;
    insert into public.ballot_questions (ballot_id, position, kind, item_id, title, detail)
    values (v_ballot, v_pos, 'resolution', i.id, i.title, i.detail)
    returning id into v_q;
    insert into private.ballot_counts (question_id, choice)
    values (v_q, 'pour'), (v_q, 'contre'), (v_q, 'abstention');
  end loop;

  for i in
    select r.code, r.label, it.id as item_id
    from public.assembly_items it
    cross join lateral unnest(it.seats) s (code)
    join public.bureau_roles r on r.code = s.code
    where it.assembly_id = p_assembly and it.kind = 'election'
    order by r.sort_order
  loop
    select coalesce(array_agg(cd.id order by p.last_name, p.first_name), '{}') into v_ids
    from public.candidacies cd
    join public.profiles p on p.id = cd.member_id
    where cd.assembly_id = p_assembly and cd.role_code = i.code and cd.status = 'validee';
    if cardinality(v_ids) = 0 then
      continue;
    end if;
    v_pos := v_pos + 1;
    insert into public.ballot_questions (ballot_id, position, kind, item_id, role_code, title, candidates)
    values (v_ballot, v_pos, 'poste', i.item_id, i.code, i.label, v_ids)
    returning id into v_q;
    if cardinality(v_ids) = 1 then
      insert into private.ballot_counts (question_id, choice) values (v_q, 'pour'), (v_q, 'contre'), (v_q, 'blanc');
    else
      insert into private.ballot_counts (question_id, choice)
      select v_q, x::text from unnest(v_ids) x
      union all select v_q, 'blanc';
    end if;
  end loop;

  if v_pos = 0 then
    raise exception 'Rien à voter : aucune résolution et aucun candidat validé.' using errcode = '22023';
  end if;

  insert into public.ballot_electors (ballot_id, member_id)
  select v_ballot, p.id
  from public.profiles p
  where p.status = 'actif' and p.member_type = 'etudiant' and private.vote_right(p.id) = 'actif';

  update public.assemblies set status = 'vote' where id = p_assembly;

  for m in select e.member_id from public.ballot_electors e where e.ballot_id = v_ballot loop
    perform private.assembly_message(m.member_id,
      'Le vote est ouvert. Tu peux voter jusqu''à ' || private.hour_label(a.vote_closes_at) || ', en salle ou d''ailleurs. Ton vote est secret.',
      jsonb_build_object('type', 'ouverture', 'assembly', a.id, 'ballot', v_ballot, 'round', 1, 'closes_at', a.vote_closes_at));
  end loop;

  perform private.log_activity('elections', 'ouverture_vote',
    'a ouvert le vote' || case when p_actor is null then ' à l''heure prévue' else '' end || ' : '
      || private.assembly_label(a)
      || ' (' || (select count(*) from public.ballot_electors where ballot_id = v_ballot) || ' inscrits)',
    null, jsonb_build_object('ag', a.id, 'tour', 1), p_actor);
  return v_ballot;
end;
$$;

-- Le bureau ouvre le vote le jour de l'AG. Sinon, il s'ouvre tout seul à
-- l'heure annoncée.
create function public.open_vote(p_assembly uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
begin
  perform private.require('elections');
  select * into a from public.assemblies where id = p_assembly;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if (private.clock() at time zone 'Europe/Paris')::date < (a.held_at at time zone 'Europe/Paris')::date then
    raise exception 'Le vote s''ouvre le jour de l''AG.' using errcode = '22023';
  end if;
  return private.open_ballot(p_assembly, auth.uid());
end;
$$;

-- Dépose le bulletin. p_choices : un choix par question, {"<question>": "<choix>"}.
-- L'émargement note l'heure ; les totaux de toutes les questions sont
-- réécrits ensemble, chacun augmenté de 1 ou de 0.
create function public.cast_vote(p_ballot uuid, p_choices jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.ballots;
  a public.assemblies;
  v_me uuid := auth.uid();
  v_questions integer;
  v_valid integer;
  v_voters integer;
  v_electors integer;
  v_at timestamptz := private.clock();
begin
  perform private.require_member();
  -- Un bulletin à la fois : le tour est verrouillé le temps du dépôt.
  select * into b from public.ballots where id = p_ballot for update;
  if not found then
    raise exception 'Ce vote n''existe pas.' using errcode = 'P0002';
  end if;
  if b.status <> 'ouvert' or b.closes_at <= private.clock() then
    raise exception 'Le vote est fermé.' using errcode = '22023';
  end if;
  select * into a from public.assemblies where id = b.assembly_id;

  case private.vote_right(v_me)
    when 'actif' then null;
    when 'suspendu' then
      raise exception 'Ton droit de vote est suspendu tant que ta cotisation n''est pas à jour (article 32).' using errcode = '42501';
    else
      raise exception 'Seuls les membres actifs étudiants votent (article 7).' using errcode = '42501';
  end case;
  if b.round = 2 and not exists (select 1 from public.ballot_electors where ballot_id = p_ballot and member_id = v_me) then
    raise exception 'Le second tour est réservé aux inscrits du premier.' using errcode = '42501';
  end if;
  if exists (select 1 from public.ballot_voters where ballot_id = p_ballot and member_id = v_me) then
    raise exception 'Tu as déjà voté : ton bulletin est dans l''urne.' using errcode = '23505';
  end if;

  if jsonb_typeof(p_choices) is distinct from 'object' then
    raise exception 'Ton bulletin est mal rempli.' using errcode = '22023';
  end if;
  select count(*) into v_questions from public.ballot_questions where ballot_id = p_ballot;
  select count(*) into v_valid
  from public.ballot_questions q
  join private.ballot_counts c on c.question_id = q.id and c.choice = p_choices ->> q.id::text
  where q.ballot_id = p_ballot;
  if v_valid <> v_questions or (select count(*) from jsonb_object_keys(p_choices)) <> v_questions then
    raise exception 'Ton bulletin est incomplet : il faut un choix pour chaque question.' using errcode = '22023';
  end if;

  -- Un étudiant qui vient de régler son retard entre dans la liste en votant.
  insert into public.ballot_electors (ballot_id, member_id) values (p_ballot, v_me) on conflict do nothing;
  insert into public.ballot_voters (ballot_id, member_id, voted_at) values (p_ballot, v_me, v_at);

  update private.ballot_counts c
  set votes = c.votes + case when c.choice = p_choices ->> c.question_id::text then 1 else 0 end
  from public.ballot_questions q
  where q.id = c.question_id and q.ballot_id = p_ballot;

  if b.quorum_reached_at is null then
    select count(*) into v_voters from public.ballot_voters where ballot_id = p_ballot;
    select count(*) into v_electors from public.ballot_electors where ballot_id = p_ballot;
    if v_voters >= private.quorum_needed(a.kind, a.convocation, b.round, v_electors) then
      update public.ballots set quorum_reached_at = v_at where id = p_ballot;
    end if;
  end if;
  return v_at;
end;
$$;

-- Un rappel aux électeurs qui n'ont pas encore voté, au plus toutes les
-- dix minutes.
create function public.remind_voters(p_ballot uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.ballots;
  a public.assemblies;
  m record;
  n integer := 0;
begin
  perform private.require('elections');
  select * into b from public.ballots where id = p_ballot for update;
  if not found or b.status <> 'ouvert' or b.closes_at <= private.clock() then
    raise exception 'Le vote est fermé.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ballot_reminders where ballot_id = p_ballot and sent_at > now() - interval '10 minutes') then
    raise exception 'Un rappel vient de partir : attends dix minutes avant le suivant.' using errcode = '22023';
  end if;
  select * into a from public.assemblies where id = b.assembly_id;
  for m in
    select e.member_id from public.ballot_electors e
    where e.ballot_id = p_ballot
      and not exists (select 1 from public.ballot_voters v where v.ballot_id = p_ballot and v.member_id = e.member_id)
  loop
    perform private.assembly_message(m.member_id,
      'Le vote ferme à ' || private.hour_label(b.closes_at) || ' et tu n''as pas encore voté. Ça prend deux minutes.',
      jsonb_build_object('type', 'relance', 'assembly', a.id, 'ballot', b.id, 'round', b.round, 'closes_at', b.closes_at));
    n := n + 1;
  end loop;
  insert into public.ballot_reminders (ballot_id, recipients, sent_by_name) values (p_ballot, n, private.signature(auth.uid()));
  perform private.log_activity('elections', 'relance',
    'a relancé ' || n || ' électeur' || case when n > 1 then 's' else '' end || ' qui n''avai' || case when n > 1 then 'ent' else 't' end
      || ' pas encore voté', null, jsonb_build_object('ag', a.id, 'tour', b.round, 'electeurs', n));
  return n;
end;
$$;

-- Le résultat d'une question, à partir des totaux (article 13). Une
-- résolution est adoptée avec plus de « pour » que de « contre », ou les
-- deux tiers des exprimés en AG extraordinaire (article 14). Un candidat
-- seul est élu avec plus de « pour » que de « contre ». Entre plusieurs
-- candidats, le plus de voix l'emporte ; à égalité, second tour.
create function private.count_question(p_question uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.ballot_questions;
  v_counts jsonb;
  v_pour integer;
  v_contre integer;
  v_expressed integer;
  v_max integer;
  v_tied uuid[] := '{}';
  v_outcome text;
  v_winner uuid;
begin
  select * into q from public.ballot_questions where id = p_question;
  select coalesce(jsonb_object_agg(choice, votes), '{}'::jsonb) into v_counts
  from private.ballot_counts where question_id = p_question;

  if q.kind = 'resolution' or cardinality(q.candidates) = 1 then
    v_pour := coalesce((v_counts ->> 'pour')::integer, 0);
    v_contre := coalesce((v_counts ->> 'contre')::integer, 0);
    v_expressed := v_pour + v_contre;
    if q.kind = 'resolution' then
      v_outcome := case
        when v_expressed > 0 and p_kind = 'extraordinaire' and v_pour * 3 >= v_expressed * 2 then 'adoptee'
        when v_expressed > 0 and p_kind <> 'extraordinaire' and v_pour > v_contre then 'adoptee'
        else 'rejetee' end;
    else
      v_outcome := case when v_pour > v_contre then 'pourvu' else 'vacant' end;
      v_winner := case when v_outcome = 'pourvu' then q.candidates[1] end;
    end if;
  else
    select coalesce(sum(votes), 0), coalesce(max(votes), 0) into v_expressed, v_max
    from private.ballot_counts where question_id = p_question and choice <> 'blanc';
    if v_expressed = 0 then
      v_outcome := 'vacant';
    else
      select array_agg(choice::uuid order by choice) into v_tied
      from private.ballot_counts where question_id = p_question and choice <> 'blanc' and votes = v_max;
      if cardinality(v_tied) = 1 then
        v_outcome := 'pourvu';
        v_winner := v_tied[1];
        v_tied := '{}';
      else
        v_outcome := 'egalite';
      end if;
    end if;
  end if;

  insert into public.ballot_results (question_id, counts, expressed, outcome, winner, tied)
  values (p_question, v_counts, v_expressed, v_outcome, v_winner, v_tied);
end;
$$;

-- Ferme un tour. Quorum atteint : les totaux deviennent les résultats, que
-- seul le bureau voit. Quorum manqué : les totaux sont effacés sans être lus.
-- p_actor vide : fermeture automatique à l'heure prévue.
create function private.close_ballot(p_ballot uuid, p_actor uuid)
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
        || ' : quorum non atteint (' || v_voters || ' votants sur ' || v_electors || ', il en fallait ' || v_quorum
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
      || ' : ' || v_voters || ' votants sur ' || v_electors || ' inscrits',
    null, jsonb_build_object('ag', a.id, 'tour', b.round, 'inscrits', v_electors, 'votants', v_voters), p_actor);
  return 'ferme';
end;
$$;

create function public.close_vote(p_ballot uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require('elections');
  return private.close_ballot(p_ballot, auth.uid());
end;
$$;

-- Égalité : un second tour de 30 minutes, tout de suite, entre les ex aequo
-- de chaque poste concerné. Mêmes inscrits qu'au premier tour.
create function public.open_second_round(p_assembly uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  b1 public.ballots;
  v_ballot uuid;
  v_q uuid;
  v_pos integer := 0;
  v_labels text[] := '{}';
  v_closes timestamptz := private.clock() + interval '30 minutes';
  t record;
  m record;
begin
  perform private.require('elections');
  select * into a from public.assemblies where id = p_assembly for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if a.status <> 'depouillement' then
    raise exception 'Le second tour s''ouvre après le dépouillement du premier.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ballots where assembly_id = p_assembly and round = 2) then
    raise exception 'Le second tour a déjà eu lieu.' using errcode = '22023';
  end if;
  select * into b1 from public.ballots where assembly_id = p_assembly and round = 1;

  for t in
    select q.role_code, q.title, q.item_id, r.tied
    from public.ballot_questions q
    join public.ballot_results r on r.question_id = q.id
    where q.ballot_id = b1.id and r.outcome = 'egalite'
    order by q.position
  loop
    if v_ballot is null then
      insert into public.ballots (assembly_id, round, opened_at, opened_by_name, closes_at)
      values (p_assembly, 2, private.clock(), private.signature(auth.uid()), v_closes)
      returning id into v_ballot;
    end if;
    v_pos := v_pos + 1;
    v_labels := v_labels || t.title;
    insert into public.ballot_questions (ballot_id, position, kind, item_id, role_code, title, candidates)
    values (v_ballot, v_pos, 'poste', t.item_id, t.role_code, t.title, t.tied)
    returning id into v_q;
    insert into private.ballot_counts (question_id, choice)
    select v_q, x::text from unnest(t.tied) x
    union all select v_q, 'blanc';
  end loop;
  if v_ballot is null then
    raise exception 'Aucun poste n''est à départager.' using errcode = '22023';
  end if;

  insert into public.ballot_electors (ballot_id, member_id)
  select v_ballot, e.member_id from public.ballot_electors e where e.ballot_id = b1.id;
  update public.assemblies set status = 'vote' where id = p_assembly;

  for m in select e.member_id from public.ballot_electors e where e.ballot_id = v_ballot loop
    perform private.assembly_message(m.member_id,
      'Second tour pour ' || array_to_string(v_labels, ', ') || ' : tu peux voter jusqu''à ' || private.hour_label(v_closes) || '.',
      jsonb_build_object('type', 'second_tour', 'assembly', a.id, 'ballot', v_ballot, 'round', 2, 'closes_at', v_closes,
                         'labels', to_jsonb(v_labels)));
  end loop;
  perform private.log_activity('elections', 'second_tour',
    'a ouvert le second tour pour ' || array_to_string(v_labels, ', '), null,
    jsonb_build_object('ag', a.id, 'postes', to_jsonb(v_labels)));
  return v_ballot;
end;
$$;

-- Le résultat final de chaque poste : celui du second tour s'il a eu lieu.
create function private.seat_outcomes(p_assembly uuid)
returns table (role_code text, label text, outcome text, winner uuid, round smallint, expressed integer, votes integer, single boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (q.role_code)
    q.role_code, q.title, r.outcome, r.winner, b.round, r.expressed,
    case when r.winner is null then null
         when cardinality(q.candidates) = 1 then (r.counts ->> 'pour')::integer
         else (r.counts ->> r.winner::text)::integer end,
    cardinality(q.candidates) = 1
  from public.ballot_questions q
  join public.ballots b on b.id = q.ballot_id
  join public.ballot_results r on r.question_id = q.id
  where b.assembly_id = p_assembly and q.kind = 'poste'
  order by q.role_code, b.round desc;
$$;

-- Publie les résultats : une annonce dans le fil, les résultats et le
-- procès-verbal dans l'onglet Votes, la passation préparée.
create function public.publish_results(p_assembly uuid)
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

  v_body := 'Le vote de ' || private.assembly_label(a) || ' est clos : ' || b1.voters || ' votants sur ' || b1.electors
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

-- ---------------------------------------------------------------------------
-- Seconde AG (article 13)
-- ---------------------------------------------------------------------------

-- Entre 7 et 21 jours après la première, avec le même ordre du jour. Les
-- candidatures validées restent valables. La convocation part tout de suite.
create function public.convene_second_assembly(
  p_first uuid,
  p_held_at timestamptz,
  p_place text,
  p_vote_opens_at timestamptz,
  p_vote_closes_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.assemblies;
  v_id uuid;
  v_place text := btrim(coalesce(p_place, ''));
  v_days integer;
  v_day date := (p_held_at at time zone 'Europe/Paris')::date;
  n integer;
begin
  perform private.require('elections');
  select * into f from public.assemblies where id = p_first for update;
  if not found then
    raise exception 'Cette AG n''existe plus.' using errcode = 'P0002';
  end if;
  if f.status <> 'carence' or f.convocation <> 1 then
    raise exception 'Une seconde AG se convoque seulement après une première AG sans quorum.' using errcode = '22023';
  end if;
  if exists (select 1 from public.assemblies where first_id = p_first and status <> 'annulee') then
    raise exception 'La seconde AG est déjà convoquée.' using errcode = '22023';
  end if;
  v_days := v_day - (f.held_at at time zone 'Europe/Paris')::date;
  if p_held_at is null or v_days < 7 or v_days > 21 then
    raise exception 'La seconde AG a lieu entre 7 et 21 jours après la première (article 13).' using errcode = '22023';
  end if;
  if v_place = '' or char_length(v_place) > 120 then
    raise exception 'Indique le lieu de l''AG (120 caractères au plus).' using errcode = '22023';
  end if;
  if p_vote_opens_at is null or p_vote_closes_at is null
     or (p_vote_opens_at at time zone 'Europe/Paris')::date <> v_day
     or (p_vote_closes_at at time zone 'Europe/Paris')::date <> v_day
     or p_vote_closes_at < p_vote_opens_at + interval '15 minutes'
     or p_vote_opens_at <= private.clock() then
    raise exception 'Le vote dans l''appli a lieu le jour de la seconde AG, pendant au moins un quart d''heure.' using errcode = '22023';
  end if;

  insert into public.assemblies (kind, convocation, first_id, status, held_at, place, vote_opens_at, vote_closes_at,
                                 candidacy_until, mandate_start, created_by)
  values (f.kind, 2, f.id, 'brouillon', p_held_at, v_place, p_vote_opens_at, p_vote_closes_at, null, f.mandate_start, auth.uid())
  returning id into v_id;
  insert into public.assembly_items (assembly_id, position, kind, title, detail, seats)
  select v_id, position, kind, title, detail, seats from public.assembly_items where assembly_id = f.id;
  insert into public.candidacies (assembly_id, role_code, member_id, statement, status, paper, created_at, decided_at, decided_by_name)
  select v_id, role_code, member_id, statement, 'validee', paper, created_at, decided_at, decided_by_name
  from public.candidacies where assembly_id = f.id and status = 'validee';

  n := private.send_convocation(v_id, auth.uid());
  perform private.log_activity('elections', 'convocation',
    'a convoqué la seconde AG du ' || private.day_label(p_held_at) || ' (' || n || ' membres)', null,
    jsonb_build_object('ag', v_id, 'premiere', f.id, 'membres', n));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Passation (article 16)
-- ---------------------------------------------------------------------------

-- Donne leur poste aux élus dont la passation est confirmée et dont le jour
-- de prise de poste est arrivé. Un élu qui occupait un autre poste le quitte.
create function private.apply_handovers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  n integer := 0;
begin
  for h in
    select ho.*, r.label, a.held_at
    from public.role_handovers ho
    join public.bureau_roles r on r.code = ho.role_code
    join public.assemblies a on a.id = ho.assembly_id
    where ho.confirmed_at is not null and ho.applied_at is null and ho.effective_on <= private.today()
    order by r.sort_order
  loop
    if exists (select 1 from public.profiles where id = h.member_id and status = 'actif')
       and not private.is_guarantor(h.member_id) then
      update public.bureau_roles set holder_id = null, assigned_at = now(), assigned_by = null
      where holder_id = h.member_id and code <> h.role_code and not locked;
      update public.bureau_roles set holder_id = h.member_id, assigned_at = now(), assigned_by = null
      where code = h.role_code;
      perform private.log_activity('postes', 'passation',
        'a donné le poste ' || h.label || ' à ' || private.full_name(h.member_id)
          || ' (passation de l''AG du ' || private.day_label(h.held_at) || ')',
        h.member_id, jsonb_build_object('poste', h.role_code, 'ag', h.assembly_id), null);
      n := n + 1;
    end if;
    update public.role_handovers set applied_at = now() where id = h.id;
  end loop;
  return n;
end;
$$;

-- Le poste qui attribue les postes confirme la passation. Elle s'applique
-- le jour de la prise de poste, ou tout de suite après une élection partielle.
create function public.confirm_handover(p_assembly uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assemblies;
  n integer;
begin
  perform private.require('postes');
  select * into a from public.assemblies where id = p_assembly;
  if not found or a.status <> 'publiee' then
    raise exception 'Les résultats de cette AG ne sont pas publiés.' using errcode = '22023';
  end if;
  update public.role_handovers
  set confirmed_at = now(), confirmed_by_name = private.signature(auth.uid())
  where assembly_id = p_assembly and confirmed_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    return 0;
  end if;
  perform private.log_activity('postes', 'confirmation_passation',
    'a confirmé la passation de ' || private.assembly_label(a), null, jsonb_build_object('ag', a.id));
  perform private.apply_handovers();
  return n;
end;
$$;

-- Les passations qui attendent, pour l'écran Postes et droits.
create function public.pending_handovers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can('postes', 'lecture') then coalesce(jsonb_agg(jsonb_build_object(
           'assembly', a.id, 'held_at', a.held_at, 'role', h.role_code, 'label', r.label,
           'member', private.person_json(h.member_id), 'effective_on', h.effective_on,
           'confirmed_at', h.confirmed_at, 'confirmed_by_name', h.confirmed_by_name
         ) order by a.held_at, r.sort_order), '[]'::jsonb) else '[]'::jsonb end
  from public.role_handovers h
  join public.assemblies a on a.id = h.assembly_id
  join public.bureau_roles r on r.code = h.role_code
  where h.applied_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Ouverture et fermeture à l'heure, chaque minute
-- ---------------------------------------------------------------------------

create function private.elections_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.ballots where status = 'ouvert' and closes_at <= private.clock() loop
    perform private.close_ballot(r.id, null);
  end loop;
  -- À l'heure annoncée, le vote s'ouvre tout seul s'il le peut. S'il reste
  -- des candidatures à vérifier, le bureau l'ouvrira lui-même.
  for r in
    select id from public.assemblies
    where status = 'convoquee' and vote_opens_at <= private.clock() and vote_closes_at > private.clock()
  loop
    begin
      perform private.open_ballot(r.id, null);
    exception when invalid_parameter_value then
      null;
    end;
  end loop;
  perform private.apply_handovers();
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('aegb-elections', '* * * * *', 'select private.elections_tick()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pendant les essais : vider les AG
-- ---------------------------------------------------------------------------

-- Efface les AG d'essai, leurs messages et leurs annonces. Les postes déjà
-- donnés par une passation ne changent pas. Impossible après le lancement.
create function public.clear_elections()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not (private.is_guarantor(auth.uid()) and public.is_active_member()) then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
  if public.journal_locked() then
    raise exception 'Les journaux sont verrouillés depuis le lancement : les AG ne s''effacent plus.' using errcode = '22023';
  end if;
  delete from public.posts
  where id in (select convocation_post_id from public.assemblies union select results_post_id from public.assemblies);
  delete from public.messages where kind = 'assemblee';
  delete from public.assemblies where id is not null;
  get diagnostics n = row_count;
  perform private.log_activity('elections', 'vider_elections', 'a effacé les AG des essais');
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Règles d'accès : rien ne se lit directement
-- ---------------------------------------------------------------------------

alter table public.assemblies enable row level security;
alter table public.assembly_items enable row level security;
alter table public.candidacies enable row level security;
alter table public.ballots enable row level security;
alter table public.ballot_questions enable row level security;
alter table public.ballot_results enable row level security;
alter table public.ballot_electors enable row level security;
alter table public.ballot_voters enable row level security;
alter table public.ballot_reminders enable row level security;
alter table public.role_handovers enable row level security;

revoke all on public.assemblies, public.assembly_items, public.candidacies, public.ballots, public.ballot_questions,
  public.ballot_results, public.ballot_electors, public.ballot_voters, public.ballot_reminders, public.role_handovers
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.assembly_view(uuid),
  public.assembly_admin(uuid),
  public.save_assembly(uuid, text, timestamptz, text, timestamptz, timestamptz, timestamptz, date, jsonb),
  public.cancel_assembly(uuid, text),
  public.send_convocation(uuid, boolean),
  public.submit_candidacy(uuid, text, text),
  public.withdraw_candidacy(uuid),
  public.add_paper_candidacy(uuid, uuid, text, text),
  public.decide_candidacy(uuid, boolean, text),
  public.open_vote(uuid),
  public.cast_vote(uuid, jsonb),
  public.remind_voters(uuid),
  public.close_vote(uuid),
  public.open_second_round(uuid),
  public.publish_results(uuid),
  public.convene_second_assembly(uuid, timestamptz, text, timestamptz, timestamptz),
  public.confirm_handover(uuid),
  public.pending_handovers(),
  public.clear_elections()
  from public, anon;

grant execute on function
  public.assembly_view(uuid),
  public.assembly_admin(uuid),
  public.save_assembly(uuid, text, timestamptz, text, timestamptz, timestamptz, timestamptz, date, jsonb),
  public.cancel_assembly(uuid, text),
  public.send_convocation(uuid, boolean),
  public.submit_candidacy(uuid, text, text),
  public.withdraw_candidacy(uuid),
  public.add_paper_candidacy(uuid, uuid, text, text),
  public.decide_candidacy(uuid, boolean, text),
  public.open_vote(uuid),
  public.cast_vote(uuid, jsonb),
  public.remind_voters(uuid),
  public.close_vote(uuid),
  public.open_second_round(uuid),
  public.publish_results(uuid),
  public.convene_second_assembly(uuid, timestamptz, text, timestamptz, timestamptz),
  public.confirm_handover(uuid),
  public.pending_handovers(),
  public.clear_elections()
  to authenticated;
