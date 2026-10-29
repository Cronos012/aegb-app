-- Lot 4 : cotisations, paiements, journal financier, quittances, relance.
--
-- Principes :
-- * l'année va de septembre à août ; un mois est dû à partir du début
--   officiel, ou du mois de validation du membre s'il est arrivé après ;
-- * un mois n'est payé qu'une fois le paiement confirmé (par HelloAsso pour
--   la carte, par le bureau pour les espèces, le virement et le chèque) ;
-- * le montant est toujours calculé par la base, jamais par le téléphone ;
-- * le journal financier n'accepte que des ajouts : une erreur se corrige
--   par une contre-passation, une écriture inverse qui cite l'originale ;
-- * seuls les postes qui ont le droit « Cotisations et journal » voient
--   l'argent des autres. Un membre ne voit que sa propre cotisation.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.pay_method as enum ('carte', 'especes', 'virement', 'cheque');
create type public.payment_status as enum ('en_attente', 'confirme', 'echec', 'annule');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Les réglages de la cotisation : une seule ligne.
create table public.dues_settings (
  id boolean primary key default true check (id),
  monthly_cents integer not null default 500 check (monthly_cents between 100 and 100000),
  start_month date not null default date '2026-09-01' check (extract(day from start_month) = 1),
  paying_types public.member_type[] not null default array['etudiant']::public.member_type[],
  solidarity_months integer not null default 2 check (solidarity_months between 1 and 12),
  reminders boolean not null default true,
  org_address text check (char_length(org_address) <= 200),
  org_rna text check (char_length(org_rna) <= 40),
  updated_at timestamptz,
  updated_by_name text
);

insert into public.dues_settings default values;

-- Un paiement : par carte (HelloAsso) ou saisi par le bureau. months : les
-- mois qu'il couvre ; monthly_cents : le prix d'un mois au moment du paiement.
create table public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.profiles (id) on delete set null,
  member_name text not null,
  method public.pay_method not null,
  status public.payment_status not null default 'en_attente',
  months date[] not null check (cardinality(months) between 1 and 24),
  monthly_cents integer not null check (monthly_cents > 0),
  amount_cents integer not null check (amount_cents > 0),
  note text check (char_length(note) <= 300),
  checkout_intent_id bigint unique,
  reference text check (char_length(reference) <= 60),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  paid_on date,
  ledger_id bigint,
  receipt_number text,
  cancelled_at timestamptz
);

create index dues_payments_member_idx on public.dues_payments (member_id, created_at desc);
create index dues_payments_pending_idx on public.dues_payments (created_at) where status = 'en_attente';

-- Les mois payés : un mois ne l'est qu'une fois. Une contre-passation retire
-- les mois du paiement annulé, qui redeviennent dus.
create table public.dues_coverage (
  member_id uuid not null references public.profiles (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  payment_id uuid not null references public.dues_payments (id) on delete cascade,
  amount_cents integer not null,
  primary key (member_id, month)
);

create index dues_coverage_payment_idx on public.dues_coverage (payment_id);

-- Le journal financier. amount_cents : positif pour une entrée, négatif
-- pour une sortie. reverses : l'écriture que celle-ci corrige.
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  number integer not null unique,
  entry_date date not null,
  created_at timestamptz not null default now(),
  label text not null check (char_length(label) between 2 and 140),
  category text not null check (category in (
    'cotisation', 'evenements', 'dons', 'subventions', 'fonctionnement',
    'banque', 'ouverture', 'correction', 'autre'
  )),
  amount_cents integer not null check (amount_cents <> 0 and abs(amount_cents) <= 10000000),
  method text not null check (method in ('helloasso', 'especes', 'virement', 'cheque', 'carte', 'prelevement')),
  member_id uuid references public.profiles (id) on delete set null,
  member_name text,
  payment_id uuid references public.dues_payments (id),
  reverses bigint unique references public.ledger_entries (id),
  reason text check (reason in ('montant', 'membre', 'mois', 'rembourse', 'autre')),
  note text check (char_length(note) <= 300),
  created_by uuid,
  created_by_name text not null
);

create index ledger_entries_date_idx on public.ledger_entries (entry_date desc, number desc);
create index ledger_entries_member_idx on public.ledger_entries (member_id);

