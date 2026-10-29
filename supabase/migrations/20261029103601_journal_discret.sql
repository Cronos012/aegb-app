-- Ce que fait le titulaire du poste d'admin numérique apparaît au nom de
-- « Le bureau » pour les autres (choix de Cronos, 29 octobre 2026). Son vrai
-- nom reste noté à part, et lui seul (ou son successeur) peut le relire.
--
-- Le masque se pose à l'écriture : les tables lisibles depuis l'appli ne
-- contiennent pas son identité pour ces actions. Ce qu'il fait pour
-- lui-même (inscription, confirmation d'email) garde son nom. Les lignes du
-- journal écrites avant cette migration ne changent pas.

create function private.is_guarantor(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bureau_roles where holder_id = p_id and locked);
$$;

revoke all on function private.is_guarantor(uuid) from public, anon, authenticated;

-- Le vrai auteur des lignes du journal signées « Le bureau ».
create table private.discreet_actors (
  log_id bigint primary key,
  actor_id uuid not null,
  actor_name text not null
);

revoke all on private.discreet_actors from public, anon, authenticated;

-- Journal : la ligne est signée « Le bureau », le vrai auteur part à côté.
-- L'identifiant de la ligne existe déjà dans un déclencheur BEFORE.
create function private.activity_log_discreet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_id is not null
     and new.subject_id is distinct from new.actor_id
     and private.is_guarantor(new.actor_id) then
    insert into private.discreet_actors (log_id, actor_id, actor_name)
    values (new.id, new.actor_id, new.actor_name);
    new.actor_id := null;
    new.actor_name := 'Le bureau';
  end if;
  return new;
end;
$$;

revoke all on function private.activity_log_discreet() from public, anon, authenticated;

create trigger activity_log_discreet
  before insert on public.activity_log
  for each row execute function private.activity_log_discreet();

-- Fiches : pas de « validé par », « refusé par » ou « suspendu par » à son nom.
-- Le vrai auteur reste dans le journal.
create function private.profiles_discreet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_guarantor(new.validated_by) then new.validated_by := null; end if;
  if private.is_guarantor(new.refused_by) then new.refused_by := null; end if;
  if private.is_guarantor(new.suspended_by) then new.suspended_by := null; end if;
  return new;
end;
$$;

revoke all on function private.profiles_discreet() from public, anon, authenticated;

create trigger profiles_discreet
  before update of validated_by, refused_by, suspended_by on public.profiles
  for each row execute function private.profiles_discreet();

-- Avertissements : donnés par « Le bureau ».
create function private.member_warnings_discreet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_guarantor(new.given_by) then
    new.given_by := null;
    new.given_by_name := 'Le bureau';
  end if;
  return new;
end;
$$;

revoke all on function private.member_warnings_discreet() from public, anon, authenticated;

create trigger member_warnings_discreet
  before insert on public.member_warnings
  for each row execute function private.member_warnings_discreet();

-- Le titulaire relit les vrais noms derrière « Le bureau ».
create function public.discreet_authors(p_ids bigint[])
returns table (log_id bigint, actor_name text)
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
  select d.log_id, coalesce(private.full_name(d.actor_id), d.actor_name)
  from private.discreet_actors d
  where d.log_id = any (p_ids);
end;
$$;

revoke execute on function public.discreet_authors(bigint[]) from public, anon;
grant execute on function public.discreet_authors(bigint[]) to authenticated;

-- La transmission se note avant le changement de titulaire, pour être signée
-- « Le bureau », et avec les mêmes mots qu'une nomination ordinaire.
create or replace function public.transfer_guarantor(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bureau_roles;
  v public.profiles;
begin
  select * into r from public.bureau_roles where locked for update;
  if r.holder_id is distinct from auth.uid() or not public.is_active_member() then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
  if p_member = auth.uid() then
    return;
  end if;
  v := private.get_profile_for_update(p_member);
  if v.status <> 'actif' then
    raise exception 'Seul un membre validé peut recevoir ce poste.' using errcode = '22023';
  end if;
  if exists (select 1 from public.bureau_roles where holder_id = p_member) then
    raise exception 'Ce membre occupe déjà un autre poste. Retire-le d''abord de ce poste.' using errcode = '22023';
  end if;

  perform private.log_activity('postes', 'attribution_poste',
    'a nommé ' || private.full_name(p_member) || ' au poste ' || r.label, p_member,
    jsonb_build_object('poste', r.code));

  update public.bureau_roles
  set holder_id = p_member, assigned_at = now(), assigned_by = auth.uid()
  where code = r.code;
end;
$$;
