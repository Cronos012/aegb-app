-- Lot 6 : la bibliothèque de documents (plan et maquettes validés par Cronos
-- le 30 octobre 2026).
--
-- Le bureau (droit « Documents ») range les documents de l'association par
-- catégorie. Chaque document se lit par tous les membres, par le bureau
-- seulement (les membres qui ont un poste), ou aussi par le public (le site
-- de présentation). Une nouvelle version remplace le document pour les
-- membres ; les anciennes restent visibles par le bureau seulement.
-- Les procès-verbaux d'AG publiés au lot 5 arrivent tout seuls dans
-- « Assemblées générales » : l'appli les fabrique à la demande.
--
-- Un fichier fait au plus 50 Mo : c'est la limite de l'offre gratuite de
-- Supabase, qui ne permet pas plus pour un seul fichier.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  icon text not null default 'folder' check (icon in ('shield', 'vote', 'info', 'euro', 'pen', 'folder')),
  position smallint not null default 100,
  created_at timestamptz not null default now()
);

insert into public.document_categories (id, name, icon, position) values
  ('6a0f5d2e-0001-4a6e-9b1a-0000000000a1', 'Statuts et règlement', 'shield', 1),
  ('6a0f5d2e-0001-4a6e-9b1a-0000000000a2', 'Assemblées générales', 'vote', 2),
  ('6a0f5d2e-0001-4a6e-9b1a-0000000000a3', 'Guides pratiques', 'info', 3),
  ('6a0f5d2e-0001-4a6e-9b1a-0000000000a4', 'Bilans financiers', 'euro', 4),
  ('6a0f5d2e-0001-4a6e-9b1a-0000000000a5', 'Modèles', 'pen', 5);

-- tous : chaque membre validé. bureau : les membres qui ont un poste.
-- public : aussi le site de présentation, sans être connecté.
-- L'identifiant est choisi par l'appli, pour ranger le fichier avant.
create table public.documents (
  id uuid primary key,
  category_id uuid not null references public.document_categories (id),
  title text not null check (char_length(title) between 2 and 120),
  visibility text not null default 'tous' check (visibility in ('tous', 'bureau', 'public')),
  -- Le procès-verbal d'une AG : pas de fichier, l'appli le fabrique.
  assembly_id uuid unique references public.assemblies (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null,
  updated_at timestamptz not null default now(),
  updated_by_name text not null
);

create index documents_category_idx on public.documents (category_id);

-- Chaque fichier envoyé. Le plus récent est celui que voient les membres.
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default clock_timestamp(),
  created_by_name text not null
);

create index document_versions_document_idx on public.document_versions (document_id, created_at desc);

-- La carte d'un nouveau document dans le fil.
alter table public.posts add column document_id uuid references public.documents (id) on delete set null;

-- Le journal d'activité garde aussi ce que le bureau fait des documents.
alter table public.activity_log drop constraint activity_log_category_check;
alter table public.activity_log add constraint activity_log_category_check check (category in (
  'comptes', 'membres', 'postes', 'reglages', 'argent',
  'moderation', 'annonces', 'elections', 'evenements', 'documents'
));

-- ---------------------------------------------------------------------------
-- Fichiers
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array[
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'text/plain'
]);

-- Qui peut lire un document.
create function private.can_see_document(p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_visibility = 'public'
      or (p_visibility = 'tous' and public.is_active_member())
      or (p_visibility = 'bureau' and public.is_bureau());
$$;

-- Un fichier du coffre « documents » : sa version la plus récente se lit
-- selon le document ; une ancienne version, par le bureau seulement.
create function public.can_read_document_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_versions v
    join public.documents d on d.id = v.document_id
    where v.path = p_name
      and private.can_see_document(d.visibility)
      and (public.is_bureau() or v.id = (
        select x.id from public.document_versions x where x.document_id = d.id order by x.created_at desc limit 1))
  );
$$;

create policy "Documents lisibles selon leur niveau"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'documents' and (select public.can_read_document_file(name)));