-- Les quittances : une par paiement confirmé, numérotée par année.
create table public.dues_receipts (
  number text primary key,
  payment_id uuid not null unique references public.dues_payments (id),
  member_id uuid references public.profiles (id) on delete set null,
  member_name text not null,
  member_type public.member_type not null,
  months date[] not null,
  monthly_cents integer not null,
  amount_cents integer not null,
  method public.pay_method not null,
  paid_on date not null,
  reference text,
  issued_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index dues_receipts_member_idx on public.dues_receipts (member_id, issued_at desc);

alter table public.dues_payments
  add constraint dues_payments_ledger_fkey foreign key (ledger_id) references public.ledger_entries (id);

-- Compteurs sans trou : un numéro n'est pris que si l'écriture est enregistrée.
create table private.ledger_counter (
  only_row boolean primary key default true check (only_row),
  last integer not null default 0
);

insert into private.ledger_counter default values;

create table private.receipt_counters (
  year integer primary key,
  last integer not null
);

-- Qui a vraiment saisi une écriture signée « Le bureau ».
create table private.discreet_ledger (
  ledger_id bigint primary key,
  actor_id uuid not null
);

-- Une relance par membre et par mois, pas plus.
create table private.dues_reminders (
  member_id uuid not null,
  month date not null,
  sent_at timestamptz not null default now(),
  primary key (member_id, month)
);

revoke all on private.ledger_counter, private.receipt_counters, private.discreet_ledger, private.dues_reminders
  from public, anon, authenticated;

-- Les cartes « cotisation » du compte AEGB : rappel, paiement reçu, paiement annulé.
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('message', 'bienvenue', 'arrivee', 'systeme', 'cotisation'));

-- ---------------------------------------------------------------------------
-- Le journal financier n'accepte que des ajouts
-- ---------------------------------------------------------------------------

-- Pendant les essais, clear_finances() peut le vider, comme le journal
-- d'activité, tant que le journal n'est pas verrouillé pour le lancement.
create function private.ledger_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('aegb.clear_finances', true) = 'on'
     and not exists (select 1 from private.journal_lock where locked_at is not null) then
    return old;
  end if;
  raise exception 'Le journal financier ne peut être ni modifié ni effacé. Corrige une erreur par une contre-passation.' using errcode = '42501';
end;
$$;

create trigger ledger_entries_no_update_delete
  before update or delete on public.ledger_entries
  for each row execute function private.ledger_is_append_only();

create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function private.ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- Dates, montants, libellés
-- ---------------------------------------------------------------------------

-- Aujourd'hui à Brest. Les essais de la base peuvent fixer une autre date
-- (réglage aegb.today), seulement depuis une connexion d'administration.
create function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when session_user = 'postgres' and coalesce(current_setting('aegb.today', true), '') <> ''
      then current_setting('aegb.today', true)::date
    else (now() at time zone 'Europe/Paris')::date
  end;
$$;

-- Le 1er septembre de l'année de cotisation qui contient ce jour.
create function private.exercise_start(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(extract(year from p_day)::integer - case when extract(month from p_day) >= 9 then 0 else 1 end, 9, 1);
$$;

create function private.month_name(p_month date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from p_month)::integer];
$$;

