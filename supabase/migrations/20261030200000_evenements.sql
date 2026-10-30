-- Lot 6 : les événements (plan et maquettes validés par Cronos le 30 octobre
-- 2026, avec le paiement d'une place dans l'appli ou sur place).
--
-- Le bureau (droit « Événements ») crée un événement, en brouillon ou publié.
-- Publié, il arrive dans le fil et dans l'onglet Événements. Chaque membre
-- validé dit « Je participe » ; quand c'est complet, il rejoint la liste
-- d'attente, et la première personne de la liste prend la place libérée.
-- Le compte AEGB écrit seulement aux membres qui y vont : rappel la veille à
-- 18 h, changement de date ou de lieu, annulation, place libérée, paiement.
--
-- Un événement payant se paie dans l'appli (par carte, avec HelloAsso, comme
-- les cotisations) ou sur place (le bureau le note). Chaque paiement entre
-- dans le journal financier ; un remboursement est une contre-passation.
--
-- L'assemblée générale du lot 5 s'ajoute toute seule aux événements à la
-- convocation : son « Je participe » dit seulement qui vient en salle.
--
-- Comme aux lots précédents, l'appli lit et écrit à travers les fonctions
-- ci-dessous : les tables du lot ne sont pas lisibles directement.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- brouillon : seul le bureau le voit. publie : dans le fil et l'onglet
-- Événements. annule : reste visible avec la mention « Annulé ».
create table public.events (
  id uuid primary key,
  title text not null check (char_length(title) between 2 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  online boolean not null default false,
  place text check (char_length(place) <= 160),
  -- Le lien de la visio : seulement montré aux membres connectés.
  link text check (char_length(link) <= 300),
  photo_path text,
  capacity integer check (capacity between 1 and 5000),
  -- 0 : gratuit. Le prix d'un invité est seulement affiché : il paie sur place.
  member_price_cents integer not null default 0 check (member_price_cents between 0 and 100000),
  guest_price_cents integer check (guest_price_cents between 0 and 100000),
  pay_in_app boolean not null default true,
  pay_on_site boolean not null default true,
  -- Article 8 des statuts : réservé aux membres à jour de leur cotisation.
  up_to_date_only boolean not null default false,
  public_site boolean not null default false,
  status text not null default 'brouillon' check (status in ('brouillon', 'publie', 'annule')),
  assembly_id uuid unique references public.assemblies (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  published_at timestamptz,
  reminded_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null,
  updated_at timestamptz,
  updated_by_name text,
  constraint events_end check (ends_at is null or ends_at > starts_at),
  constraint events_where check ((online and link is not null) or (not online and place is not null)),
  constraint events_pay check (member_price_cents = 0 or pay_in_app or pay_on_site)
);

create index events_starts_idx on public.events (starts_at);

-- inscrit : a une place. attente : sur la liste d'attente, dans l'ordre
-- d'arrivée. present : pointé à l'entrée le jour J (seul le bureau le voit).
create table public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('inscrit', 'attente')),
  registered_at timestamptz not null default clock_timestamp(),
  -- Venu sans s'être inscrit : ajouté au pointage.
  walk_in boolean not null default false,
  present boolean not null default false,
  checked_at timestamptz,
  checked_by_name text,
  primary key (event_id, member_id)
);

create index event_participants_member_idx on public.event_participants (member_id);
create index event_participants_queue_idx on public.event_participants (event_id, status, registered_at);

-- Le paiement d'une place : par carte (HelloAsso) ou noté par le bureau.
create table public.event_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  member_id uuid references public.profiles (id) on delete set null,
  member_name text not null,
  method public.pay_method not null,
  status public.payment_status not null default 'en_attente',
  amount_cents integer not null check (amount_cents > 0),
  checkout_intent_id bigint unique,
  reference text check (char_length(reference) <= 60),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  paid_on date,
  recorded_by_name text,
  ledger_id bigint references public.ledger_entries (id),
  cancelled_at timestamptz
);

create index event_payments_event_idx on public.event_payments (event_id, member_id);
create index event_payments_member_idx on public.event_payments (member_id, created_at desc);

-- La carte d'un événement dans le fil.
alter table public.posts add column event_id uuid references public.events (id) on delete set null;

-- Les cartes « événement » du compte AEGB.
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('message', 'bienvenue', 'arrivee', 'systeme', 'cotisation', 'assemblee', 'evenement'));

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

-- La fin d'un événement : l'heure de fin, ou 4 heures après le début.
create function private.event_end(e public.events)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(e.ends_at, e.starts_at + interval '4 hours');
$$;

-- « samedi 5 décembre, 19 h ».
create function private.event_when(e public.events)
returns text
language sql
stable
set search_path = ''
as $$
  select regexp_replace(private.day_label(e.starts_at), ' [0-9]{4}$', '') || ', ' || private.hour_label(e.starts_at);
$$;

create function private.event_where(e public.events)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when e.online then 'en ligne' else e.place end;
$$;

-- Le membre est-il à jour de sa cotisation (article 8) ? Un membre qui ne
-- paie pas de cotisation l'est toujours.
create function private.dues_ok(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.dues_state(p_member) ->> 'status', 'a_jour') <> 'retard';
$$;

-- Le paiement confirmé qui vaut la place d'un membre : le premier.
create function private.event_paid(p_event uuid, p_member uuid)
returns public.event_payments
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.event_payments
  where event_id = p_event and member_id = p_member and status = 'confirme'
  order by confirmed_at, created_at
  limit 1;
$$;

-- Une carte du compte AEGB dans la conversation du membre.
create function private.event_message(p_member uuid, p_body text, p_meta jsonb)
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
  values (v_conv, 'evenement', true, p_body, coalesce(p_meta, '{}'::jsonb));
  update public.conversations set last_message_at = now(), changed_at = clock_timestamp() where id = v_conv;
end;
$$;

-- Ce que chaque message d'un événement recopie : de quoi afficher la carte.
create function private.event_meta(e public.events, p_type text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'type', p_type,
    'event', e.id,
    'title', e.title,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'online', e.online,
    'place', e.place,
    'price_cents', e.member_price_cents
  );
$$;