create policy "Le bureau des documents dépose les fichiers"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and (select public.can('documents')));

create policy "Le bureau des documents retire les fichiers"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents' and (select public.can('documents')));

-- L'espace utilisé compte aussi les documents.
create or replace function public.storage_used()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_bureau() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;
  return (
    select coalesce(sum((metadata ->> 'size')::bigint), 0)
    from storage.objects
    where bucket_id in ('profils', 'publications', 'messages', 'documents')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------------

create function private.document_json(d public.documents, p_staff boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'category_id', d.category_id,
    'category', c.name,
    'visibility', d.visibility,
    'assembly_id', d.assembly_id,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'updated_by_name', d.updated_by_name,
    'file', (
      select jsonb_build_object('id', v.id, 'path', v.path, 'file_name', v.file_name, 'mime', v.mime,
                                'size_bytes', v.size_bytes, 'created_at', v.created_at)
      from public.document_versions v where v.document_id = d.id order by v.created_at desc limit 1
    ),
    'versions', case when p_staff then coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'path', v.path, 'file_name', v.file_name, 'mime', v.mime,
                                          'size_bytes', v.size_bytes, 'created_at', v.created_at,
                                          'created_by_name', v.created_by_name) order by v.created_at desc)
      from public.document_versions v where v.document_id = d.id
    ), '[]'::jsonb) end
  )
  from public.document_categories c
  where c.id = d.category_id;
$$;

-- La bibliothèque d'un membre : les catégories et les documents qu'il peut lire.
-- Le bureau voit aussi les anciennes versions.
create function public.documents_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := public.is_bureau();
begin
  perform private.require_member();
  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'position', c.position)
                       order by c.position, c.name)
      from public.document_categories c
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(private.document_json(d, v_staff) order by d.updated_at desc)
      from public.documents d
      where private.can_see_document(d.visibility)
    ), '[]'::jsonb),
    'can_edit', public.can('documents'),
    'storage_used', case when v_staff then public.storage_used() end
  );
end;
$$;

-- Les documents publics, pour le site de présentation (sans connexion).
create function public.public_documents()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.document_json(d, false) order by c.position, d.title), '[]'::jsonb)
  from public.documents d
  join public.document_categories c on c.id = d.category_id
  where d.visibility = 'public'
    and exists (select 1 from public.document_versions v where v.document_id = d.id);
$$;

-- Les événements à venir montrés sur le site : titre, date, lieu et photo,
-- jamais les participants.
create function public.public_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'online', e.online, 'place', e.place, 'photo_path', e.photo_path
  ) order by e.starts_at), '[]'::jsonb)
  from public.events e
  where e.public_site and e.status = 'publie' and private.event_end(e) > private.clock();
$$;

create function public.is_public_event_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.photo_path = p_name and e.public_site and e.status = 'publie'
  );
$$;

create policy "Photos des événements du site visibles par tous"
  on storage.objects for select
  to anon
  using (bucket_id = 'publications' and (storage.foldername(name))[1] = 'evenements'
         and (select public.is_public_event_photo(name)));

-- ---------------------------------------------------------------------------
-- Ranger (bureau)
-- ---------------------------------------------------------------------------

