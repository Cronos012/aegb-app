-- Lot 1, socle : membres, postes du bureau, droits, journal d'activité.
--
-- Principes :
-- * un membre ne change jamais lui-même son statut, son type ou son poste :
--   ces changements passent par des fonctions qui vérifient les droits ;
-- * les droits viennent du poste occupé et sont rangés dans role_permissions ;
-- * le journal d'activité n'accepte que des ajouts.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.member_type as enum ('etudiant', 'alumni', 'sympathisant', 'honneur');
create type public.member_status as enum ('en_attente', 'actif', 'refuse', 'suspendu');
create type public.access_level as enum ('lecture', 'complet');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.charter_versions (
  version integer primary key,
  rules jsonb not null,
  published_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  member_type public.member_type not null default 'etudiant',
  status public.member_status not null default 'en_attente',
  bio text check (char_length(bio) <= 160),
  city text check (char_length(city) <= 60),
  school text check (char_length(school) <= 80),
  formation text check (char_length(formation) <= 80),
  avatar_path text check (avatar_path is null or starts_with(avatar_path, id::text || '/')),
  cover_path text check (cover_path is null or starts_with(cover_path, id::text || '/')),
  charter_version integer references public.charter_versions (version),
  charter_accepted_at timestamptz,
  email_confirmed_at timestamptz,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  refused_at timestamptz,
  refused_by uuid references public.profiles (id) on delete set null,
  refusal_reason text,
  suspended_at timestamptz,
  suspended_by uuid references public.profiles (id) on delete set null,
  suspension_reason text,
  welcomed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_status_idx on public.profiles (status);

-- Coordonnées : visibles par le membre lui-même et par les postes qui gèrent
-- les comptes ou les membres, jamais par les autres membres.
create table public.member_contacts (
  id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  phone text check (char_length(phone) <= 30)
);

create table public.bureau_roles (
  code text primary key,
  label text not null,
  description text not null,
  sort_order integer not null,
  locked boolean not null default false,
  holder_id uuid unique references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references public.profiles (id) on delete set null
);

create table public.bureau_screens (
  code text primary key,
  label text not null,
  description text not null,
  sort_order integer not null
);

create table public.role_permissions (
  role_code text not null references public.bureau_roles (code) on delete cascade,
  screen_code text not null references public.bureau_screens (code) on delete cascade,
  level public.access_level not null,
  primary key (role_code, screen_code)
);

create table public.member_warnings (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  given_by uuid references public.profiles (id) on delete set null,
  given_by_name text not null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create index member_warnings_member_idx on public.member_warnings (member_id);

-- Pas de clé étrangère vers profiles : effacer un compte ne doit jamais
-- modifier une ligne du journal. Les noms sont recopiés au moment de l'action.
create table public.activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null,
  category text not null check (category in (
    'comptes', 'membres', 'postes', 'reglages', 'argent',
    'moderation', 'annonces', 'elections', 'evenements'
  )),
  action text not null,
  summary text not null,
  subject_id uuid,
  subject_name text,
  details jsonb not null default '{}'::jsonb
);

create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_subject_idx on public.activity_log (subject_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Données de départ
-- ---------------------------------------------------------------------------

insert into public.charter_versions (version, rules) values (1, '[
  {"icon": "heart", "title": "Respect", "text": "On se parle avec respect, même quand on n''est pas d''accord."},
  {"icon": "users", "title": "Entraide", "text": "On accueille les nouveaux et on se donne un coup de main."},
  {"icon": "shield", "title": "Discrétion", "text": "Ce qui est partagé ici reste entre membres."},
  {"icon": "megaphone", "title": "Infos officielles", "text": "Les annonces officielles viennent du bureau."}
]'::jsonb);

insert into public.bureau_roles (code, label, description, sort_order, locked) values
  ('presidence', 'Présidence', 'Voit tout', 1, false),
  ('vice_presidence', 'Vice-présidence', 'Voit tout', 2, false),
  ('secretariat', 'Secrétariat général', 'Membres, comptes, élections, documents', 3, false),
  ('communication', 'Communication', 'Annonces et modération', 4, false),
  ('projets', 'Projets et intégration', 'Comptes, événements, accueil des nouveaux', 5, false),
  ('tresorerie', 'Trésorerie', 'Trésorerie seulement', 6, false),
  ('admin_numerique', 'Admin numérique', 'Voit tout, attribue les postes', 7, true);

insert into public.bureau_screens (code, label, description, sort_order) values
  ('comptes', 'Comptes en attente', 'Valider ou refuser les inscriptions', 1),
  ('membres', 'Membres et fiches', 'Voir les fiches, avertir, suspendre', 2),
  ('tresorerie', 'Cotisations et journal', 'Encaisser, saisir, exporter', 3),
  ('elections', 'Élections', 'Préparer, ouvrir, publier', 4),
  ('evenements', 'Événements', 'Créer, modifier, rappeler', 5),
  ('annonces', 'Annonces officielles', 'Publier au nom du bureau', 6),
  ('moderation', 'Modération', 'Traiter les signalements', 7),
  ('documents', 'Documents', 'Ajouter et ranger', 8),
  ('bienvenue', 'Message de bienvenue', 'Modifier le message du bot', 9),
  ('journal', 'Journal d''activité', 'Voir qui a fait quoi', 10),
  ('postes', 'Postes et réglages', 'Attribuer les postes, régler l''appli', 11);

-- Présidence et vice-présidence : tout, mais le journal et les postes en lecture.
insert into public.role_permissions (role_code, screen_code, level)
select r.code, s.code,
       case when s.code in ('journal', 'postes') then 'lecture' else 'complet' end::public.access_level
from public.bureau_roles r
cross join public.bureau_screens s
where r.code in ('presidence', 'vice_presidence');

insert into public.role_permissions (role_code, screen_code, level) values
  ('secretariat', 'comptes', 'complet'),
  ('secretariat', 'membres', 'complet'),
  ('secretariat', 'elections', 'complet'),
  ('secretariat', 'documents', 'complet'),
  ('communication', 'annonces', 'complet'),
  ('communication', 'moderation', 'complet'),
  ('projets', 'comptes', 'complet'),
  ('projets', 'evenements', 'complet'),
  ('projets', 'bienvenue', 'complet'),
  ('tresorerie', 'tresorerie', 'complet');

-- ---------------------------------------------------------------------------
-- Fonctions de droits (utilisées par les règles d'accès)
-- ---------------------------------------------------------------------------

create function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'actif'
  );
$$;

-- Niveau d'accès de l'utilisateur connecté à un écran du bureau :
-- 'complet', 'lecture' ou null. Un poste n'ouvre rien si son titulaire
-- n'est pas un membre actif.
create function public.my_access(p_screen text)
returns public.access_level
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.locked then 'complet'::public.access_level else rp.level end
  from public.bureau_roles r
  join public.profiles p on p.id = r.holder_id and p.status = 'actif'
  left join public.role_permissions rp
    on rp.role_code = r.code and rp.screen_code = p_screen
  where r.holder_id = (select auth.uid());
$$;

create function public.can(p_screen text, p_level public.access_level default 'complet')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case p_level
      when 'lecture' then public.my_access(p_screen) is not null
      else public.my_access(p_screen) = 'complet'
    end,
    false
  );
$$;

create function public.is_bureau()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bureau_roles r
    join public.profiles p on p.id = r.holder_id and p.status = 'actif'
    where r.holder_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

create function private.full_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select first_name || ' ' || last_name from public.profiles where id = p_id;
$$;

create function private.type_label(p_type public.member_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'etudiant' then 'Étudiant'
    when 'alumni' then 'Alumni'
    when 'sympathisant' then 'Sympathisant'
    when 'honneur' then 'Membre d''honneur'
  end;
$$;

create function private.log_activity(
  p_category text,
  p_action text,
  p_summary text,
  p_subject uuid default null,
  p_details jsonb default '{}'::jsonb,
  p_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_log (actor_id, actor_name, category, action, summary, subject_id, subject_name, details)
  values (
    p_actor,
    coalesce(private.full_name(p_actor), 'AEGB, automatique'),
    p_category,
    p_action,
    p_summary,
    p_subject,
    private.full_name(p_subject),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create function private.require(p_screen text, p_level public.access_level default 'complet')
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can(p_screen, p_level) then
    raise exception 'Ton poste ne donne pas accès à cette action.' using errcode = '42501';
  end if;
end;
$$;

create function private.get_profile_for_update(p_member uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
begin
  select * into v from public.profiles where id = p_member for update;
  if not found then
    raise exception 'Ce membre n''existe pas.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Journal : ajouts seulement
-- ---------------------------------------------------------------------------

create function private.activity_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le journal d''activité ne peut être ni modifié ni effacé.' using errcode = '42501';
end;
$$;

create trigger activity_log_no_update_delete
  before update or delete on public.activity_log
  for each row execute function private.activity_log_is_append_only();

create trigger activity_log_no_truncate
  before truncate on public.activity_log
  for each statement execute function private.activity_log_is_append_only();

-- ---------------------------------------------------------------------------
-- Comptes : création et confirmation de l'email
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text := left(btrim(coalesce(m ->> 'first_name', '')), 60);
  v_last text := left(btrim(coalesce(m ->> 'last_name', '')), 60);
  v_phone text := nullif(left(btrim(coalesce(m ->> 'phone', '')), 30), '');
  v_type public.member_type;
  v_charter integer;
begin
  -- Membre d'honneur n'est jamais choisi à l'inscription.
  v_type := case m ->> 'member_type'
    when 'alumni' then 'alumni'
    when 'sympathisant' then 'sympathisant'
    else 'etudiant'
  end;

  if v_first = '' then v_first := split_part(new.email, '@', 1); end if;
  if v_last = '' then v_last := '?'; end if;

  select version into v_charter
  from public.charter_versions
  where version::text = (m ->> 'charter_version');

  insert into public.profiles (id, first_name, last_name, member_type, charter_version, charter_accepted_at, email_confirmed_at)
  values (new.id, v_first, v_last, v_type, v_charter,
          case when v_charter is not null then now() end,
          new.email_confirmed_at);

  insert into public.member_contacts (id, email, phone)
  values (new.id, new.email, v_phone);

  perform private.log_activity('comptes', 'inscription',
    'a créé son compte (' || private.type_label(v_type) || ')', new.id, '{}'::jsonb, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles set email_confirmed_at = new.email_confirmed_at where id = new.id;
    perform private.log_activity('comptes', 'email_confirme', 'a confirmé son adresse email', new.id, '{}'::jsonb, new.id);
  end if;
  if new.email is distinct from old.email and new.email is not null then
    update public.member_contacts set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_user_updated();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Actions du membre sur son propre compte
-- ---------------------------------------------------------------------------

create function public.accept_charter(p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_version is distinct from (select max(version) from public.charter_versions) then
    raise exception 'Cette version de la charte n''est plus la bonne.' using errcode = '22023';
  end if;
  update public.profiles
  set charter_version = p_version, charter_accepted_at = now()
  where id = (select auth.uid());
end;
$$;

create function public.mark_welcomed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set welcomed_at = coalesce(welcomed_at, now())
  where id = (select auth.uid()) and status = 'actif';
$$;

-- ---------------------------------------------------------------------------
-- Actions du bureau
-- ---------------------------------------------------------------------------

create function public.validate_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
begin
  perform private.require('comptes');
  v := private.get_profile_for_update(p_member);
  if v.status not in ('en_attente', 'refuse') then
    raise exception 'Ce compte a déjà été traité.' using errcode = '22023';
  end if;
  if v.email_confirmed_at is null then
    raise exception 'Ce membre n''a pas encore confirmé son adresse email.' using errcode = '22023';
  end if;

  update public.profiles
  set status = 'actif', validated_at = now(), validated_by = auth.uid(),
      refused_at = null, refused_by = null, refusal_reason = null
  where id = p_member;

  perform private.log_activity('comptes', 'validation',
    'a validé le compte de ' || private.full_name(p_member), p_member);
end;
$$;

create function public.refuse_member(p_member uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform private.require('comptes');
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'Le motif du refus est obligatoire.' using errcode = '22023';
  end if;
  v := private.get_profile_for_update(p_member);
  if v.status <> 'en_attente' then
    raise exception 'Ce compte a déjà été traité.' using errcode = '22023';
  end if;

  update public.profiles
  set status = 'refuse', refused_at = now(), refused_by = auth.uid(), refusal_reason = v_reason
  where id = p_member;

  perform private.log_activity('comptes', 'refus',
    'a refusé le compte de ' || private.full_name(p_member), p_member,
    jsonb_build_object('motif', v_reason));
end;
$$;

create function public.suspend_member(p_member uuid, p_reason text)
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
    raise exception 'L''admin numérique ne peut pas être suspendu.' using errcode = '22023';
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

create function public.reactivate_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
begin
  perform private.require('membres');
  v := private.get_profile_for_update(p_member);
  if v.status <> 'suspendu' then
    raise exception 'Ce membre n''est pas suspendu.' using errcode = '22023';
  end if;

  update public.profiles
  set status = 'actif', suspended_at = null, suspended_by = null, suspension_reason = null
  where id = p_member;

  perform private.log_activity('membres', 'reactivation',
    'a réactivé ' || private.full_name(p_member), p_member);
end;
$$;

create function public.set_member_type(p_member uuid, p_type public.member_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
begin
  perform private.require('membres');
  v := private.get_profile_for_update(p_member);
  if v.member_type = p_type then
    return;
  end if;

  update public.profiles set member_type = p_type where id = p_member;

  perform private.log_activity('membres', 'changement_type',
    'a changé le type de ' || private.full_name(p_member) || ' : '
      || private.type_label(v.member_type) || ' → ' || private.type_label(p_type),
    p_member,
    jsonb_build_object('avant', v.member_type, 'apres', p_type));
end;
$$;

create function public.warn_member(p_member uuid, p_reason text)
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
    raise exception 'Tu ne peux pas t''avertir toi-même.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Le motif de l''avertissement est obligatoire.' using errcode = '22023';
  end if;
  v := private.get_profile_for_update(p_member);
  if v.status <> 'actif' then
    raise exception 'Seul un membre actif peut être averti.' using errcode = '22023';
  end if;

  insert into public.member_warnings (member_id, given_by, given_by_name, reason)
  values (p_member, auth.uid(), private.full_name(auth.uid()), v_reason);

  perform private.log_activity('membres', 'avertissement',
    'a averti ' || private.full_name(p_member), p_member,
    jsonb_build_object('motif', v_reason));
end;
$$;

create function public.assign_role(p_role text, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bureau_roles;
  v public.profiles;
begin
  perform private.require('postes');
  select * into r from public.bureau_roles where code = p_role for update;
  if not found then
    raise exception 'Ce poste n''existe pas.' using errcode = 'P0002';
  end if;
  if r.locked then
    raise exception 'Ce poste ne peut pas être changé depuis l''appli.' using errcode = '22023';
  end if;
  v := private.get_profile_for_update(p_member);
  if v.status <> 'actif' then
    raise exception 'Seul un membre validé peut recevoir un poste.' using errcode = '22023';
  end if;
  if r.holder_id = p_member then
    return;
  end if;
  if exists (select 1 from public.bureau_roles where holder_id = p_member) then
    raise exception 'Ce membre occupe déjà un autre poste. Retire-le d''abord de ce poste.' using errcode = '22023';
  end if;

  if r.holder_id is not null then
    perform private.log_activity('postes', 'retrait_poste',
      'a retiré ' || private.full_name(r.holder_id) || ' du poste ' || r.label, r.holder_id,
      jsonb_build_object('poste', r.code));
  end if;

  update public.bureau_roles
  set holder_id = p_member, assigned_at = now(), assigned_by = auth.uid()
  where code = p_role;

  perform private.log_activity('postes', 'attribution_poste',
    'a nommé ' || private.full_name(p_member) || ' au poste ' || r.label, p_member,
    jsonb_build_object('poste', r.code));
end;
$$;

create function public.clear_role(p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bureau_roles;
begin
  perform private.require('postes');
  select * into r from public.bureau_roles where code = p_role for update;
  if not found then
    raise exception 'Ce poste n''existe pas.' using errcode = 'P0002';
  end if;
  if r.locked then
    raise exception 'Ce poste ne peut pas être changé depuis l''appli.' using errcode = '22023';
  end if;
  if r.holder_id is null then
    return;
  end if;

  update public.bureau_roles
  set holder_id = null, assigned_at = now(), assigned_by = auth.uid()
  where code = p_role;

  perform private.log_activity('postes', 'retrait_poste',
    'a retiré ' || private.full_name(r.holder_id) || ' du poste ' || r.label, r.holder_id,
    jsonb_build_object('poste', r.code));
end;
$$;

create function public.set_role_permission(p_role text, p_screen text, p_level public.access_level)
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
    raise exception 'Les droits de l''admin numérique ne changent pas.' using errcode = '22023';
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
-- Lectures pour le bureau
-- ---------------------------------------------------------------------------

create function public.bureau_counts()
returns table (
  pending integer,
  pending_unconfirmed integer,
  active integer,
  new_this_month integer,
  roles_filled integer,
  roles_total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_bureau() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;
  return query
  select
    case when public.can('comptes', 'lecture') then
      (select count(*)::integer from public.profiles where status = 'en_attente' and email_confirmed_at is not null)
    end,
    case when public.can('comptes', 'lecture') then
      (select count(*)::integer from public.profiles where status = 'en_attente' and email_confirmed_at is null)
    end,
    (select count(*)::integer from public.profiles where status = 'actif'),
    (select count(*)::integer from public.profiles
       where status = 'actif' and validated_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'),
    (select count(*)::integer from public.bureau_roles where holder_id is not null),
    (select count(*)::integer from public.bureau_roles);
end;
$$;

create function public.member_history(p_member uuid)
returns setof public.activity_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.can('membres', 'lecture') or public.can('comptes', 'lecture')) then
    raise exception 'Ton poste ne donne pas accès aux fiches des membres.' using errcode = '42501';
  end if;
  return query
  select * from public.activity_log
  where subject_id = p_member
  order by created_at desc
  limit 100;
end;
$$;

-- Pour le site public : les postes et le nom de leur titulaire, rien d'autre.
create function public.public_bureau()
returns table (code text, label text, sort_order integer, first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.code, r.label, r.sort_order, p.first_name, p.last_name
  from public.bureau_roles r
  left join public.profiles p on p.id = r.holder_id and p.status = 'actif'
  order by r.sort_order;
$$;

-- ---------------------------------------------------------------------------
-- Règles d'accès
-- ---------------------------------------------------------------------------

alter table public.charter_versions enable row level security;
alter table public.profiles enable row level security;
alter table public.member_contacts enable row level security;
alter table public.bureau_roles enable row level security;
alter table public.bureau_screens enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_warnings enable row level security;
alter table public.activity_log enable row level security;

-- Par défaut Supabase donne tous les privilèges aux rôles de l'API :
-- on repart de zéro et on n'ouvre que le nécessaire.
revoke all on public.charter_versions, public.profiles, public.member_contacts,
  public.bureau_roles, public.bureau_screens, public.role_permissions,
  public.member_warnings, public.activity_log
  from anon, authenticated;

grant select on public.charter_versions to anon, authenticated;
grant select on public.profiles, public.member_contacts, public.bureau_roles,
  public.bureau_screens, public.role_permissions, public.member_warnings,
  public.activity_log
  to authenticated;

-- Un membre ne modifie que ces colonnes de son profil : jamais son statut,
-- son type, sa charte ou les champs de validation.
grant update (first_name, last_name, bio, city, school, formation, avatar_path, cover_path)
  on public.profiles to authenticated;
grant update (phone) on public.member_contacts to authenticated;

create policy "La charte est publique"
  on public.charter_versions for select
  to anon, authenticated
  using (true);

create policy "Profils visibles selon le statut et le poste"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or (status = 'actif' and (select public.is_active_member()))
    or (select public.can('membres', 'lecture'))
    or (select public.can('comptes', 'lecture'))
  );

create policy "Chacun modifie son propre profil"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) and status in ('en_attente', 'actif'))
  with check (id = (select auth.uid()));

create policy "Coordonnées visibles par soi et par le bureau"
  on public.member_contacts for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.can('membres', 'lecture'))
    or (select public.can('comptes', 'lecture'))
  );

create policy "Chacun modifie son téléphone"
  on public.member_contacts for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Postes visibles par les membres actifs"
  on public.bureau_roles for select
  to authenticated
  using ((select public.is_active_member()));

create policy "Écrans visibles par les membres actifs"
  on public.bureau_screens for select
  to authenticated
  using ((select public.is_active_member()));

create policy "Droits visibles par les membres actifs"
  on public.role_permissions for select
  to authenticated
  using ((select public.is_active_member()));

create policy "Avertissements visibles par le membre et le bureau"
  on public.member_warnings for select
  to authenticated
  using (
    member_id = (select auth.uid())
    or (select public.can('membres', 'lecture'))
  );

create policy "Journal visible par les postes autorisés"
  on public.activity_log for select
  to authenticated
  using ((select public.can('journal', 'lecture')));

-- ---------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.is_active_member(),
  public.my_access(text),
  public.can(text, public.access_level),
  public.is_bureau(),
  public.accept_charter(integer),
  public.mark_welcomed(),
  public.validate_member(uuid),
  public.refuse_member(uuid, text),
  public.suspend_member(uuid, text),
  public.reactivate_member(uuid),
  public.set_member_type(uuid, public.member_type),
  public.warn_member(uuid, text),
  public.assign_role(text, uuid),
  public.clear_role(text),
  public.set_role_permission(text, text, public.access_level),
  public.bureau_counts(),
  public.member_history(uuid)
  to authenticated;

grant execute on function public.public_bureau() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Photos de profil et de couverture
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profils', 'profils', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Photos de profil visibles par les membres actifs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profils'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_active_member())
      or (select public.can('comptes', 'lecture'))
    )
  );

create policy "Chacun dépose ses propres photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profils' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Chacun remplace ses propres photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profils' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profils' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Chacun supprime ses propres photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profils' and (storage.foldername(name))[1] = (select auth.uid())::text);
