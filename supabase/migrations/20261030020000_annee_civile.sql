-- Lot 4 : l'année de cotisation va du 1er janvier au 31 décembre, comme
-- l'exercice comptable (article 27 des statuts) et le mandat du bureau
-- (article 16). L'assemblée générale de décembre fixe le montant de l'année
-- suivante (article 8) : l'année suivante s'ouvre au paiement le 1er décembre.
-- Décision de Cronos du 30 octobre 2026.

-- Le 1er janvier de l'année de cotisation qui contient ce jour.
create or replace function private.exercise_start(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(extract(year from p_day)::integer, 1, 1);
$$;

create or replace function private.dues_state(p_member uuid, p_day date default null)
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

  -- En décembre, le mois de l'assemblée générale, on peut aussi payer l'année suivante.
  v_horizon := make_date(extract(year from v_ex)::integer + case when extract(month from v_day) = 12 then 1 else 0 end, 12, 1);
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
    'late', to_jsonb(v_late),
    'late_cents', cardinality(v_late) * s.monthly_cents,
    'first_unpaid', v_first_unpaid,
    'paid_until', v_paid_until,
    'votes', p.member_type = 'etudiant',
    'vote_suspended', v_paying and p.member_type = 'etudiant' and cardinality(v_late) > 0,
    'radiation_possible', v_paying and cardinality(v_late) >= 3
      and exists (select 1 from private.dues_reminders d where d.member_id = p_member and d.month > v_late[1]),
    'months', coalesce(v_months, '[]'::jsonb)
  );
end;
$$;

-- Le message d'annulation s'accorde quand un seul mois est annulé.
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
          || v_reason_label || '.'
          || case when cardinality(v.months) > 1 then ' Ces mois sont de nouveau à payer.' else ' Ce mois est de nouveau à payer.' end,
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

revoke all on function private.exercise_start(date), private.dues_state(uuid, date) from public, anon, authenticated;