-- Ajoute un document, ou le modifie. p_file : le fichier déjà envoyé dans
-- « documents/<id>/… » ({path, file_name}) : obligatoire pour un nouveau
-- document, et pour un document existant c'est une nouvelle version.
-- p_announce : une annonce du bureau dans le fil (jamais pour un document
-- du bureau seulement).
create function public.save_document(
  p_id uuid,
  p_category uuid,
  p_title text,
  p_visibility text,
  p_file jsonb default null,
  p_announce boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documents;
  d public.documents;
  v_new boolean;
  v_title text := btrim(coalesce(p_title, ''));
  v_path text := nullif(p_file ->> 'path', '');
  v_name text := left(btrim(coalesce(p_file ->> 'file_name', '')), 200);
  v_obj record;
  v_cat text;
  v_post uuid;
begin
  perform private.require('documents');
  select * into o from public.documents where id = p_id for update;
  v_new := not found;
  if char_length(v_title) < 2 or char_length(v_title) > 120 then
    raise exception 'Donne un titre (120 caractères au plus).' using errcode = '22023';
  end if;
  if coalesce(p_visibility, '') not in ('tous', 'bureau', 'public') then
    raise exception 'Choisis qui peut lire le document.' using errcode = '22023';
  end if;
  select name into v_cat from public.document_categories where id = p_category;
  if v_cat is null then
    raise exception 'Choisis une catégorie.' using errcode = '22023';
  end if;
  if v_new and v_path is null then
    raise exception 'Choisis le fichier à envoyer.' using errcode = '22023';
  end if;
  if not v_new and o.assembly_id is not null and v_path is not null then
    raise exception 'Le procès-verbal d''une AG est fabriqué par l''appli : il ne se remplace pas.' using errcode = '22023';
  end if;
  if v_path is not null then
    select name, metadata into v_obj from storage.objects where bucket_id = 'documents' and name = v_path;
    if not starts_with(v_path, p_id::text || '/') or v_obj.name is null then
      raise exception 'Le fichier n''a pas été envoyé correctement. Réessaie.' using errcode = '22023';
    end if;
    if exists (select 1 from public.document_versions where path = v_path) then
      raise exception 'Ce fichier est déjà enregistré.' using errcode = '22023';
    end if;
  end if;

  if v_new then
    insert into public.documents (id, category_id, title, visibility, created_by, created_by_name, updated_by_name)
    values (p_id, p_category, v_title, p_visibility, auth.uid(), private.signature(auth.uid()), private.signature(auth.uid()))
    returning * into d;
  else
    update public.documents
    set category_id = p_category, title = v_title, visibility = p_visibility,
        updated_at = now(), updated_by_name = private.signature(auth.uid())
    where id = p_id
    returning * into d;
  end if;

  if v_path is not null then
    insert into public.document_versions (document_id, path, file_name, mime, size_bytes, created_by_name)
    values (d.id, v_path, coalesce(nullif(v_name, ''), regexp_replace(v_path, '^.*/', '')),
            coalesce(v_obj.metadata ->> 'mimetype', 'application/octet-stream'),
            greatest(coalesce((v_obj.metadata ->> 'size')::bigint, 1), 1),
            private.signature(auth.uid()));
  end if;

  if coalesce(p_announce, false) and d.visibility <> 'bureau' and (v_new or v_path is not null) then
    v_post := gen_random_uuid();
    insert into public.posts (id, author_id, official, title, body, audience, published_at, document_id)
    values (v_post, null, true,
            left(case when v_new then 'Nouveau document : ' else 'Nouvelle version : ' end || d.title, 120),
            'Le bureau a ' || case when v_new then 'ajouté' else 'mis à jour' end || ' « ' || d.title
              || ' » dans les documents (' || v_cat || ').',
            'tous', now(), d.id);
    insert into public.announcement_authors (post_id, written_by, written_by_name)
    values (v_post, case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid()));
  end if;

  perform private.log_activity('documents',
    case when v_new then 'ajout' when v_path is not null then 'nouvelle_version' else 'modification' end,
    case when v_new then 'a ajouté le document « '
         when v_path is not null then 'a mis une nouvelle version de « '
         else 'a modifié le document « ' end || d.title || ' »',
    null, jsonb_build_object('document', d.id, 'lecture', d.visibility));
  return private.document_json(d, true);
end;
$$;