-- Si l'événement a des places libres, la première personne de la liste
-- d'attente les prend, et le compte AEGB la prévient.
create function private.fill_from_waitlist(p_event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_taken integer;
  r record;
  n integer := 0;
begin
  select * into e from public.events where id = p_event for update;
  if e.status <> 'publie' or e.capacity is null or e.starts_at <= private.clock() then
    return 0;
  end if;
  select count(*) into v_taken from public.event_participants where event_id = p_event and status = 'inscrit';
  for r in
    select ep.member_id, p.first_name
    from public.event_participants ep
    join public.profiles p on p.id = ep.member_id
    where ep.event_id = p_event and ep.status = 'attente'
    order by ep.registered_at
    limit greatest(e.capacity - v_taken, 0)
  loop
    update public.event_participants set status = 'inscrit' where event_id = p_event and member_id = r.member_id;
    perform private.event_message(r.member_id,
      'Bonne nouvelle, ' || r.first_name || ' : tu étais sur la liste d''attente de « ' || e.title
        || ' », et une place s''est libérée. Elle est à toi.'
        || case when e.member_price_cents > 0 and (private.event_paid(e.id, r.member_id)).id is null
             then ' Ta place : ' || private.euros(e.member_price_cents)
               || case when e.pay_in_app and e.pay_on_site then ', à payer dans l''appli ou à l''entrée.'
                       when e.pay_in_app then ', à payer dans l''appli.'
                       else ', à payer à l''entrée.' end
             else '' end,
      private.event_meta(e, 'place'));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Le résumé d'un événement, pour les listes et la carte du fil.
create function private.event_card(e public.events, p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'online', e.online,
    'place', e.place,
    'photo_path', e.photo_path,
    'capacity', e.capacity,
    'member_price_cents', e.member_price_cents,
    'guest_price_cents', e.guest_price_cents,
    'up_to_date_only', e.up_to_date_only,
    'status', e.status,
    'assembly_id', e.assembly_id,
    'post_id', e.post_id,
    'cancel_reason', e.cancel_reason,
    'going', (select count(*) from public.event_participants where event_id = e.id and status = 'inscrit'),
    'waiting', (select count(*) from public.event_participants where event_id = e.id and status = 'attente'),
    'faces', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_path', p.avatar_path)
                       order by ep.registered_at)
      from (
        select member_id, registered_at from public.event_participants
        where event_id = e.id and status = 'inscrit'
        order by registered_at limit 4
      ) ep
      join public.profiles p on p.id = ep.member_id
    ), '[]'::jsonb),
    'mine', (
      select jsonb_build_object(
        'status', ep.status,
        'rank', case when ep.status = 'attente' then (
          select count(*) from public.event_participants w
          where w.event_id = e.id and w.status = 'attente' and w.registered_at <= ep.registered_at) end
      )
      from public.event_participants ep where ep.event_id = e.id and ep.member_id = p_member
    ),
    'paid', (private.event_paid(e.id, p_member)).id is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- Ce que voit le membre
-- ---------------------------------------------------------------------------

-- Les événements publiés : à venir (et en cours), et passés depuis un an.
create function public.events_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  return coalesce((
    select jsonb_agg(private.event_card(e, auth.uid()) order by e.starts_at)
    from public.events e
    where e.status in ('publie', 'annule')
      and e.starts_at > private.clock() - interval '1 year'
  ), '[]'::jsonb);
end;
$$;

-- Le détail d'un événement. Le bureau des événements voit aussi les brouillons.
create function public.event_view(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_paid public.event_payments;
  v_pending public.event_payments;
  v_item jsonb;
begin
  perform private.require_member();
  select * into e from public.events where id = p_id;
  if not found or (e.status = 'brouillon' and not public.can('evenements', 'lecture')) then
    raise exception 'Cet événement n''existe plus.' using errcode = 'P0002';
  end if;
  v_paid := private.event_paid(e.id, auth.uid());
  select * into v_pending from public.event_payments
  where event_id = e.id and member_id = auth.uid() and status = 'en_attente' and method = 'carte'
  order by created_at desc limit 1;
  if e.assembly_id is not null then
    select jsonb_build_object('kind', a.kind, 'convocation', a.convocation, 'status', a.status,
             'vote_opens_at', a.vote_opens_at, 'vote_closes_at', a.vote_closes_at,
             'items', coalesce((select jsonb_agg(i.title order by i.position) from public.assembly_items i where i.assembly_id = a.id), '[]'::jsonb))
    into v_item
    from public.assemblies a where a.id = e.assembly_id;
  end if;
  return private.event_card(e, auth.uid()) || jsonb_build_object(
    'description', e.description,
    'link', e.link,
    'guest_price_cents', e.guest_price_cents,
    'pay_in_app', e.pay_in_app,
    'pay_on_site', e.pay_on_site,
    'published_at', e.published_at,
    'dues_ok', private.dues_ok(auth.uid()),
    'assembly', v_item,
    'payment', case when v_paid.id is null then null else jsonb_build_object(
      'method', v_paid.method, 'amount_cents', v_paid.amount_cents, 'paid_on', v_paid.paid_on) end,
    'pending_payment', v_pending.id
  );
end;
$$;

-- Qui y va, et la liste d'attente dans l'ordre. Visible par tous les membres ;
-- qui est venu reste au bureau.
create function public.event_people(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  if not exists (select 1 from public.events where id = p_id and (status <> 'brouillon' or public.can('evenements', 'lecture'))) then
    raise exception 'Cet événement n''existe plus.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'going', coalesce((
      select jsonb_agg(private.person_json(ep.member_id) || jsonb_build_object('me', ep.member_id = auth.uid()) order by ep.registered_at)
      from public.event_participants ep join public.profiles p on p.id = ep.member_id and p.status = 'actif'
      where ep.event_id = p_id and ep.status = 'inscrit'
    ), '[]'::jsonb),
    'waiting', coalesce((
      select jsonb_agg(private.person_json(ep.member_id) || jsonb_build_object('me', ep.member_id = auth.uid()) order by ep.registered_at)
      from public.event_participants ep join public.profiles p on p.id = ep.member_id and p.status = 'actif'
      where ep.event_id = p_id and ep.status = 'attente'
    ), '[]'::jsonb)
  );
end;
$$;

