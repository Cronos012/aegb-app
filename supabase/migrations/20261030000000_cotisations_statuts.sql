-- Lot 4 : la cotisation suit les statuts de l'AEGB.
--
-- * La solidarité (article 30) est une aide ponctuelle et facultative : ce
--   n'est ni un droit ni la contrepartie de la cotisation. Le réglage
--   « droit de solidarité » disparaît.
-- * Le retard suspend le droit de vote et l'éligibilité d'un membre actif
--   (article 32) : dès qu'un mois passé n'est pas payé. Seuls les étudiants
--   (membres actifs) votent (article 7).
-- * Après trois mois de retard et un rappel écrit resté sans effet, le bureau
--   peut radier le membre (article 32). La relance du 1er du mois est ce
--   rappel écrit.

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

create or replace function private.send_dues_reminders()
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
        || ' n''est pas encore réglée, soit ' || private.euros((v_state ->> 'late_cents')::integer) || '.'
        || case when (v_state ->> 'votes')::boolean
             then ' Tant qu''elle ne l''est pas, ton droit de vote et ton éligibilité au bureau sont suspendus (article 32 des statuts).'
             else '' end,
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

drop function public.save_dues_settings(integer, date, public.member_type[], integer, boolean, text, text);

create function public.save_dues_settings(
  p_monthly_cents integer,
  p_start_month date,
  p_paying public.member_type[],
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
  if char_length(btrim(coalesce(p_org_address, ''))) > 200 or char_length(btrim(coalesce(p_org_rna, ''))) > 40 then
    raise exception 'L''adresse ou le numéro RNA est trop long.' using errcode = '22023';
  end if;

  select * into o from public.dues_settings for update;
  if o.monthly_cents <> p_monthly_cents then v_changes := v_changes || (private.euros(p_monthly_cents) || ' par mois'); end if;
  if o.start_month <> p_start_month then v_changes := v_changes || ('début le ' || private.french_date(p_start_month)); end if;
  if o.paying_types is distinct from coalesce(p_paying, '{}') then v_changes := v_changes || 'qui paie'::text; end if;
  if o.reminders <> coalesce(p_reminders, true) then
    v_changes := v_changes || (case when coalesce(p_reminders, true) then 'relance activée' else 'relance coupée' end);
  end if;

  update public.dues_settings
  set monthly_cents = p_monthly_cents,
      start_month = p_start_month,
      paying_types = coalesce((select array_agg(distinct t) from unnest(p_paying) t), '{}'),
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

alter table public.dues_settings drop column solidarity_months;

revoke all on function private.dues_state(uuid, date), private.send_dues_reminders() from public, anon, authenticated;
revoke execute on function public.save_dues_settings(integer, date, public.member_type[], boolean, text, text) from public, anon;
grant execute on function public.save_dues_settings(integer, date, public.member_type[], boolean, text, text) to authenticated;