-- Supprime un document pour tout le monde. Renvoie ses fichiers, que l'appli
-- retire ensuite du coffre.
create function public.delete_document(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  v_paths text[];
begin
  perform private.require('documents');
  select * into d from public.documents where id = p_id for update;
  if not found then
    raise exception 'Ce document n''existe plus.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(path), '{}') into v_paths from public.document_versions where document_id = p_id;
  delete from public.documents where id = p_id;
  perform private.log_activity('documents', 'suppression', 'a supprimé le document « ' || d.title || ' »', null,
    jsonb_build_object('document', d.id));
  return v_paths;
end;
$$;

-- Crée ou renomme une catégorie.
create function public.save_document_category(p_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  perform private.require('documents');
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Donne un nom de catégorie (60 caractères au plus).' using errcode = '22023';
  end if;
  if exists (select 1 from public.document_categories where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'Cette catégorie existe déjà.' using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.document_categories (name, position)
    values (v_name, coalesce((select max(position) from public.document_categories), 0) + 1)
    returning id into v_id;
    perform private.log_activity('documents', 'categorie', 'a créé la catégorie « ' || v_name || ' »');
  else
    update public.document_categories set name = v_name where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Cette catégorie n''existe plus.' using errcode = 'P0002';
    end if;
    perform private.log_activity('documents', 'categorie', 'a renommé une catégorie en « ' || v_name || ' »');
  end if;
  return v_id;
end;
$$;

-- Supprime une catégorie vide.
create function public.delete_document_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform private.require('documents');
  if exists (select 1 from public.documents where category_id = p_id) then
    raise exception 'Cette catégorie contient des documents : range-les ailleurs d''abord.' using errcode = '22023';
  end if;
  if p_id = '6a0f5d2e-0001-4a6e-9b1a-0000000000a2' then
    raise exception 'Les procès-verbaux d''AG arrivent dans cette catégorie : elle reste.' using errcode = '22023';
  end if;
  delete from public.document_categories where id = p_id returning name into v_name;
  if v_name is not null then
    perform private.log_activity('documents', 'categorie', 'a supprimé la catégorie « ' || v_name || ' »');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Les procès-verbaux d'AG
-- ---------------------------------------------------------------------------

create function private.assembly_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'publiee' and old.status <> 'publiee' then
    insert into public.documents (id, category_id, title, visibility, assembly_id, created_by_name, updated_by_name)
    values (gen_random_uuid(), '6a0f5d2e-0001-4a6e-9b1a-0000000000a2',
            left('Procès-verbal de ' || private.assembly_label(new), 120), 'tous', new.id,
            coalesce(new.published_by_name, 'Le bureau'), coalesce(new.published_by_name, 'Le bureau'))
    on conflict (assembly_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger assemblies_document
  after update of status on public.assemblies
  for each row execute function private.assembly_document();

insert into public.documents (id, category_id, title, visibility, assembly_id, created_by_name, updated_by_name, created_at, updated_at)
select gen_random_uuid(), '6a0f5d2e-0001-4a6e-9b1a-0000000000a2', left('Procès-verbal de ' || private.assembly_label(a), 120),
       'tous', a.id, coalesce(a.published_by_name, 'Le bureau'), coalesce(a.published_by_name, 'Le bureau'),
       coalesce(a.published_at, now()), coalesce(a.published_at, now())
from public.assemblies a
where a.status = 'publiee';

-- ---------------------------------------------------------------------------
-- Règles d'accès : rien ne se lit directement
-- ---------------------------------------------------------------------------

alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

revoke all on public.document_categories, public.documents, public.document_versions from anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.can_read_document_file(text),
  public.documents_list(),
  public.save_document(uuid, uuid, text, text, jsonb, boolean),
  public.delete_document(uuid),
  public.save_document_category(uuid, text),
  public.delete_document_category(uuid),
  public.public_documents(),
  public.public_events(),
  public.is_public_event_photo(text)
  from public;

grant execute on function
  public.documents_list(),
  public.save_document(uuid, uuid, text, text, jsonb, boolean),
  public.delete_document(uuid),
  public.save_document_category(uuid, text),
  public.delete_document_category(uuid)
  to authenticated;

-- Le site de présentation et les règles des fichiers les appellent sans connexion.
grant execute on function
  public.can_read_document_file(text),
  public.public_documents(),
  public.public_events(),
  public.is_public_event_photo(text)
  to anon, authenticated;