create function private.capitalize(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(left(p_text, 1)) || substr(p_text, 2);
$$;

-- « Septembre et octobre 2026 », « Octobre à décembre 2026 »,
-- « Septembre 2026 à mars 2027 », « Novembre 2026 ».
create function private.months_label(p_months date[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v date[];
  n integer;
  v_first date;
  v_last date;
  v_span integer;
  v_items text[] := '{}';
  i integer;
begin
  select coalesce(array_agg(distinct m order by m), '{}') into v from unnest(p_months) m;
  n := cardinality(v);
  if n = 0 then
    return '';
  end if;
  v_first := v[1];
  v_last := v[n];
  v_span := (extract(year from v_last)::integer - extract(year from v_first)::integer) * 12
            + extract(month from v_last)::integer - extract(month from v_first)::integer + 1;
  if n = 1 then
    return private.capitalize(private.month_name(v_first) || ' ' || extract(year from v_first));
  end if;
  if v_span = n then
    if extract(year from v_first) = extract(year from v_last) then
      return private.capitalize(private.month_name(v_first) || case when n = 2 then ' et ' else ' à ' end
        || private.month_name(v_last) || ' ' || extract(year from v_last));
    end if;
    return private.capitalize(private.month_name(v_first) || ' ' || extract(year from v_first)
      || case when n = 2 then ' et ' else ' à ' end || private.month_name(v_last) || ' ' || extract(year from v_last));
  end if;
  for i in 1 .. n loop
    v_items := v_items || (private.month_name(v[i])
      || case when i = n or extract(year from v[i]) <> extract(year from v[i + 1]) then ' ' || extract(year from v[i]) else '' end);
  end loop;
  return private.capitalize(array_to_string(v_items[1:n - 1], ', ') || ' et ' || v_items[n]);
end;
$$;

-- 1000 → « 10 € », 1550 → « 15,50 € ».
create function private.euros(p_cents integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_cents % 100 = 0 then (p_cents / 100)::text
              else replace(to_char(p_cents / 100.0, 'FM9999990.00'), '.', ',') end || ' €';
$$;

-- « 31 décembre 2026 », « 1er mars 2027 ».
create function private.french_date(p_day date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when extract(day from p_day) = 1 then '1er' else extract(day from p_day)::text end
         || ' ' || private.month_name(p_day) || ' ' || extract(year from p_day);
$$;

create function private.method_label(p_method public.pay_method)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'carte' then 'par carte'
    when 'especes' then 'en espèces'
    when 'virement' then 'par virement'
    when 'cheque' then 'par chèque'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Où en est la cotisation d'un membre
-- ---------------------------------------------------------------------------

-- Tout ce qu'il faut pour afficher la cotisation d'un membre, à une date :
-- son statut, ses mois en retard, jusqu'où il a payé, et les mois de
-- l'année en cours (et de la suivante à partir de juillet).
--
-- status : a_jour, retard, pas_due (son type de membre ne paie pas),
-- pas_encore (avant le début officiel ou avant son arrivée).
-- Chaque mois : paye, retard, en_cours (le mois actuel, à payer avant sa
-- fin), a_venir, pas_du.
create function private.dues_state(p_member uuid, p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dues_settings;
  p public.profiles;
  v_day date := coalesce(p_day, private.today());
  v_cur date := date_trunc('month', coalesce(p_day, private.today()))::date;
  v_ex date := private.exercise_start(coalesce(p_day, private.today()));
  v_horizon date;
  v_paying boolean;
  v_from date;
  v_late date[] := '{}';
  v_first_unpaid date;
  v_paid_until date;
  v_status text;
  v_months jsonb;
begin
  select * into s from public.dues_settings;
  select * into p from public.profiles where id = p_member;
  if not found then
    return null;
  end if;

  -- À partir de juillet, on peut aussi payer l'année suivante.
  v_horizon := make_date(extract(year from v_ex)::integer + case when extract(month from v_day) in (7, 8) then 2 else 1 end, 8, 1);
  v_paying := p.status in ('actif', 'suspendu') and p.validated_at is not null and p.member_type = any (s.paying_types);
  if v_paying then
    v_from := greatest(s.start_month, date_trunc('month', p.validated_at at time zone 'Europe/Paris')::date);

    select coalesce(array_agg(g::date order by g), '{}') into v_late
    from generate_series(v_from, (v_cur - interval '1 month')::date, interval '1 month') g
    where not exists (select 1 from public.dues_coverage c where c.member_id = p_member and c.month = g::date);

    select min(g::date) into v_first_unpaid
    from generate_series(v_from, greatest(v_horizon, v_from), interval '1 month') g
    where not exists (select 1 from public.dues_coverage c where c.member_id = p_member and c.month = g::date);

    if v_first_unpaid is null then
      v_paid_until := (greatest(v_horizon, v_from) + interval '1 month' - interval '1 day')::date;
    elsif v_first_unpaid > v_from then
      v_paid_until := (v_first_unpaid - interval '1 day')::date;
    end if;
  end if;

  v_status := case
    when not v_paying then 'pas_due'
    when v_from > v_cur then 'pas_encore'
    when cardinality(v_late) > 0 then 'retard'
    else 'a_jour'
  end;

  select jsonb_agg(jsonb_build_object(
           'month', g::date,
           'state', case
             when c.month is not null then 'paye'
             when not v_paying or g::date < v_from then 'pas_du'
             when g::date < v_cur then 'retard'
             when g::date = v_cur then 'en_cours'
             else 'a_venir'
           end,
           'amount_cents', c.amount_cents,
           'payment_id', c.payment_id
         ) order by g)
  into v_months
  from generate_series(v_ex, v_horizon, interval '1 month') g
  left join public.dues_coverage c on c.member_id = p_member and c.month = g::date;

  return jsonb_build_object(
    'member_id', p.id,
    'first_name', p.first_name,
    'member_type', p.member_type,
    'paying', v_paying,
    'status', v_status,
    'today', v_day,
    'current_month', v_cur,
    'exercise_start', v_ex,
    'horizon', v_horizon,
    'start_month', s.start_month,
    'dues_from', v_from,
    'monthly_cents', s.monthly_cents,
    'solidarity_months', s.solidarity_months,
    'late', to_jsonb(v_late),
    'late_cents', cardinality(v_late) * s.monthly_cents,
    'first_unpaid', v_first_unpaid,
    'paid_until', v_paid_until,
    'solidarity_suspended', v_paying and cardinality(v_late) >= s.solidarity_months,
    'months', coalesce(v_months, '[]'::jsonb)
  );
end;
$$;

-- Les mois à payer jusqu'à p_until : à partir du plus ancien mois non payé,
-- sans trou, en sautant ceux qui le sont déjà.
create function private.months_to_pay(p_member uuid, p_until date)
returns date[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := private.dues_state(p_member);
  v_until date := date_trunc('month', p_until)::date;
  v_first date := (v ->> 'first_unpaid')::date;
  v_result date[];
begin
  if v is null or not (v ->> 'paying')::boolean then
    raise exception 'Il n''y a pas de cotisation à payer pour ce membre.' using errcode = '22023';
  end if;
  if v_until > (v ->> 'horizon')::date then
    raise exception 'On ne peut pas encore payer ce mois-là.' using errcode = '22023';
  end if;
  if v_first is null or v_until < v_first then
    raise exception 'Ces mois sont déjà payés.' using errcode = '22023';
  end if;
  select array_agg(g::date order by g) into v_result
  from generate_series(v_first, v_until, interval '1 month') g
  where not exists (select 1 from public.dues_coverage c where c.member_id = p_member and c.month = g::date);
  if cardinality(v_result) > 24 then
    raise exception 'Choisis 24 mois au plus.' using errcode = '22023';
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Écritures, quittances, cartes du compte AEGB
-- ---------------------------------------------------------------------------

-- Une écriture dans le journal financier, avec le numéro suivant. p_actor
-- null : écriture automatique (paiement HelloAsso).
create function private.add_ledger(
  p_date date,
  p_label text,
  p_category text,
  p_amount integer,
  p_method text,
  p_member uuid,
  p_member_name text,
  p_payment uuid,
  p_reverses bigint,
  p_reason text,
  p_note text,
  p_actor uuid
)
returns public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
  e public.ledger_entries;
  v_discreet boolean := p_actor is not null and private.is_guarantor(p_actor);
begin
  update private.ledger_counter set last = last + 1 returning last into v_number;
  insert into public.ledger_entries (
    number, entry_date, label, category, amount_cents, method, member_id, member_name,
    payment_id, reverses, reason, note, created_by, created_by_name
  ) values (
    v_number, p_date, p_label, p_category, p_amount, p_method, p_member, p_member_name,
    p_payment, p_reverses, p_reason, nullif(btrim(coalesce(p_note, '')), ''),
    case when v_discreet then null else p_actor end,
    case when p_actor is null then 'Automatique' else private.signature(p_actor) end
  )
  returning * into e;
  if v_discreet then
    insert into private.discreet_ledger (ledger_id, actor_id) values (e.id, p_actor);
  end if;
  return e;
end;
$$;

create function private.issue_receipt(p_payment public.dues_payments, p_paid_on date, p_reference text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from private.today())::integer;
  v_n integer;
  v_number text;
begin
  insert into private.receipt_counters (year, last) values (v_year, 1)
  on conflict (year) do update set last = private.receipt_counters.last + 1
  returning last into v_n;
  v_number := v_year || '-' || lpad(v_n::text, 4, '0');
  insert into public.dues_receipts (
    number, payment_id, member_id, member_name, member_type, months, monthly_cents,
    amount_cents, method, paid_on, reference
  )
  select v_number, p_payment.id, p_payment.member_id, p_payment.member_name,
         coalesce(p.member_type, 'etudiant'), p_payment.months, p_payment.monthly_cents,
         p_payment.amount_cents, p_payment.method, p_paid_on, p_reference
  from (select 1) x
  left join public.profiles p on p.id = p_payment.member_id;
  return v_number;
end;
$$;

-- Une carte du compte AEGB dans la conversation du membre : relance,
-- paiement reçu ou paiement annulé.
create function private.dues_message(p_member uuid, p_type text, p_body text, p_meta jsonb)
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
  values (v_conv, 'cotisation', true, p_body, coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('type', p_type));
  update public.conversations set last_message_at = now(), changed_at = clock_timestamp() where id = v_conv;
end;
$$;

-- Confirme un paiement : les mois passent en payé, l'écriture entre dans le
-- journal, la quittance est numérotée et part dans la conversation AEGB.
-- Sans effet si le paiement est déjà confirmé.
create function private.confirm_payment(p_payment uuid, p_paid_on date, p_reference text, p_actor uuid, p_send boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.dues_payments;
  e public.ledger_entries;
  v_covered integer;
  v_receipt text;
  v_state jsonb;
  v_label text;
  v_end text;
begin
  select * into v from public.dues_payments where id = p_payment for update;
  if not found then
    raise exception 'Ce paiement n''existe pas.' using errcode = 'P0002';
  end if;
  if v.status = 'confirme' then
    return jsonb_build_object('status', 'confirme', 'receipt', v.receipt_number, 'already', true);
  end if;
  if v.status = 'annule' then
    raise exception 'Ce paiement a été annulé.' using errcode = '22023';
  end if;

  insert into public.dues_coverage (member_id, month, payment_id, amount_cents)
  select v.member_id, m, v.id, v.monthly_cents from unnest(v.months) m
  where v.member_id is not null
  on conflict (member_id, month) do nothing;
  get diagnostics v_covered = row_count;

  v_label := private.months_label(v.months);
  e := private.add_ledger(
    p_paid_on,
    'Cotisation ' || lower(left(v_label, 1)) || substr(v_label, 2),
    'cotisation',
    v.amount_cents,
    case when v.method = 'carte' then 'helloasso' else v.method::text end,
    v.member_id,
    v.member_name,
    v.id,
    null,
    null,
    case
      when cardinality(v.months) - v_covered = 1 then 'Trop-perçu : 1 mois était déjà payé.'
      when v_covered < cardinality(v.months) then 'Trop-perçu : ' || (cardinality(v.months) - v_covered) || ' mois étaient déjà payés.'
      else v.note
    end,
    p_actor
  );
  v_receipt := private.issue_receipt(v, p_paid_on, p_reference);

  update public.dues_payments
  set status = 'confirme', confirmed_at = now(), paid_on = p_paid_on, reference = coalesce(p_reference, reference),
      ledger_id = e.id, receipt_number = v_receipt
  where id = v.id;

  if p_send and v.member_id is not null then
    v_state := private.dues_state(v.member_id);
    v_end := case
      when v_state ->> 'status' = 'retard' then 'Il reste ' || private.euros((v_state ->> 'late_cents')::integer) || ' en retard.'
      when v_state ->> 'paid_until' is not null then 'Tu es à jour jusqu''au ' || private.french_date((v_state ->> 'paid_until')::date) || '.'
      else 'Tu es à jour.'
    end;
    perform private.dues_message(
      v.member_id,
      'recu',
      v_label || ', ' || private.euros(v.amount_cents) || ', ' || private.method_label(v.method) || '. ' || v_end,
      jsonb_build_object('receipt', v_receipt, 'months', to_jsonb(v.months), 'amount_cents', v.amount_cents, 'method', v.method)
    );
  end if;

  return jsonb_build_object('status', 'confirme', 'receipt', v_receipt, 'number', e.number);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ce que voit le membre
-- ---------------------------------------------------------------------------

create function public.my_dues()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  return private.dues_state(auth.uid());
end;
$$;

-- Prépare un paiement par carte jusqu'au mois choisi. Le montant vient de
-- la base. Le paiement ne compte qu'une fois confirmé par HelloAsso.
create function public.start_card_payment(p_until date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_months date[];
  v_monthly integer;
  v_id uuid;
begin
  perform private.require_member();
  v_state := private.dues_state(auth.uid());
  if v_state ->> 'status' = 'pas_due' then
    raise exception 'Ta cotisation n''est pas due.' using errcode = '22023';
  end if;
  if v_state ->> 'status' = 'pas_encore' then
    raise exception 'Les cotisations commencent le %.', private.french_date((v_state ->> 'dues_from')::date) using errcode = '22023';
  end if;
  v_months := private.months_to_pay(auth.uid(), p_until);
  v_monthly := (v_state ->> 'monthly_cents')::integer;

  -- Les paiements commencés il y a longtemps et jamais finis sont abandonnés.
  update public.dues_payments set status = 'echec'
  where member_id = auth.uid() and status = 'en_attente' and method = 'carte' and created_at < now() - interval '2 hours';

  insert into public.dues_payments (member_id, member_name, method, months, monthly_cents, amount_cents)
  values (auth.uid(), private.full_name(auth.uid()), 'carte', v_months, v_monthly, v_monthly * cardinality(v_months))
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'months', to_jsonb(v_months),
    'label', private.months_label(v_months),
    'amount_cents', v_monthly * cardinality(v_months)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ce que fait le bureau
-- ---------------------------------------------------------------------------

-- La cotisation de chaque membre validé, pour la matrice des 12 mois.
create function public.dues_matrix()
returns table (
  member_id uuid,
  first_name text,
  last_name text,
  avatar_path text,
  member_type public.member_type,
  status public.member_status,
  dues jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require('tresorerie', 'lecture');
  return query
  select p.id, p.first_name, p.last_name, p.avatar_path, p.member_type, p.status, private.dues_state(p.id)
  from public.profiles p
  where p.status in ('actif', 'suspendu') and p.validated_at is not null
  order by p.first_name, p.last_name;
end;
$$;

-- La cotisation d'un membre, pour sa fiche ou l'encaissement.
create function public.member_dues(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require('tresorerie', 'lecture');
  return private.dues_state(p_member);
end;
$$;

-- Le bureau encaisse des espèces, un virement ou un chèque, jusqu'au mois
-- choisi. La quittance part dans la conversation AEGB si p_send.
create function public.record_payment(
  p_member uuid,
  p_until date,
  p_method public.pay_method,
  p_paid_on date default null,
  p_note text default null,
  p_send boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_months date[];
  v_monthly integer;
  v_id uuid;
  v_paid_on date := coalesce(p_paid_on, private.today());
  v_result jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require('tresorerie');
  if p_method = 'carte' then
    raise exception 'Les paiements par carte passent par HelloAsso.' using errcode = '22023';
  end if;
  if v_paid_on > private.today() or v_paid_on < private.today() - 366 then
    raise exception 'Choisis une date de paiement dans l''année écoulée.' using errcode = '22023';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'La note dépasse 300 caractères.' using errcode = '22023';
  end if;
  v_state := private.dues_state(p_member);
  if v_state is null then
    raise exception 'Ce membre n''existe pas.' using errcode = 'P0002';
  end if;
  v_months := private.months_to_pay(p_member, p_until);
  v_monthly := (v_state ->> 'monthly_cents')::integer;

  insert into public.dues_payments (member_id, member_name, method, months, monthly_cents, amount_cents, note)
  values (p_member, private.full_name(p_member), p_method, v_months, v_monthly, v_monthly * cardinality(v_months), v_note)
  returning id into v_id;

  v_result := private.confirm_payment(v_id, v_paid_on, null, auth.uid(), coalesce(p_send, true));
  perform private.log_activity(
    'argent', 'encaissement',
    'a encaissé ' || private.euros(v_monthly * cardinality(v_months)) || ' ' || private.method_label(p_method)
      || ' (' || lower(private.months_label(v_months)) || ')',
    p_member,
    jsonb_build_object('receipt', v_result ->> 'receipt', 'number', v_result -> 'number')
  );
  return v_result || jsonb_build_object('payment', v_id, 'amount_cents', v_monthly * cardinality(v_months));
end;
$$;

-- Une écriture qui n'est pas une cotisation : dépense, don, subvention,
-- frais de banque, solde de départ. p_amount_cents : négatif pour une sortie.
create function public.add_ledger_entry(
  p_date date,
  p_label text,
  p_category text,
  p_amount_cents integer,
  p_method text,
  p_member uuid default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  e public.ledger_entries;
begin
  perform private.require('tresorerie');
  if p_category in ('cotisation', 'correction') then
    raise exception 'Une cotisation s''encaisse depuis l''écran Cotisations, une correction depuis l''écriture à corriger.' using errcode = '22023';
  end if;
  if p_method = 'helloasso' then
    raise exception 'Les paiements HelloAsso s''écrivent tout seuls.' using errcode = '22023';
  end if;
  if char_length(v_label) < 2 then
    raise exception 'Écris un libellé.' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) = 0 then
    raise exception 'Indique un montant.' using errcode = '22023';
  end if;
  if p_date is null or p_date > private.today() or p_date < private.today() - 366 then
    raise exception 'Choisis une date dans l''année écoulée.' using errcode = '22023';
  end if;
  if p_member is not null and not exists (select 1 from public.profiles where id = p_member) then
    raise exception 'Ce membre n''existe pas.' using errcode = 'P0002';
  end if;

  e := private.add_ledger(p_date, v_label, p_category, p_amount_cents, p_method, p_member,
                          private.full_name(p_member), null, null, null, p_note, auth.uid());
  perform private.log_activity(
    'argent', 'ecriture',
    'a ajouté l''écriture n° ' || lpad(e.number::text, 3, '0') || ' : ' || v_label || ' ('
      || case when p_amount_cents > 0 then '+' else '−' end || private.euros(abs(p_amount_cents)) || ')',
    p_member,
    jsonb_build_object('number', e.number)
  );
  return e.number;
end;
$$;

-- La contre-passation : une écriture inverse qui cite l'originale. Pour une
-- cotisation, les mois redeviennent dus et la quittance est annulée.
create function public.reverse_ledger_entry(p_entry bigint, p_reason text, p_note text default null, p_notify boolean default true)
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
          || v_reason_label || '. Ces mois sont de nouveau à payer.',
        jsonb_build_object('receipt', v.receipt_number, 'months', to_jsonb(v.months), 'amount_cents', v.amount_cents, 'reason', p_reason)
      );
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

create function public.save_dues_settings(
  p_monthly_cents integer,
  p_start_month date,
  p_paying public.member_type[],
  p_solidarity_months integer,
  p_reminders boolean,
  p_org_address text default null,
  p_org_rna text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.dues_settings;
  v_changes text[] := '{}';
begin
  perform private.require('tresorerie');
  if p_monthly_cents is null or p_monthly_cents < 100 or p_monthly_cents > 100000 then
    raise exception 'Le montant doit aller de 1 € à 1 000 € par mois.' using errcode = '22023';
  end if;
  if p_start_month is null or extract(day from p_start_month) <> 1 then
    raise exception 'Les cotisations commencent un 1er du mois.' using errcode = '22023';
  end if;
  if p_solidarity_months is null or p_solidarity_months not between 1 and 12 then
    raise exception 'Choisis entre 1 et 12 mois pour le droit de solidarité.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_org_address, ''))) > 200 or char_length(btrim(coalesce(p_org_rna, ''))) > 40 then
    raise exception 'L''adresse ou le numéro RNA est trop long.' using errcode = '22023';
  end if;

  select * into o from public.dues_settings for update;
  if o.monthly_cents <> p_monthly_cents then v_changes := v_changes || (private.euros(p_monthly_cents) || ' par mois'); end if;
  if o.start_month <> p_start_month then v_changes := v_changes || ('début le ' || private.french_date(p_start_month)); end if;
  if o.paying_types is distinct from coalesce(p_paying, '{}') then v_changes := v_changes || 'qui paie'::text; end if;
  if o.solidarity_months <> p_solidarity_months then v_changes := v_changes || ('solidarité à ' || p_solidarity_months || ' mois'); end if;
  if o.reminders <> coalesce(p_reminders, true) then
    v_changes := v_changes || (case when coalesce(p_reminders, true) then 'relance activée' else 'relance coupée' end);
  end if;

  update public.dues_settings
  set monthly_cents = p_monthly_cents,
      start_month = p_start_month,
      paying_types = coalesce((select array_agg(distinct t) from unnest(p_paying) t), '{}'),
      solidarity_months = p_solidarity_months,
      reminders = coalesce(p_reminders, true),
      org_address = nullif(btrim(coalesce(p_org_address, '')), ''),
      org_rna = nullif(btrim(coalesce(p_org_rna, '')), ''),
      updated_at = now(),
      updated_by_name = private.signature(auth.uid());

  perform private.log_activity(
    'argent', 'reglages_cotisation',
    'a changé les réglages de la cotisation' || case when cardinality(v_changes) > 0 then ' (' || array_to_string(v_changes, ', ') || ')' else '' end
  );
end;
$$;

-- Pour le titulaire du poste d'admin numérique : qui a vraiment saisi les
-- écritures signées « Le bureau ».
create function public.discreet_ledger_authors(p_ids bigint[])
returns table (ledger_id bigint, actor_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_guarantor(auth.uid()) and public.is_active_member()) then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
  return query
  select d.ledger_id, private.full_name(d.actor_id)
  from private.discreet_ledger d
  where d.ledger_id = any (p_ids);
end;
$$;

-- Pendant les essais : vider les paiements, les quittances et le journal
-- financier. Impossible une fois le journal verrouillé pour le lancement.
create function public.clear_finances()
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
  perform set_config('aegb.clear_finances', 'on', true);
  delete from public.ledger_entries where reverses is not null;
  delete from public.ledger_entries where id is not null;
  get diagnostics n = row_count;
  perform set_config('aegb.clear_finances', 'off', true);
  delete from public.dues_payments where id is not null;
  delete from public.messages where kind = 'cotisation';
  delete from private.discreet_ledger where ledger_id is not null;
  delete from private.dues_reminders where member_id is not null;
  delete from private.receipt_counters where year is not null;
  update private.ledger_counter set last = 0;
  perform private.log_activity('argent', 'vider_finances', 'a vidé le journal financier des essais');
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paiement par carte : réservé à la fonction serveur HelloAsso
-- ---------------------------------------------------------------------------

-- Ce qu'il faut pour créer le paiement chez HelloAsso.
create function public.helloasso_payment(p_payment uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', v.id,
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
  where v.id = p_payment;
$$;

create function public.helloasso_attach(p_payment uuid, p_intent bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dues_payments set checkout_intent_id = p_intent
  where id = p_payment and method = 'carte' and status = 'en_attente';
  if not found then
    raise exception 'Ce paiement n''attend plus.' using errcode = '22023';
  end if;
end;
$$;

-- HelloAsso a confirmé le paiement (vérifié auprès d'HelloAsso par la
-- fonction serveur, jamais sur la seule parole du téléphone).
create function public.helloasso_confirm(p_payment uuid, p_reference text, p_paid_on date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.dues_payments where id = p_payment and method = 'carte') then
    raise exception 'Ce paiement n''existe pas.' using errcode = 'P0002';
  end if;
  return private.confirm_payment(p_payment, coalesce(p_paid_on, private.today()), p_reference, null, true);
end;
$$;

create function public.helloasso_fail(p_payment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.dues_payments set status = 'echec'
  where id = p_payment and method = 'carte' and status = 'en_attente';
$$;

-- ---------------------------------------------------------------------------
-- La relance du 1er du mois
-- ---------------------------------------------------------------------------

-- Un message d'AEGB à chaque membre en retard, une seule fois par mois.
create function private.send_dues_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', private.today())::date;
  r record;
  v_state jsonb;
  v_late date[];
  n integer := 0;
begin
  if not (select reminders from public.dues_settings) then
    return 0;
  end if;
  for r in
    select p.id, p.first_name
    from public.profiles p, public.dues_settings s
    where p.status = 'actif' and p.validated_at is not null and p.member_type = any (s.paying_types)
      and not exists (select 1 from private.dues_reminders d where d.member_id = p.id and d.month = v_month)
  loop
    v_state := private.dues_state(r.id);
    if v_state ->> 'status' <> 'retard' then
      continue;
    end if;
    select array_agg(value::date order by value::date) into v_late from jsonb_array_elements_text(v_state -> 'late');
    insert into private.dues_reminders (member_id, month) values (r.id, v_month);
    perform private.dues_message(
      r.id,
      'relance',
      'Bonjour ' || r.first_name || ', ta cotisation de ' || lower(private.months_label(v_late))
        || ' n''est pas encore réglée, soit ' || private.euros((v_state ->> 'late_cents')::integer) || '.',
      jsonb_build_object('months', to_jsonb(v_late), 'amount_cents', (v_state ->> 'late_cents')::integer)
    );
    n := n + 1;
  end loop;
  if n > 0 then
    perform private.log_activity('argent', 'relance', 'a envoyé le rappel de cotisation à ' || n || ' membre' || case when n > 1 then 's' else '' end, null, '{}'::jsonb, null);
  end if;
  return n;
end;
$$;

-- Appelée chaque heure le 1er du mois : la relance part à partir de 9 h.
create function private.dues_reminder_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if extract(day from now() at time zone 'Europe/Paris') = 1
     and extract(hour from now() at time zone 'Europe/Paris') >= 9 then
    perform private.send_dues_reminders();
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('aegb-relance-cotisations', '5 * 1 * *', 'select private.dues_reminder_tick()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Le bouton « Payer ma cotisation » dans le message de bienvenue
-- ---------------------------------------------------------------------------

create or replace function public.save_welcome(p_text text, p_actions text[], p_announce boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  perform private.require('bienvenue');
  if v_text = '' then
    raise exception 'Écris le message de bienvenue.' using errcode = '22023';
  end if;
  if char_length(v_text) > 2000 then
    raise exception 'Le message dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_actions, '{}')) a where a not in ('charte', 'profil', 'cotisation')) then
    raise exception 'Ce bouton n''existe pas encore.' using errcode = '22023';
  end if;
  update public.aegb_settings
  set welcome_text = v_text,
      welcome_actions = coalesce((select array_agg(distinct a) from unnest(p_actions) a), '{}'),
      announce_arrival = coalesce(p_announce, true),
      updated_at = now(),
      updated_by_name = private.signature(auth.uid());
  perform private.log_activity('reglages', 'bienvenue', 'a modifié le message de bienvenue');
end;
$$;

-- ---------------------------------------------------------------------------
-- Règles d'accès
-- ---------------------------------------------------------------------------

alter table public.dues_settings enable row level security;
alter table public.dues_payments enable row level security;
alter table public.dues_coverage enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.dues_receipts enable row level security;

revoke all on public.dues_settings, public.dues_payments, public.dues_coverage, public.ledger_entries, public.dues_receipts
  from anon, authenticated;

-- Tout passe par les fonctions ci-dessus : l'appli ne fait que lire.
grant select on public.dues_settings, public.dues_payments, public.dues_coverage, public.ledger_entries, public.dues_receipts
  to authenticated;

create policy "Réglages de la cotisation visibles par les membres actifs"
  on public.dues_settings for select
  to authenticated
  using ((select public.is_active_member()));

create policy "Paiements visibles par le membre et la trésorerie"
  on public.dues_payments for select
  to authenticated
  using (member_id = (select auth.uid()) or (select public.can('tresorerie', 'lecture')));

create policy "Mois payés visibles par le membre et la trésorerie"
  on public.dues_coverage for select
  to authenticated
  using (member_id = (select auth.uid()) or (select public.can('tresorerie', 'lecture')));

create policy "Quittances visibles par le membre et la trésorerie"
  on public.dues_receipts for select
  to authenticated
  using (member_id = (select auth.uid()) or (select public.can('tresorerie', 'lecture')));

create policy "Journal financier visible par la trésorerie"
  on public.ledger_entries for select
  to authenticated
  using ((select public.can('tresorerie', 'lecture')));

-- ---------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.my_dues(),
  public.start_card_payment(date),
  public.dues_matrix(),
  public.member_dues(uuid),
  public.record_payment(uuid, date, public.pay_method, date, text, boolean),
  public.add_ledger_entry(date, text, text, integer, text, uuid, text),
  public.reverse_ledger_entry(bigint, text, text, boolean),
  public.save_dues_settings(integer, date, public.member_type[], integer, boolean, text, text),
  public.discreet_ledger_authors(bigint[]),
  public.clear_finances(),
  public.save_welcome(text, text[], boolean),
  public.helloasso_payment(uuid),
  public.helloasso_attach(uuid, bigint),
  public.helloasso_confirm(uuid, text, date),
  public.helloasso_fail(uuid)
  from public, anon;

grant execute on function
  public.my_dues(),
  public.start_card_payment(date),
  public.dues_matrix(),
  public.member_dues(uuid),
  public.record_payment(uuid, date, public.pay_method, date, text, boolean),
  public.add_ledger_entry(date, text, text, integer, text, uuid, text),
  public.reverse_ledger_entry(bigint, text, text, boolean),
  public.save_dues_settings(integer, date, public.member_type[], integer, boolean, text, text),
  public.discreet_ledger_authors(bigint[]),
  public.clear_finances(),
  public.save_welcome(text, text[], boolean)
  to authenticated;

-- La fonction serveur HelloAsso seule confirme un paiement par carte.
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