-- « Je participe ». Renvoie inscrit, ou attente avec la place dans la file.
create function public.join_event(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_taken integer;
  v_status text;
  v_rank integer;
begin
  perform private.require_member();
  select * into e from public.events where id = p_id for update;
  if not found or e.status = 'brouillon' then
    raise exception 'Cet événement n''existe plus.' using errcode = 'P0002';
  end if;
  if e.status = 'annule' then
    raise exception 'Cet événement est annulé.' using errcode = '22023';
  end if;
  if e.starts_at <= private.clock() then
    raise exception 'L''événement a déjà commencé : les inscriptions sont fermées.' using errcode = '22023';
  end if;
  if e.up_to_date_only and not private.dues_ok(auth.uid()) then
    raise exception 'Cet événement est réservé aux membres à jour de leur cotisation (article 8). Règle ta cotisation pour t''inscrire.' using errcode = '22023';
  end if;
  select status into v_status from public.event_participants where event_id = p_id and member_id = auth.uid();
  if v_status is null then
    select count(*) into v_taken from public.event_participants where event_id = p_id and status = 'inscrit';
    v_status := case when e.capacity is not null and v_taken >= e.capacity then 'attente' else 'inscrit' end;
    insert into public.event_participants (event_id, member_id, status) values (p_id, auth.uid(), v_status);
  end if;
  if v_status = 'attente' then
    select count(*) into v_rank from public.event_participants w
    where w.event_id = p_id and w.status = 'attente'
      and w.registered_at <= (select registered_at from public.event_participants where event_id = p_id and member_id = auth.uid());
  end if;
  return jsonb_build_object('status', v_status, 'rank', v_rank);
end;
$$;

-- Se désinscrire, ou quitter la liste d'attente, jusqu'au début.
create function public.leave_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_status text;
  v_paid public.event_payments;
begin
  perform private.require_member();
  select * into e from public.events where id = p_id for update;
  if not found or e.status = 'brouillon' then
    raise exception 'Cet événement n''existe plus.' using errcode = 'P0002';
  end if;
  if e.starts_at <= private.clock() and e.status = 'publie' then
    raise exception 'L''événement a déjà commencé.' using errcode = '22023';
  end if;
  delete from public.event_participants where event_id = p_id and member_id = auth.uid()
  returning status into v_status;
  if v_status is null then
    return;
  end if;
  -- Les cartes jamais payées sont abandonnées.
  update public.event_payments set status = 'echec'
  where event_id = p_id and member_id = auth.uid() and status = 'en_attente';
  v_paid := private.event_paid(p_id, auth.uid());
  if v_paid.id is not null and e.status = 'publie' then
    perform private.event_message(auth.uid(),
      'Tu ne vas plus à « ' || e.title || ' ». Tu avais payé ta place ' || private.euros(v_paid.amount_cents)
        || ' : le trésorier te la rembourse.',
      private.event_meta(e, 'desinscription') || jsonb_build_object('amount_cents', v_paid.amount_cents));
  end if;
  if v_status = 'inscrit' then
    perform private.fill_from_waitlist(p_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Le paiement d'une place
-- ---------------------------------------------------------------------------

-- Confirme un paiement : l'écriture entre dans le journal financier et le
-- compte AEGB envoie le reçu. Sans effet si c'est déjà fait.
create function private.confirm_event_payment(p_payment uuid, p_paid_on date, p_reference text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.event_payments;
  e public.events;
  l public.ledger_entries;
  v_twice boolean;
begin
  select * into v from public.event_payments where id = p_payment for update;
  if not found then
    raise exception 'Ce paiement n''existe pas.' using errcode = 'P0002';
  end if;
  if v.status = 'confirme' then
    return jsonb_build_object('status', 'confirme', 'already', true);
  end if;
  if v.status = 'annule' then
    raise exception 'Ce paiement a été annulé.' using errcode = '22023';
  end if;
  select * into e from public.events where id = v.event_id;
  v_twice := (private.event_paid(v.event_id, v.member_id)).id is not null;

  l := private.add_ledger(
    p_paid_on,
    left('Événement : ' || e.title, 140),
    'evenements',
    v.amount_cents,
    case when v.method = 'carte' then 'helloasso' else v.method::text end,
    v.member_id,
    v.member_name,
    null,
    null,
    null,
    case when v_twice then 'Place déjà payée : à rembourser.' end,
    p_actor
  );
  update public.event_payments
  set status = 'confirme', confirmed_at = now(), paid_on = p_paid_on, reference = coalesce(p_reference, reference),
      ledger_id = l.id, recorded_by_name = case when p_actor is null then null else private.signature(p_actor) end
  where id = v.id;

  if v.member_id is not null then
    perform private.event_message(v.member_id,
      'Paiement reçu : ta place pour « ' || e.title || ' », ' || private.euros(v.amount_cents) || ', '
        || private.method_label(v.method) || '. '
        || case when v_twice then 'Tu avais déjà payé : le trésorier te rembourse ce second paiement.' else 'Merci, à bientôt !' end,
      private.event_meta(e, 'paiement') || jsonb_build_object('amount_cents', v.amount_cents, 'method', v.method, 'paid_on', p_paid_on));
  end if;
  return jsonb_build_object('status', 'confirme', 'number', l.number);
end;
$$;

-- Prépare le paiement par carte de sa place. Le montant vient de la base ; le
-- paiement ne compte qu'une fois confirmé par HelloAsso.
create function public.start_event_payment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_id uuid;
begin
  perform private.require_member();
  select * into e from public.events where id = p_id;
  if not found or e.status <> 'publie' then
    raise exception 'Cet événement n''est plus ouvert.' using errcode = '22023';
  end if;
  if e.member_price_cents = 0 or not e.pay_in_app then
    raise exception 'Cette place ne se paie pas dans l''appli.' using errcode = '22023';
  end if;
  if private.event_end(e) <= private.clock() then
    raise exception 'L''événement est terminé.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_participants where event_id = p_id and member_id = auth.uid() and status = 'inscrit') then
    raise exception 'Inscris-toi d''abord : tu paies ta place une fois qu''elle est à toi.' using errcode = '22023';
  end if;
  if (private.event_paid(p_id, auth.uid())).id is not null then
    raise exception 'Ta place est déjà payée.' using errcode = '22023';
  end if;
  update public.event_payments set status = 'echec'
  where event_id = p_id and member_id = auth.uid() and status = 'en_attente' and created_at < now() - interval '2 hours';
  insert into public.event_payments (event_id, member_id, member_name, method, amount_cents)
  values (p_id, auth.uid(), private.full_name(auth.uid()), 'carte', e.member_price_cents)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount_cents', e.member_price_cents, 'label', e.title);
end;
$$;

-- Où en est un paiement par carte, pour l'écran de retour d'HelloAsso.
create function public.event_payment_status(p_payment uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', v.id, 'status', v.status, 'amount_cents', v.amount_cents, 'event', v.event_id, 'title', e.title)
  from public.event_payments v
  join public.events e on e.id = v.event_id
  where v.id = p_payment and v.member_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Ce que fait le bureau
-- ---------------------------------------------------------------------------

-- Les événements pour le bureau : brouillons, à venir et passés.
create function public.events_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require('evenements', 'lecture');
  return coalesce((
    select jsonb_agg(private.event_card(e, auth.uid()) || jsonb_build_object(
      'present', (select count(*) from public.event_participants where event_id = e.id and present),
      'paid_count', (select count(distinct member_id) from public.event_payments where event_id = e.id and status = 'confirme')
    ) order by e.starts_at)
    from public.events e
    where e.status = 'brouillon' or e.starts_at > private.clock() - interval '1 year'
  ), '[]'::jsonb);
end;
$$;

-- Un événement pour le bureau : les inscrits, la liste d'attente, les
-- paiements et les remboursements à faire. Le trésorier aussi le lit.
create function public.event_admin(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  if not (public.can('evenements', 'lecture') or public.can('tresorerie', 'lecture')) then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_id;
  if not found then
    raise exception 'Cet événement n''existe plus.' using errcode = 'P0002';
  end if;
  return private.event_card(e, auth.uid()) || jsonb_build_object(
    'description', e.description,
    'link', e.link,
    'pay_in_app', e.pay_in_app,
    'pay_on_site', e.pay_on_site,
    'public_site', e.public_site,
    'published_at', e.published_at,
    'reminded_at', e.reminded_at,
    'cancelled_at', e.cancelled_at,
    'created_by_name', e.created_by_name,
    'created_at', e.created_at,
    'updated_by_name', e.updated_by_name,
    'present', (select count(*) from public.event_participants where event_id = e.id and present),
    'people', coalesce((
      select jsonb_agg(
        private.person_json(ep.member_id) || jsonb_build_object(
          'status', ep.status,
          'registered_at', ep.registered_at,
          'walk_in', ep.walk_in,
          'present', ep.present,
          'checked_at', ep.checked_at,
          'dues_status', private.dues_state(ep.member_id) ->> 'status',
          'payment', (
            select jsonb_build_object('id', v.id, 'method', v.method, 'amount_cents', v.amount_cents, 'paid_on', v.paid_on,
                                      'recorded_by_name', v.recorded_by_name)
            from public.event_payments v
            where v.event_id = e.id and v.member_id = ep.member_id and v.status = 'confirme'
            order by v.confirmed_at limit 1
          )
        ) order by ep.status, ep.registered_at)
      from public.event_participants ep
      where ep.event_id = e.id
    ), '[]'::jsonb),
    -- Les places payées à rendre : désinscription, annulation, ou paiement
    -- en double. Le trésorier rembourse par une contre-passation.
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment', v.id, 'member_id', v.member_id, 'member_name', v.member_name, 'method', v.method,
        'amount_cents', v.amount_cents, 'paid_on', v.paid_on, 'ledger_id', v.ledger_id,
        'ledger_number', (select number from public.ledger_entries where id = v.ledger_id)
      ) order by v.confirmed_at)
      from public.event_payments v
      where v.event_id = e.id and v.status = 'confirme'
        and (e.status = 'annule'
          or not exists (select 1 from public.event_participants ep where ep.event_id = e.id and ep.member_id = v.member_id)
          or v.id <> (private.event_paid(e.id, v.member_id)).id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Crée ou modifie un événement. p_data : title, description, starts_at,
-- ends_at, online, place, link, photo_path, capacity, member_price_cents,
-- guest_price_cents, pay_in_app, pay_on_site, up_to_date_only, public_site.
-- p_publish : publier maintenant (un brouillon), sinon l'enregistrer.
-- Un événement publié qui change de date, d'heure ou de lieu : chaque
-- participant reçoit un message qui dit ce qui a changé.
create function public.save_event(p_id uuid, p_data jsonb, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.events;
  e public.events;
  v_new boolean;
  v_title text := btrim(coalesce(p_data ->> 'title', ''));
  v_desc text := btrim(coalesce(p_data ->> 'description', ''));
  v_starts timestamptz := nullif(p_data ->> 'starts_at', '')::timestamptz;
  v_ends timestamptz := nullif(p_data ->> 'ends_at', '')::timestamptz;
  v_online boolean := coalesce((p_data ->> 'online')::boolean, false);
  v_place text := nullif(btrim(coalesce(p_data ->> 'place', '')), '');
  v_link text := nullif(btrim(coalesce(p_data ->> 'link', '')), '');
  v_photo text := nullif(p_data ->> 'photo_path', '');
  v_capacity integer := nullif(p_data ->> 'capacity', '')::integer;
  v_price integer := coalesce(nullif(p_data ->> 'member_price_cents', '')::integer, 0);
  v_guest integer := nullif(p_data ->> 'guest_price_cents', '')::integer;
  v_app boolean := coalesce((p_data ->> 'pay_in_app')::boolean, true);
  v_site boolean := coalesce((p_data ->> 'pay_on_site')::boolean, true);
  v_changes jsonb := '[]'::jsonb;
  v_text text;
  v_post uuid;
  r record;
  n integer := 0;
begin
  perform private.require('evenements');
  select * into o from public.events where id = p_id for update;
  v_new := not found;
  if not v_new and o.assembly_id is not null then
    raise exception 'L''assemblée générale se modifie dans l''écran Élections.' using errcode = '22023';
  end if;
  if not v_new and o.status = 'annule' then
    raise exception 'Cet événement est annulé : il ne se modifie plus.' using errcode = '22023';
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 100 then
    raise exception 'Donne un titre (100 caractères au plus).' using errcode = '22023';
  end if;
  if char_length(v_desc) > 2000 then
    raise exception 'La description dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if v_starts is null then
    raise exception 'Choisis la date et l''heure du début.' using errcode = '22023';
  end if;
  if v_ends is not null and v_ends <= v_starts then
    raise exception 'L''heure de fin doit venir après le début.' using errcode = '22023';
  end if;
  if (v_new or o.starts_at is distinct from v_starts) and v_starts <= private.clock() then
    raise exception 'La date de début est passée.' using errcode = '22023';
  end if;
  if v_online then
    if v_link is null or v_link !~* '^https?://[^ ]+$' or char_length(v_link) > 300 then
      raise exception 'Donne le lien de la visio (une adresse qui commence par https://).' using errcode = '22023';
    end if;
  elsif v_place is null or char_length(v_place) > 160 then
    raise exception 'Donne le lieu (160 caractères au plus).' using errcode = '22023';
  end if;
  if v_capacity is not null and (v_capacity < 1 or v_capacity > 5000) then
    raise exception 'Le nombre de places va de 1 à 5 000.' using errcode = '22023';
  end if;
  if v_price < 0 or v_price > 100000 or coalesce(v_guest, 0) < 0 or coalesce(v_guest, 0) > 100000 then
    raise exception 'Le prix va de 0 à 1 000 €.' using errcode = '22023';
  end if;
  if v_price > 0 and not (v_app or v_site) then
    raise exception 'Choisis comment payer : dans l''appli, sur place, ou les deux.' using errcode = '22023';
  end if;
  if not v_new and v_price <> o.member_price_cents
     and exists (select 1 from public.event_payments where event_id = p_id and status = 'confirme') then
    raise exception 'Des membres ont déjà payé leur place : le prix ne change plus.' using errcode = '22023';
  end if;
  if v_photo is not null and v_photo is distinct from o.photo_path
     and (not starts_with(v_photo, 'evenements/' || p_id::text || '/')
          or not exists (select 1 from storage.objects where bucket_id = 'publications' and name = v_photo)) then
    raise exception 'La photo n''a pas été envoyée correctement. Réessaie.' using errcode = '22023';
  end if;

  if v_new then
    insert into public.events (
      id, title, description, starts_at, ends_at, online, place, link, photo_path, capacity,
      member_price_cents, guest_price_cents, pay_in_app, pay_on_site, up_to_date_only, public_site,
      created_by, created_by_name
    ) values (
      p_id, v_title, v_desc, v_starts, v_ends, v_online, case when v_online then null else v_place end,
      case when v_online then v_link end, v_photo, v_capacity,
      v_price, case when v_guest is null or v_guest = 0 then null else v_guest end,
      v_app or v_price = 0, v_site or v_price = 0,
      coalesce((p_data ->> 'up_to_date_only')::boolean, false), coalesce((p_data ->> 'public_site')::boolean, false),
      auth.uid(), private.signature(auth.uid())
    )
    returning * into e;
  else
    update public.events set
      title = v_title, description = v_desc, starts_at = v_starts, ends_at = v_ends, online = v_online,
      place = case when v_online then null else v_place end, link = case when v_online then v_link end,
      photo_path = v_photo, capacity = v_capacity, member_price_cents = v_price,
      guest_price_cents = case when v_guest is null or v_guest = 0 then null else v_guest end,
      pay_in_app = v_app or v_price = 0, pay_on_site = v_site or v_price = 0,
      up_to_date_only = coalesce((p_data ->> 'up_to_date_only')::boolean, false),
      public_site = coalesce((p_data ->> 'public_site')::boolean, false),
      -- Une nouvelle date : le rappel de la veille repartira.
      reminded_at = case when o.starts_at is distinct from v_starts then null else o.reminded_at end,
      updated_at = now(), updated_by_name = private.signature(auth.uid())
    where id = p_id
    returning * into e;
  end if;

  if e.status = 'brouillon' and coalesce(p_publish, false) then
    v_post := gen_random_uuid();
    insert into public.posts (id, author_id, official, title, body, audience, published_at, event_id)
    values (v_post, null, true, e.title, left(e.description, 2000), 'tous', now(), e.id);
    insert into public.announcement_authors (post_id, written_by, written_by_name)
    values (v_post, case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid()));
    update public.events set status = 'publie', published_at = private.clock(), post_id = v_post where id = e.id returning * into e;
    perform private.log_activity('evenements', 'publication', 'a publié l''événement « ' || e.title || ' »', null,
      jsonb_build_object('evenement', e.id));
  elsif v_new then
    perform private.log_activity('evenements', 'brouillon', 'a créé le brouillon « ' || e.title || ' »', null,
      jsonb_build_object('evenement', e.id));
  elsif e.status = 'publie' then
    -- La carte du fil suit l'événement.
    update public.posts set title = e.title, body = left(e.description, 2000) where id = e.post_id;
    if o.starts_at is distinct from e.starts_at then
      v_changes := v_changes || jsonb_build_object('label', 'Quand',
        'before', private.event_when(o), 'after', private.event_when(e));
    end if;
    if o.online is distinct from e.online or o.place is distinct from e.place or o.link is distinct from e.link then
      v_changes := v_changes || jsonb_build_object('label', 'Où',
        'before', private.event_where(o), 'after', private.event_where(e));
    end if;
    if jsonb_array_length(v_changes) > 0 then
      v_text := (select string_agg(lower(c ->> 'label'), ' et ') from jsonb_array_elements(v_changes) c);
      for r in select member_id from public.event_participants where event_id = e.id loop
        perform private.event_message(r.member_id,
          '« ' || e.title || ' » change : ' || concat_ws(' et ',
            case when o.starts_at is distinct from e.starts_at then
              case when (o.starts_at at time zone 'Europe/Paris')::date = (e.starts_at at time zone 'Europe/Paris')::date
                then 'nouvel horaire' else 'nouvelle date' end end,
            case when v_text like '%où%' then 'nouveau lieu' end) || '.',
          private.event_meta(e, 'changement') || jsonb_build_object('changes', v_changes));
        n := n + 1;
      end loop;
    end if;
    -- Plus de places : la liste d'attente avance.
    perform private.fill_from_waitlist(e.id);
    perform private.log_activity('evenements', 'modification', 'a modifié l''événement « ' || e.title || ' »'
      || case when n > 0 then ' (' || n || ' participants prévenus)' else '' end, null,
      jsonb_build_object('evenement', e.id, 'changements', v_changes));
  else
    perform private.log_activity('evenements', 'brouillon', 'a modifié le brouillon « ' || e.title || ' »', null,
      jsonb_build_object('evenement', e.id));
  end if;
  return jsonb_build_object('id', e.id, 'status', e.status, 'notified', n);
end;
$$;

-- Annule un événement publié, avec un motif envoyé à chaque participant. La
-- carte reste dans le fil avec la mention « Annulé ». Un brouillon s'efface.
create function public.cancel_event(p_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_paid public.event_payments;
  r record;
  n integer := 0;
begin
  perform private.require('evenements');
  select * into e from public.events where id = p_id for update;
  if not found then
    raise exception 'Cet événement n''existe plus.' using errcode = 'P0002';
  end if;
  if e.assembly_id is not null then
    raise exception 'L''assemblée générale s''annule dans l''écran Élections.' using errcode = '22023';
  end if;
  if e.status = 'brouillon' then
    delete from public.events where id = p_id;
    perform private.log_activity('evenements', 'brouillon_efface', 'a effacé le brouillon « ' || e.title || ' »');
    return 0;
  end if;
  if e.status = 'annule' then
    raise exception 'Cet événement est déjà annulé.' using errcode = '22023';
  end if;
  if private.event_end(e) <= private.clock() then
    raise exception 'L''événement est passé : il ne s''annule plus.' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 300 then
    raise exception 'Donne le motif (300 caractères au plus) : il est envoyé aux participants.' using errcode = '22023';
  end if;

  update public.events set status = 'annule', cancelled_at = now(), cancel_reason = v_reason where id = p_id returning * into e;
  update public.event_payments set status = 'echec' where event_id = p_id and status = 'en_attente';
  for r in select member_id from public.event_participants where event_id = p_id loop
    v_paid := private.event_paid(p_id, r.member_id);
    perform private.event_message(r.member_id,
      '« ' || e.title || ' », prévu ' || private.event_when(e) || ', est annulé. ' || v_reason
        || case when v_paid.id is not null then ' Tu avais payé ta place ' || private.euros(v_paid.amount_cents) || ' : le trésorier te la rembourse.' else '' end,
      private.event_meta(e, 'annulation') || jsonb_build_object('reason', v_reason, 'amount_cents', v_paid.amount_cents));
    n := n + 1;
  end loop;
  perform private.log_activity('evenements', 'annulation', 'a annulé l''événement « ' || e.title || ' »', null,
    jsonb_build_object('evenement', e.id, 'motif', v_reason, 'prevenus', n));
  return n;
end;
$$;

-- Le jour J : pointer un membre à l'entrée, ou le retirer. Un membre venu
-- sans s'être inscrit est ajouté à la liste.
create function public.check_in(p_event uuid, p_member uuid, p_present boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  perform private.require('evenements');
  select * into e from public.events where id = p_event;
  if not found or e.status <> 'publie' then
    raise exception 'Cet événement n''est pas ouvert au pointage.' using errcode = '22023';
  end if;
  if e.starts_at > private.clock() + interval '1 day' then
    raise exception 'Le pointage s''ouvre la veille de l''événement.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_member and status = 'actif') then
    raise exception 'Ce membre n''est pas un membre validé.' using errcode = '22023';
  end if;
  if coalesce(p_present, false) then
    insert into public.event_participants (event_id, member_id, status, walk_in, present, checked_at, checked_by_name)
    values (p_event, p_member, 'inscrit', true, true, now(), private.signature(auth.uid()))
    on conflict (event_id, member_id) do update
      set present = true, status = 'inscrit', checked_at = now(), checked_by_name = excluded.checked_by_name;
  else
    update public.event_participants set present = false, checked_at = null, checked_by_name = null
    where event_id = p_event and member_id = p_member;
    -- Ajouté par erreur au pointage : il disparaît de la liste.
    delete from public.event_participants where event_id = p_event and member_id = p_member and walk_in;
  end if;
end;
$$;

-- Le bureau note une place payée sur place (espèces, ou autre moyen).
create function public.record_event_payment(p_event uuid, p_member uuid, p_method public.pay_method default 'especes')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_id uuid;
  v_result jsonb;
begin
  if not (public.can('evenements') or public.can('tresorerie')) then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
  if p_method = 'carte' then
    raise exception 'Un paiement par carte passe par HelloAsso.' using errcode = '22023';
  end if;
  select * into e from public.events where id = p_event;
  if not found or e.status <> 'publie' then
    raise exception 'Cet événement n''est pas ouvert.' using errcode = '22023';
  end if;
  if e.member_price_cents = 0 then
    raise exception 'Cet événement est gratuit.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_participants where event_id = p_event and member_id = p_member and status = 'inscrit') then
    raise exception 'Ce membre n''a pas de place pour cet événement.' using errcode = '22023';
  end if;
  if (private.event_paid(p_event, p_member)).id is not null then
    raise exception 'Sa place est déjà payée.' using errcode = '22023';
  end if;
  update public.event_payments set status = 'echec' where event_id = p_event and member_id = p_member and status = 'en_attente';
  insert into public.event_payments (event_id, member_id, member_name, method, amount_cents)
  values (p_event, p_member, private.full_name(p_member), p_method, e.member_price_cents)
  returning id into v_id;
  v_result := private.confirm_event_payment(v_id, private.today(), null, auth.uid());
  perform private.log_activity('argent', 'place_encaissee',
    'a encaissé la place de ' || private.full_name(p_member) || ' pour « ' || e.title || ' » (' || private.euros(e.member_price_cents)
      || ', ' || private.method_label(p_method) || ')',
    p_member, jsonb_build_object('evenement', e.id, 'ecriture', v_result -> 'number'));
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- L'assemblée générale dans les événements
-- ---------------------------------------------------------------------------

-- À la convocation, l'AG s'ajoute aux événements, sans nouvelle publication
-- dans le fil : la convocation y est déjà. Annulée, elle l'est aussi ici.
create function private.assembly_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'convoquee' and old.status = 'brouillon' then
    insert into public.events (id, title, description, starts_at, online, place, status, assembly_id, published_at,
                               created_by_name)
    values (
      gen_random_uuid(),
      case when new.convocation = 2 then 'Seconde assemblée générale' else 'Assemblée générale ' || new.kind end,
      'L''assemblée générale de l''AEGB. Le vote se fait dans l''onglet Votes, en salle ou à distance, de '
        || private.hour_label(new.vote_opens_at) || ' à ' || private.hour_label(new.vote_closes_at) || '.',
      new.held_at, false, new.place, 'publie', new.id, now(), coalesce(new.convened_by_name, 'Le bureau')
    )
    on conflict (assembly_id) do nothing;
  elsif new.status = 'annulee' and old.status <> 'annulee' then
    update public.events set status = 'annule', cancelled_at = now(), cancel_reason = new.cancel_reason
    where assembly_id = new.id and status = 'publie';
  end if;
  return new;
end;
$$;

create trigger assemblies_event
  after update of status on public.assemblies
  for each row execute function private.assembly_event();

-- L'AG déjà convoquée pendant les essais entre aussi dans les événements.
insert into public.events (id, title, description, starts_at, online, place, status, assembly_id, published_at, created_by_name)
select gen_random_uuid(),
       case when a.convocation = 2 then 'Seconde assemblée générale' else 'Assemblée générale ' || a.kind end,
       'L''assemblée générale de l''AEGB. Le vote se fait dans l''onglet Votes, en salle ou à distance, de '
         || private.hour_label(a.vote_opens_at) || ' à ' || private.hour_label(a.vote_closes_at) || '.',
       a.held_at, false, a.place, 'publie', a.id, coalesce(a.convened_at, now()), coalesce(a.convened_by_name, 'Le bureau')
from public.assemblies a
where a.status in ('convoquee', 'vote', 'depouillement', 'publiee', 'carence');

-- ---------------------------------------------------------------------------
-- Le rappel de la veille à 18 h
-- ---------------------------------------------------------------------------

-- Chaque participant reçoit l'heure, le lieu et, s'il n'a pas payé, le prix.
-- Un événement publié moins de 24 heures avant n'a pas de rappel.
create function private.send_event_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.clock();
  v_local timestamp := v_now at time zone 'Europe/Paris';
  e public.events;
  r record;
  n integer := 0;
begin
  if extract(hour from v_local) < 18 then
    return 0;
  end if;
  for e in
    select * from public.events
    where status = 'publie' and reminded_at is null
      and (starts_at at time zone 'Europe/Paris')::date = v_local::date + 1
      and published_at <= starts_at - interval '24 hours'
    for update skip locked
  loop
    for r in
      select ep.member_id, p.first_name from public.event_participants ep
      join public.profiles p on p.id = ep.member_id
      where ep.event_id = e.id and ep.status = 'inscrit'
    loop
      perform private.event_message(r.member_id,
        'Petit rappel, ' || r.first_name || ' : « ' || e.title || ' », c''est demain, ' || private.event_when(e)
          || case when e.online then ', en ligne.' else ', à ' || e.place || '.' end
          || case when e.member_price_cents > 0 and (private.event_paid(e.id, r.member_id)).id is null
               then ' Ta place : ' || private.euros(e.member_price_cents)
                 || case when e.pay_in_app and e.pay_on_site then ', à payer dans l''appli ou à l''entrée.'
                         when e.pay_in_app then ', à payer dans l''appli.' else ', à payer à l''entrée.' end
               else '' end,
        private.event_meta(e, 'rappel') || jsonb_build_object(
          'unpaid', e.member_price_cents > 0 and (private.event_paid(e.id, r.member_id)).id is null,
          'pay_in_app', e.pay_in_app, 'pay_on_site', e.pay_on_site));
      n := n + 1;
    end loop;
    update public.events set reminded_at = now() where id = e.id;
  end loop;
  return n;
end;
$$;

create function private.events_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_event_reminders();
  update public.event_payments set status = 'echec'
  where status = 'en_attente' and method = 'carte' and created_at < now() - interval '2 hours';
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('aegb-evenements', '*/5 * * * *', 'select private.events_tick()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- HelloAsso : les paiements de cotisation et de place passent par la même
-- fonction serveur
-- ---------------------------------------------------------------------------

create or replace function public.helloasso_payment(p_payment uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
       'id', v.id,
       'kind', 'cotisation',
       'member_id', v.member_id,
       'status', v.status,
       'method', v.method,
       'amount_cents', v.amount_cents,
       'label', private.months_label(v.months),
       'checkout_intent_id', v.checkout_intent_id,
       'created_at', v.created_at,
       'first_name', p.first_name,
       'last_name', p.last_name,
       'email', c.email
     )
     from public.dues_payments v
     left join public.profiles p on p.id = v.member_id
     left join public.member_contacts c on c.id = v.member_id
     where v.id = p_payment),
    (select jsonb_build_object(
       'id', v.id,
       'kind', 'evenement',
       'event_id', v.event_id,
       'member_id', v.member_id,
       'status', v.status,
       'method', v.method,
       'amount_cents', v.amount_cents,
       'label', e.title,
       'checkout_intent_id', v.checkout_intent_id,
       'created_at', v.created_at,
       'first_name', p.first_name,
       'last_name', p.last_name,
       'email', c.email
     )
     from public.event_payments v
     join public.events e on e.id = v.event_id
     left join public.profiles p on p.id = v.member_id
     left join public.member_contacts c on c.id = v.member_id
     where v.id = p_payment)
  );
$$;

create or replace function public.helloasso_attach(p_payment uuid, p_intent bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dues_payments set checkout_intent_id = p_intent
  where id = p_payment and method = 'carte' and status = 'en_attente';
  if found then
    return;
  end if;
  update public.event_payments set checkout_intent_id = p_intent
  where id = p_payment and method = 'carte' and status = 'en_attente';
  if not found then
    raise exception 'Ce paiement n''attend plus.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.helloasso_confirm(p_payment uuid, p_reference text, p_paid_on date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.dues_payments where id = p_payment and method = 'carte') then
    return private.confirm_payment(p_payment, coalesce(p_paid_on, private.today()), p_reference, null, true);
  end if;
  if exists (select 1 from public.event_payments where id = p_payment and method = 'carte') then
    return private.confirm_event_payment(p_payment, coalesce(p_paid_on, private.today()), p_reference, null);
  end if;
  raise exception 'Ce paiement n''existe pas.' using errcode = 'P0002';
end;
$$;

create or replace function public.helloasso_fail(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dues_payments set status = 'echec'
  where id = p_payment and method = 'carte' and status = 'en_attente';
  update public.event_payments set status = 'echec'
  where id = p_payment and method = 'carte' and status = 'en_attente';
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal financier : rembourser une place
-- ---------------------------------------------------------------------------

-- La contre-passation d'une place payée la rend au membre : le paiement est
-- annulé et le compte AEGB le prévient. Le reste ne change pas.
create or replace function public.reverse_ledger_entry(p_entry bigint, p_reason text, p_note text default null, p_notify boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ledger_entries;
  e public.ledger_entries;
  v_reason_label text;
  v public.dues_payments;
  w public.event_payments;
  ev public.events;
  v_label text;
begin
  perform private.require('tresorerie');
  v_reason_label := case p_reason
    when 'montant' then 'montant erroné'
    when 'membre' then 'mauvais membre'
    when 'mois' then 'mauvais mois'
    when 'rembourse' then 'paiement remboursé'
    when 'autre' then 'autre motif'
  end;
  if v_reason_label is null then
    raise exception 'Choisis le motif de la correction.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 300 then
    raise exception 'Les précisions dépassent 300 caractères.' using errcode = '22023';
  end if;

  select * into o from public.ledger_entries where id = p_entry;
  if not found then
    raise exception 'Cette écriture n''existe pas.' using errcode = 'P0002';
  end if;
  if o.reverses is not null then
    raise exception 'Une correction ne se corrige pas. Passe une nouvelle écriture si besoin.' using errcode = '22023';
  end if;
  if o.payment_id is not null then
    select * into v from public.dues_payments where id = o.payment_id for update;
  end if;
  select * into w from public.event_payments where ledger_id = o.id for update;
  if exists (select 1 from public.ledger_entries where reverses = o.id) then
    raise exception 'Cette écriture est déjà corrigée.' using errcode = '22023';
  end if;

  e := private.add_ledger(private.today(), 'Contre-passation, ' || v_reason_label, 'correction', -o.amount_cents, o.method,
                          o.member_id, o.member_name, o.payment_id, o.id, p_reason, p_note, auth.uid());

  if o.payment_id is not null then
    update public.dues_payments set status = 'annule', cancelled_at = now() where id = o.payment_id;
    delete from public.dues_coverage where payment_id = o.payment_id;
    update public.dues_receipts set cancelled_at = now() where payment_id = o.payment_id;
    if coalesce(p_notify, true) and o.member_id is not null then
      v_label := private.months_label(v.months);
      perform private.dues_message(
        o.member_id,
        'annule',
        'Ton paiement « ' || v_label || ' » (' || private.euros(v.amount_cents) || ') a été annulé : '
          || v_reason_label || '.'
          || case when cardinality(v.months) > 1 then ' Ces mois sont de nouveau à payer.' else ' Ce mois est de nouveau à payer.' end,
        jsonb_build_object('receipt', v.receipt_number, 'months', to_jsonb(v.months), 'amount_cents', v.amount_cents, 'reason', p_reason)
      );
    end if;
  end if;

  if w.id is not null then
    update public.event_payments set status = 'annule', cancelled_at = now() where id = w.id;
    select * into ev from public.events where id = w.event_id;
    if coalesce(p_notify, true) and w.member_id is not null then
      perform private.event_message(w.member_id,
        case when p_reason = 'rembourse'
          then 'Le trésorier t''a remboursé ta place pour « ' || ev.title || ' » (' || private.euros(w.amount_cents) || ').'
          else 'Ton paiement pour « ' || ev.title || ' » (' || private.euros(w.amount_cents) || ') a été annulé : ' || v_reason_label || '.'
            || case when ev.status = 'publie' and private.event_end(ev) > private.clock()
                      and exists (select 1 from public.event_participants where event_id = ev.id and member_id = w.member_id)
                      and (private.event_paid(ev.id, w.member_id)).id is null
                    then ' Ta place est de nouveau à payer.' else '' end
        end,
        private.event_meta(ev, case when p_reason = 'rembourse' then 'rembourse' else 'paiement_annule' end)
          || jsonb_build_object('amount_cents', w.amount_cents));
    end if;
  end if;

  perform private.log_activity(
    'argent', 'correction',
    'a corrigé l''écriture n° ' || lpad(o.number::text, 3, '0') || ' (' || v_reason_label || ')',
    o.member_id,
    jsonb_build_object('number', e.number, 'reverses', o.number)
  );
  return e.number;
end;
$$;

-- Pendant les essais : vider aussi les paiements des places.
create or replace function public.clear_finances()
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
    raise exception 'Les journaux sont verrouillés depuis le lancement : ils ne peuvent plus être vidés.' using errcode = '22023';
  end if;
  delete from public.dues_coverage where member_id is not null;
  delete from public.dues_receipts where number is not null;
  update public.dues_payments set ledger_id = null where ledger_id is not null;
  update public.event_payments set ledger_id = null where ledger_id is not null;
  perform set_config('aegb.clear_finances', 'on', true);
  delete from public.ledger_entries where reverses is not null;
  delete from public.ledger_entries where id is not null;
  get diagnostics n = row_count;
  perform set_config('aegb.clear_finances', 'off', true);
  delete from public.dues_payments where id is not null;
  delete from public.event_payments where id is not null;
  delete from public.messages where kind = 'cotisation';
  delete from public.messages where kind = 'evenement' and meta ->> 'type' in ('paiement', 'rembourse', 'paiement_annule');
  delete from private.discreet_ledger where ledger_id is not null;
  delete from private.dues_reminders where member_id is not null;
  delete from private.receipt_counters where year is not null;
  update private.ledger_counter set last = 0;
  perform private.log_activity('argent', 'vider_finances', 'a vidé le journal financier des essais');
  return n;
end;
$$;

-- Pendant les essais : effacer les événements (sauf ceux des AG), leurs
-- inscriptions, leurs cartes dans le fil et leurs messages. Les paiements
-- déjà au journal financier restent : il se vide avec clear_finances().
create function public.clear_events()
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
    raise exception 'Les journaux sont verrouillés depuis le lancement : les événements ne s''effacent plus.' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_payments where ledger_id is not null) then
    raise exception 'Des places payées sont au journal financier : vide-le d''abord.' using errcode = '22023';
  end if;
  delete from public.event_payments where id is not null;
  delete from public.posts where event_id is not null;
  delete from public.messages where kind = 'evenement';
  delete from public.events where assembly_id is null;
  get diagnostics n = row_count;
  delete from public.event_participants where event_id is not null;
  perform private.log_activity('evenements', 'vider_evenements', 'a effacé les événements des essais');
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Les photos des événements
-- ---------------------------------------------------------------------------

-- Dans le dossier « evenements/<id>/ » des photos des publications.
create policy "Le bureau des événements dépose les photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'publications' and (storage.foldername(name))[1] = 'evenements' and (select public.can('evenements')));

create policy "Le bureau des événements retire les photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'publications' and (storage.foldername(name))[1] = 'evenements' and (select public.can('evenements')));

-- ---------------------------------------------------------------------------
-- Règles d'accès : rien ne se lit directement
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_payments enable row level security;

revoke all on public.events, public.event_participants, public.event_payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.events_list(),
  public.event_view(uuid),
  public.event_people(uuid),
  public.join_event(uuid),
  public.leave_event(uuid),
  public.start_event_payment(uuid),
  public.event_payment_status(uuid),
  public.events_admin(),
  public.event_admin(uuid),
  public.save_event(uuid, jsonb, boolean),
  public.cancel_event(uuid, text),
  public.check_in(uuid, uuid, boolean),
  public.record_event_payment(uuid, uuid, public.pay_method),
  public.clear_events(),
  public.helloasso_payment(uuid),
  public.helloasso_attach(uuid, bigint),
  public.helloasso_confirm(uuid, text, date),
  public.helloasso_fail(uuid)
  from public, anon;

grant execute on function
  public.events_list(),
  public.event_view(uuid),
  public.event_people(uuid),
  public.join_event(uuid),
  public.leave_event(uuid),
  public.start_event_payment(uuid),
  public.event_payment_status(uuid),
  public.events_admin(),
  public.event_admin(uuid),
  public.save_event(uuid, jsonb, boolean),
  public.cancel_event(uuid, text),
  public.check_in(uuid, uuid, boolean),
  public.record_event_payment(uuid, uuid, public.pay_method),
  public.clear_events()
  to authenticated;

-- Réservées à la fonction serveur HelloAsso (clé serveur).
revoke execute on function
  public.helloasso_payment(uuid),
  public.helloasso_attach(uuid, bigint),
  public.helloasso_confirm(uuid, text, date),
  public.helloasso_fail(uuid)
  from authenticated;
grant execute on function
  public.helloasso_payment(uuid),
  public.helloasso_attach(uuid, bigint),
  public.helloasso_confirm(uuid, text, date),
  public.helloasso_fail(uuid)
  to service_role;
