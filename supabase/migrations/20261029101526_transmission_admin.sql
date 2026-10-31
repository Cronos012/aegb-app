-- Le titulaire du poste d'admin numérique le transmet lui-même à son
-- successeur, qui reçoit tout de suite les mêmes droits. Personne d'autre ne
-- peut toucher à ce poste depuis l'appli.

create function public.transfer_guarantor(p_member uuid)
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

  update public.bureau_roles
  set holder_id = p_member, assigned_at = now(), assigned_by = auth.uid()
  where code = r.code;

  perform private.log_activity('postes', 'attribution_poste',
    'a transmis le poste ' || r.label || ' à ' || private.full_name(p_member), p_member,
    jsonb_build_object('poste', r.code));
end;
$$;

revoke execute on function public.transfer_guarantor(uuid) from public, anon;
grant execute on function public.transfer_guarantor(uuid) to authenticated;
