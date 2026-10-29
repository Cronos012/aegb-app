-- Lot 1, retouches demandées par Cronos le 29 octobre 2026.
--
-- 1. Les droits de l'admin numérique restent secrets. Son poste apparaît
--    comme les autres, mais personne d'autre que lui ne voit qu'il a accès
--    à tout ni qu'il ne peut pas être retiré.
-- 2. Le titulaire de ce poste peut se nommer d'un seul prénom. Tous les
--    autres membres gardent prénom et nom obligatoires.

-- ---------------------------------------------------------------------------
-- 1. Droits de l'admin numérique
-- ---------------------------------------------------------------------------

update public.bureau_roles
set description = 'Appli et outils numériques'
where code = 'admin_numerique';

-- « locked » trahirait le poste, et « assigned_by » montrerait qui nomme les
-- autres : ces deux colonnes ne sont plus lisibles depuis l'appli.
revoke select on public.bureau_roles from authenticated;
grant select (code, label, description, sort_order, holder_id, assigned_at)
  on public.bureau_roles to authenticated;

-- Mon poste et les écrans qu'il m'ouvre. Chacun ne voit que les siens.
create function public.my_bureau()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', r.code,
    'guarantor', r.locked,
    'access', coalesce((
      select jsonb_object_agg(s.code, case when r.locked then 'complet' else rp.level::text end)
      from public.bureau_screens s
      left join public.role_permissions rp on rp.role_code = r.code and rp.screen_code = s.code
      where r.locked or rp.level is not null
    ), '{}'::jsonb)
  )
  from public.bureau_roles r
  join public.profiles p on p.id = r.holder_id and p.status = 'actif'
  where r.holder_id = (select auth.uid());
$$;

revoke execute on function public.my_bureau() from public, anon;
grant execute on function public.my_bureau() to authenticated;

-- Les refus ne nomment plus le poste.
create or replace function public.suspend_member(p_member uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform private.require('membres');
  if p_member = auth.uid() then
    raise exception 'Tu ne peux pas suspendre ton propre compte.' using errcode = '22023';
  end if;
  if exists (select 1 from public.bureau_roles where holder_id = p_member and locked) then
    raise exception 'Ce compte ne peut pas être suspendu.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'Le motif de la suspension est obligatoire.' using errcode = '22023';
  end if;
  v := private.get_profile_for_update(p_member);
  if v.status <> 'actif' then
    raise exception 'Seul un membre actif peut être suspendu.' using errcode = '22023';
  end if;

  update public.profiles
  set status = 'suspendu', suspended_at = now(), suspended_by = auth.uid(), suspension_reason = v_reason
  where id = p_member;

  perform private.log_activity('membres', 'suspension',
    'a suspendu ' || private.full_name(p_member), p_member,
    jsonb_build_object('motif', v_reason));
end;
$$;

create or replace function public.set_role_permission(p_role text, p_screen text, p_level public.access_level)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bureau_roles;
  s public.bureau_screens;
  v_before public.access_level;
begin
  perform private.require('postes');
  select * into r from public.bureau_roles where code = p_role;
  select * into s from public.bureau_screens where code = p_screen;
  if r.code is null or s.code is null then
    raise exception 'Poste ou écran inconnu.' using errcode = 'P0002';
  end if;
  if r.locked then
    raise exception 'Les droits de ce poste ne changent pas.' using errcode = '22023';
  end if;

  select level into v_before from public.role_permissions where role_code = p_role and screen_code = p_screen;
  if v_before is not distinct from p_level then
    return;
  end if;

  if p_level is null then
    delete from public.role_permissions where role_code = p_role and screen_code = p_screen;
  else
    insert into public.role_permissions (role_code, screen_code, level)
    values (p_role, p_screen, p_level)
    on conflict (role_code, screen_code) do update set level = excluded.level;
  end if;

  perform private.log_activity('postes', 'droits',
    case
      when p_level is null then 'a retiré l''accès à « ' || s.label || ' » au poste ' || r.label
      when p_level = 'lecture' then 'a donné l''accès en lecture à « ' || s.label || ' » au poste ' || r.label
      else 'a donné l''accès complet à « ' || s.label || ' » au poste ' || r.label
    end,
    null,
    jsonb_build_object('poste', r.code, 'ecran', s.code, 'avant', v_before, 'apres', p_level));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Un seul prénom pour le titulaire du poste d'admin numérique
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint profiles_last_name_check;
alter table public.profiles add constraint profiles_last_name_check check (char_length(last_name) <= 60);

create function private.require_last_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.last_name := btrim(new.last_name);
  if new.last_name = '' and not exists (
    select 1 from public.bureau_roles where holder_id = new.id and locked
  ) then
    raise exception 'Le prénom et le nom sont obligatoires.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.require_last_name() from public, anon, authenticated;

create trigger profiles_require_last_name
  before insert or update of last_name on public.profiles
  for each row execute function private.require_last_name();

-- Sans nom, pas d'espace en trop dans le journal.
create or replace function private.full_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select btrim(first_name || ' ' || last_name) from public.profiles where id = p_id;
$$;
