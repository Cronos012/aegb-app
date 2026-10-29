-- Pendant les essais, le titulaire du poste d'admin numérique peut vider le
-- journal (demande de Cronos, 29 octobre 2026). Au lancement officiel, il le
-- verrouille : plus personne ne peut alors le vider, lui compris, et ce
-- verrou ne s'enlève pas.

create table private.journal_lock (
  only_row boolean primary key default true check (only_row),
  locked_at timestamptz,
  locked_by uuid
);

insert into private.journal_lock default values;

revoke all on private.journal_lock from public, anon, authenticated;

create function private.journal_lock_is_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is not null then
    raise exception 'Le journal est verrouillé pour de bon.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger journal_lock_is_final
  before update or delete on private.journal_lock
  for each row execute function private.journal_lock_is_final();

create function public.journal_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select locked_at is not null from private.journal_lock;
$$;

revoke execute on function public.journal_locked() from public, anon;
grant execute on function public.journal_locked() to authenticated;

-- Le journal reste sans modification possible. Seul clear_journal() peut
-- l'effacer, et seulement avant le verrouillage.
create or replace function private.activity_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('aegb.clear_journal', true) = 'on'
     and not exists (select 1 from private.journal_lock where locked_at is not null) then
    return old;
  end if;
  raise exception 'Le journal d''activité ne peut être ni modifié ni effacé.' using errcode = '42501';
end;
$$;

create function public.clear_journal()
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
    raise exception 'Le journal est verrouillé depuis le lancement : il ne peut plus être vidé.' using errcode = '22023';
  end if;

  perform set_config('aegb.clear_journal', 'on', true);
  delete from public.activity_log where id is not null;
  get diagnostics n = row_count;
  perform set_config('aegb.clear_journal', 'off', true);
  delete from private.discreet_actors where log_id is not null;
  return n;
end;
$$;

revoke execute on function public.clear_journal() from public, anon;
grant execute on function public.clear_journal() to authenticated;

create function public.lock_journal()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_guarantor(auth.uid()) and public.is_active_member()) then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
  update private.journal_lock set locked_at = now(), locked_by = auth.uid() where locked_at is null;
  if found then
    perform private.log_activity('reglages', 'verrou_journal', 'a rendu le journal ineffaçable');
  end if;
end;
$$;

revoke execute on function public.lock_journal() from public, anon;
grant execute on function public.lock_journal() to authenticated;
