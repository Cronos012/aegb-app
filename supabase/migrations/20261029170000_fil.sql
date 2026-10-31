-- Lot 2 : le fil d'actu, les réactions, les commentaires, les signalements,
-- les annonces officielles et la modération (plan validé par Cronos le
-- 29 octobre 2026).
--
-- Comme au lot 1, l'appli ne fait que lire : chaque écriture passe par une
-- fonction de la base qui vérifie qui agit et sur quoi.

create type public.post_audience as enum ('tous', 'etudiants', 'alumni', 'bureau');
create type public.reaction_kind as enum ('jaime', 'jadore', 'rire', 'wouah', 'triste', 'soutien');
create type public.report_reason as enum ('irrespect', 'fausse_info', 'spam', 'choquant', 'autre');
create type public.moderation_decision as enum ('garder', 'masquer', 'masquer_avertir');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Une annonce officielle n'a pas d'auteur visible : elle est signée
-- « Bureau de l'AEGB ». Qui l'a écrite est rangé à part, pour le bureau.
-- L'identifiant est choisi par l'appli, pour ranger les photos avant la
-- publication.
create table public.posts (
  id uuid primary key,
  author_id uuid references public.profiles (id) on delete cascade,
  official boolean not null default false,
  title text check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  audience public.post_audience not null default 'tous',
  published_at timestamptz not null default now(),
  pinned_until timestamptz,
  edited_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 300),
  created_at timestamptz not null default now(),
  constraint posts_official_or_member check (
    (official and author_id is null and title is not null)
    or (not official and author_id is not null and title is null and audience = 'tous' and pinned_until is null)
  )
);

create index posts_feed_idx on public.posts (published_at desc);
create index posts_author_idx on public.posts (author_id, published_at desc);

create table public.announcement_authors (
  post_id uuid primary key references public.posts (id) on delete cascade,
  written_by uuid references public.profiles (id) on delete set null,
  written_by_name text not null
);

create table public.post_media (
  post_id uuid not null references public.posts (id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  kind text not null check (kind in ('photo', 'video')),
  path text not null unique,
  width integer check (width > 0),
  height integer check (height > 0),
  primary key (post_id, position)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 300)
);

create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id);

create table public.reactions (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)
);

create unique index reactions_post_once on public.reactions (post_id, member_id) where post_id is not null;
create unique index reactions_comment_once on public.reactions (comment_id, member_id) where comment_id is not null;
create index reactions_member_idx on public.reactions (member_id);

-- Qui a signalé n'est lisible que par lui-même : le bureau ne voit que le
-- nombre de signalements et leurs motifs.
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  reason public.report_reason not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (num_nonnulls(post_id, comment_id) = 1)
);

create unique index reports_post_once on public.reports (post_id, reporter_id) where post_id is not null;
create unique index reports_comment_once on public.reports (comment_id, reporter_id) where comment_id is not null;
create index reports_pending_idx on public.reports (created_at) where resolved_at is null;
create index reports_reporter_idx on public.reports (reporter_id);

-- Les décisions restent même si la publication est effacée ensuite.
create table public.moderation_decisions (
  id bigint generated always as identity primary key,
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  excerpt text not null,
  decision public.moderation_decision not null,
  reason public.report_reason,
  reports integer not null default 0,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_by_name text not null,
  created_at timestamptz not null default now()
);

create index moderation_decisions_created_idx on public.moderation_decisions (created_at desc);

-- Pour « Vue par N » sous chaque annonce. Personne ne lit qui a vu quoi.
create table public.post_views (
  post_id uuid not null references public.posts (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Qui voit une publication
-- ---------------------------------------------------------------------------

-- Un membre validé voit les publications parues, non masquées, qui lui sont
-- destinées. Il voit toujours les siennes, même masquées. La modération voit
-- tout ce qui est paru ; les annonces se préparent sous les yeux de ceux qui
-- ont le droit Annonces.
create function public.can_read_post(
  p_author uuid,
  p_official boolean,
  p_audience public.post_audience,
  p_published timestamptz,
  p_hidden timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and (
    p_author = (select auth.uid())
    or (p_official and public.can('annonces', 'lecture'))
    or (p_published <= now() and (
      public.can('moderation', 'lecture')
      or (p_hidden is null and (
        p_audience = 'tous'
        or (p_audience = 'bureau' and public.is_bureau())
        or (p_audience = 'etudiants' and exists (
          select 1 from public.profiles where id = (select auth.uid()) and member_type = 'etudiant'))
        or (p_audience = 'alumni' and exists (
          select 1 from public.profiles where id = (select auth.uid()) and member_type = 'alumni'))
      ))
    ))
  );
$$;

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

create function private.require_member()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Seuls les membres validés peuvent faire cela.' using errcode = '42501';
  end if;
end;
$$;

create function private.reason_label(p_reason public.report_reason)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'irrespect' then 'Propos irrespectueux'
    when 'fausse_info' then 'Fausse information'
    when 'spam' then 'Spam ou publicité'
    when 'choquant' then 'Contenu choquant'
    when 'autre' then 'Autre chose'
  end;
$$;

-- Le nom qui signe une action du bureau : « Le bureau » pour le titulaire du
-- poste d'admin numérique, comme dans le journal.
create function private.signature(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_guarantor(p_id) then 'Le bureau' else private.full_name(p_id) end;
$$;

-- Les photos et vidéos d'une publication : 4 photos, ou une seule vidéo,
-- déjà déposées dans le dossier de la publication.
create function private.attach_media(p_post uuid, p_folder text, p_media jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_videos integer;
  m jsonb;
  i integer := 0;
begin
  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Les photos jointes sont mal décrites.' using errcode = '22023';
  end if;
  select count(*) into v_videos from jsonb_array_elements(v_media) e where e ->> 'kind' = 'video';
  if jsonb_array_length(v_media) > 4 then
    raise exception 'Quatre photos au plus par publication.' using errcode = '22023';
  end if;
  if v_videos > 0 and jsonb_array_length(v_media) > 1 then
    raise exception 'Une vidéo se publie seule, sans photo.' using errcode = '22023';
  end if;

  for m in select value from jsonb_array_elements(v_media) loop
    if coalesce(m ->> 'kind', '') not in ('photo', 'video') then
      raise exception 'Seules les photos et les vidéos sont acceptées.' using errcode = '22023';
    end if;
    if not starts_with(coalesce(m ->> 'path', ''), p_folder || '/' || p_post::text || '/')
       or not exists (select 1 from storage.objects where bucket_id = 'publications' and name = m ->> 'path') then
      raise exception 'Une photo n''a pas été envoyée correctement. Réessaie.' using errcode = '22023';
    end if;
    insert into public.post_media (post_id, position, kind, path, width, height)
    values (p_post, i, m ->> 'kind', m ->> 'path', nullif(m ->> 'width', '')::integer, nullif(m ->> 'height', '')::integer);
    i := i + 1;
  end loop;
end;
$$;

-- Une publication ou un commentaire qu'on peut lire et qui n'est pas masqué.
create function private.open_post(p_post uuid)
returns public.posts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.posts;
begin
  select * into p from public.posts where id = p_post;
  if not found or p.published_at > now() or p.hidden_at is not null
     or not public.can_read_post(p.author_id, p.official, p.audience, p.published_at, p.hidden_at) then
    raise exception 'Cette publication n''est plus disponible.' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

create function private.open_comment(p_comment uuid)
returns public.comments
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = p_comment;
  if not found or c.hidden_at is not null then
    raise exception 'Ce commentaire n''est plus disponible.' using errcode = 'P0002';
  end if;
  perform private.open_post(c.post_id);
  return c;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publications des membres
-- ---------------------------------------------------------------------------

create function public.create_post(p_id uuid, p_body text, p_media jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.require_member();
  if char_length(v_body) > 2000 then
    raise exception 'Ta publication dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if v_body = '' and (jsonb_typeof(p_media) is distinct from 'array' or jsonb_array_length(p_media) = 0) then
    raise exception 'Écris quelque chose ou ajoute une photo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.posts where id = p_id) then
    raise exception 'Cette publication existe déjà.' using errcode = '22023';
  end if;

  insert into public.posts (id, author_id, body) values (p_id, auth.uid(), v_body);
  perform private.attach_media(p_id, auth.uid()::text, p_media);
end;
$$;

create function public.update_post(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.require_member();
  select * into p from public.posts where id = p_id for update;
  if not found or p.author_id is distinct from auth.uid() then
    raise exception 'Tu ne peux modifier que tes propres publications.' using errcode = '42501';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Ta publication dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if v_body = '' and not exists (select 1 from public.post_media where post_id = p_id) then
    raise exception 'Écris quelque chose ou ajoute une photo.' using errcode = '22023';
  end if;
  if v_body = p.body then
    return;
  end if;
  update public.posts set body = v_body, edited_at = now() where id = p_id;
end;
$$;

-- Rend la liste des fichiers, que l'appli efface ensuite de l'espace photos.
create function public.delete_post(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  v_paths text[];
begin
  select * into p from public.posts where id = p_id for update;
  if not found or p.author_id is distinct from auth.uid() then
    raise exception 'Tu ne peux supprimer que tes propres publications.' using errcode = '42501';
  end if;
  select coalesce(array_agg(path), '{}') into v_paths from public.post_media where post_id = p_id;
  delete from public.posts where id = p_id;
  return v_paths;
end;
$$;

-- ---------------------------------------------------------------------------
-- Commentaires et réactions
-- ---------------------------------------------------------------------------

-- Les réponses restent sur un seul niveau : répondre à une réponse s'accroche
-- au commentaire d'origine.
create function public.add_comment(p_post uuid, p_body text, p_parent uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_parent public.comments;
  v_id uuid;
begin
  perform private.require_member();
  perform private.open_post(p_post);
  if v_body = '' then
    raise exception 'Écris ton commentaire.' using errcode = '22023';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Ton commentaire dépasse 1 000 caractères.' using errcode = '22023';
  end if;
  if p_parent is not null then
    v_parent := private.open_comment(p_parent);
    if v_parent.post_id <> p_post then
      raise exception 'Ce commentaire n''est pas sous cette publication.' using errcode = '22023';
    end if;
  end if;

  insert into public.comments (post_id, parent_id, author_id, body)
  values (p_post, coalesce(v_parent.parent_id, v_parent.id), auth.uid(), v_body)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_comment(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.require_member();
  select * into c from public.comments where id = p_id for update;
  if not found or c.author_id is distinct from auth.uid() then
    raise exception 'Tu ne peux modifier que tes propres commentaires.' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'Écris ton commentaire.' using errcode = '22023';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Ton commentaire dépasse 1 000 caractères.' using errcode = '22023';
  end if;
  if v_body = c.body then
    return;
  end if;
  update public.comments set body = v_body, edited_at = now() where id = p_id;
end;
$$;

create function public.delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = p_id for update;
  if not found or c.author_id is distinct from auth.uid() then
    raise exception 'Tu ne peux supprimer que tes propres commentaires.' using errcode = '42501';
  end if;
  delete from public.comments where id = p_id;
end;
$$;

-- Une réaction par personne : en choisir une autre la remplace, null l'enlève.
create function public.react(p_post uuid, p_comment uuid, p_kind public.reaction_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  if num_nonnulls(p_post, p_comment) <> 1 then
    raise exception 'Réagis à une publication ou à un commentaire.' using errcode = '22023';
  end if;

  if p_post is not null then
    perform private.open_post(p_post);
    if p_kind is null then
      delete from public.reactions where post_id = p_post and member_id = auth.uid();
    else
      insert into public.reactions (member_id, post_id, kind) values (auth.uid(), p_post, p_kind)
      on conflict (post_id, member_id) where post_id is not null do update set kind = excluded.kind, created_at = now();
    end if;
  else
    perform private.open_comment(p_comment);
    if p_kind is null then
      delete from public.reactions where comment_id = p_comment and member_id = auth.uid();
    else
      insert into public.reactions (member_id, comment_id, kind) values (auth.uid(), p_comment, p_kind)
      on conflict (comment_id, member_id) where comment_id is not null do update set kind = excluded.kind, created_at = now();
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signalements et modération
-- ---------------------------------------------------------------------------

-- Rend faux si la personne avait déjà signalé ce contenu.
create function public.report_content(p_post uuid, p_comment uuid, p_reason public.report_reason)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  c public.comments;
begin
  perform private.require_member();
  if num_nonnulls(p_post, p_comment) <> 1 or p_reason is null then
    raise exception 'Choisis ce que tu signales et pourquoi.' using errcode = '22023';
  end if;

  if p_post is not null then
    p := private.open_post(p_post);
    if p.official then
      raise exception 'Les annonces du bureau ne se signalent pas. Écris au bureau si besoin.' using errcode = '22023';
    end if;
    if p.author_id = auth.uid() then
      raise exception 'Tu ne peux pas signaler ta propre publication.' using errcode = '22023';
    end if;
    insert into public.reports (reporter_id, post_id, reason) values (auth.uid(), p_post, p_reason)
    on conflict (post_id, reporter_id) where post_id is not null do nothing;
  else
    c := private.open_comment(p_comment);
    if c.author_id = auth.uid() then
      raise exception 'Tu ne peux pas signaler ton propre commentaire.' using errcode = '22023';
    end if;
    insert into public.reports (reporter_id, comment_id, reason) values (auth.uid(), p_comment, p_reason)
    on conflict (comment_id, reporter_id) where comment_id is not null do nothing;
  end if;
  return found;
end;
$$;

-- Garder, masquer, ou masquer et avertir l'auteur. Le bureau peut aussi
-- masquer sans signalement. Chaque décision va au journal.
create function public.moderate(
  p_post uuid,
  p_comment uuid,
  p_decision public.moderation_decision,
  p_reason public.report_reason default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  c public.comments;
  v_author uuid;
  v_body text;
  v_hidden timestamptz;
  v_reports integer;
  v_reason public.report_reason := p_reason;
  v_what text;
  v_summary text;
begin
  perform private.require('moderation');
  if num_nonnulls(p_post, p_comment) <> 1 or p_decision is null then
    raise exception 'Choisis le contenu et la décision.' using errcode = '22023';
  end if;

  if p_post is not null then
    select * into p from public.posts where id = p_post for update;
    if not found then
      raise exception 'Cette publication n''existe plus.' using errcode = 'P0002';
    end if;
    if p.official then
      raise exception 'Les annonces du bureau se retirent depuis l''écran Annonces.' using errcode = '22023';
    end if;
    v_author := p.author_id;
    v_body := coalesce(nullif(p.body, ''), '(photo)');
    v_hidden := p.hidden_at;
    v_what := 'une publication';
    select count(*) into v_reports from public.reports where post_id = p_post and resolved_at is null;
  else
    select * into c from public.comments where id = p_comment for update;
    if not found then
      raise exception 'Ce commentaire n''existe plus.' using errcode = 'P0002';
    end if;
    v_author := c.author_id;
    v_body := c.body;
    v_hidden := c.hidden_at;
    v_what := 'un commentaire';
    select count(*) into v_reports from public.reports where comment_id = p_comment and resolved_at is null;
  end if;

  if p_decision = 'garder' then
    if v_reports = 0 then
      raise exception 'Il n''y a plus rien à examiner ici.' using errcode = '22023';
    end if;
  else
    if v_hidden is not null then
      raise exception 'C''est déjà masqué.' using errcode = '22023';
    end if;
    if v_reason is null then
      select r.reason into v_reason
      from public.reports r
      where (r.post_id = p_post or r.comment_id = p_comment) and r.resolved_at is null
      group by r.reason
      order by count(*) desc, r.reason
      limit 1;
    end if;
    if v_reason is null then
      raise exception 'Choisis le motif.' using errcode = '22023';
    end if;
    if p_decision = 'masquer_avertir' then
      if v_author = auth.uid() then
        raise exception 'Tu ne peux pas t''avertir toi-même.' using errcode = '22023';
      end if;
      if not exists (select 1 from public.profiles where id = v_author and status = 'actif') then
        raise exception 'Seul un membre actif peut être averti.' using errcode = '22023';
      end if;
    end if;

    if p_post is not null then
      update public.posts set hidden_at = now(), hidden_reason = private.reason_label(v_reason) where id = p_post;
    else
      update public.comments set hidden_at = now(), hidden_reason = private.reason_label(v_reason) where id = p_comment;
    end if;

    if p_decision = 'masquer_avertir' then
      insert into public.member_warnings (member_id, given_by, given_by_name, reason)
      values (v_author, auth.uid(), private.full_name(auth.uid()),
        initcap(substr(v_what, 1, 1)) || substr(v_what, 2) || ' masqué' || case when p_post is not null then 'e' else '' end
          || ' : ' || lower(private.reason_label(v_reason)) || '.');
    end if;
  end if;

  update public.reports set resolved_at = now()
  where (post_id = p_post or comment_id = p_comment) and resolved_at is null;

  insert into public.moderation_decisions
    (post_id, comment_id, author_id, author_name, excerpt, decision, reason, reports, decided_by, decided_by_name)
  values (
    p_post, p_comment, v_author, coalesce(private.full_name(v_author), 'Membre parti'), left(v_body, 160),
    p_decision, case when p_decision = 'garder' then null else v_reason end, v_reports,
    case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid())
  );

  v_summary := case p_decision
    when 'garder' then 'a gardé ' || v_what || ' de ' || private.full_name(v_author) || ' après signalement'
    when 'masquer' then 'a masqué ' || v_what || ' de ' || private.full_name(v_author) || ' (' || lower(private.reason_label(v_reason)) || ')'
    else 'a masqué ' || v_what || ' de ' || private.full_name(v_author) || ' avec un avertissement (' || lower(private.reason_label(v_reason)) || ')'
  end;
  perform private.log_activity('moderation', 'moderation_' || p_decision::text, v_summary, v_author,
    jsonb_build_object('signalements', v_reports, 'extrait', left(v_body, 160)));
end;
$$;

-- La file d'attente du bureau : ce qui a été signalé et pas encore traité.
-- Le nombre de signalements et leurs motifs, jamais qui a signalé.
create function public.moderation_queue()
returns table (
  post_id uuid,
  comment_id uuid,
  parent_post_id uuid,
  parent_author_name text,
  author_id uuid,
  author_first_name text,
  author_last_name text,
  author_avatar_path text,
  body text,
  media_path text,
  media_kind text,
  created_at timestamptz,
  hidden boolean,
  reports integer,
  reasons jsonb,
  last_reported_at timestamptz,
  warnings integer,
  last_warning_at timestamptz,
  last_warning_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require('moderation', 'lecture');
  return query
  with by_reason as (
    select r.post_id, r.comment_id, r.reason, count(*)::integer as n, max(r.created_at) as last_at
    from public.reports r
    where r.resolved_at is null
    group by r.post_id, r.comment_id, r.reason
  ),
  pending as (
    select b.post_id, b.comment_id, sum(b.n)::integer as n, max(b.last_at) as last_at,
           jsonb_object_agg(b.reason, b.n) as reasons
    from by_reason b
    group by b.post_id, b.comment_id
  )
  select
    q.post_id,
    q.comment_id,
    c.post_id,
    case when c.id is not null then coalesce(private.full_name(cp.author_id), 'Bureau de l''AEGB') end,
    a.id,
    a.first_name,
    a.last_name,
    a.avatar_path,
    coalesce(p.body, c.body),
    m.path,
    m.kind,
    coalesce(p.created_at, c.created_at),
    coalesce(p.hidden_at, c.hidden_at) is not null,
    q.n,
    q.reasons,
    q.last_at,
    (select count(*)::integer from public.member_warnings w where w.member_id = a.id),
    (select max(w.created_at) from public.member_warnings w where w.member_id = a.id),
    (select w.reason from public.member_warnings w where w.member_id = a.id order by w.created_at desc limit 1)
  from pending q
  left join public.posts p on p.id = q.post_id
  left join public.comments c on c.id = q.comment_id
  left join public.posts cp on cp.id = c.post_id
  left join public.profiles a on a.id = coalesce(p.author_id, c.author_id)
  left join lateral (
    select pm.path, pm.kind from public.post_media pm where pm.post_id = p.id order by pm.position limit 1
  ) m on true
  order by q.n desc, q.last_at desc;
end;
$$;

create function public.moderation_pending()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can('moderation', 'lecture') then (
    select count(*)::integer from (
      select distinct post_id, comment_id from public.reports where resolved_at is null
    ) t
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- Annonces officielles
-- ---------------------------------------------------------------------------

create function public.publish_announcement(
  p_id uuid,
  p_title text,
  p_body text,
  p_audience public.post_audience,
  p_pin boolean,
  p_publish_at timestamptz default null,
  p_media jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_at timestamptz := coalesce(p_publish_at, now());
begin
  perform private.require('annonces');
  if v_title = '' then
    raise exception 'Donne un titre à l''annonce.' using errcode = '22023';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'Le titre dépasse 120 caractères.' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Le message dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if p_publish_at is not null and (p_publish_at < now() + interval '5 minutes' or p_publish_at > now() + interval '90 days') then
    raise exception 'Choisis une date dans les 90 prochains jours, au moins 5 minutes plus tard.' using errcode = '22023';
  end if;
  if exists (select 1 from public.posts where id = p_id) then
    raise exception 'Cette annonce existe déjà.' using errcode = '22023';
  end if;

  insert into public.posts (id, author_id, official, title, body, audience, published_at, pinned_until)
  values (p_id, null, true, v_title, v_body, coalesce(p_audience, 'tous'), v_at,
          case when p_pin then v_at + interval '7 days' end);
  perform private.attach_media(p_id, 'bureau', p_media);

  insert into public.announcement_authors (post_id, written_by, written_by_name)
  values (p_id, case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid()));

  perform private.log_activity('annonces',
    case when p_publish_at is null then 'publication' else 'programmation' end,
    case when p_publish_at is null then 'a publié l''annonce « ' || v_title || ' »'
      else 'a programmé l''annonce « ' || v_title || ' » pour le '
        || to_char(p_publish_at at time zone 'Europe/Paris', 'DD/MM à HH24 "h" MI') end,
    null,
    jsonb_build_object('annonce', p_id, 'public', coalesce(p_audience, 'tous'), 'epinglee', coalesce(p_pin, false)));
end;
$$;

create function public.unpin_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
begin
  perform private.require('annonces');
  select * into p from public.posts where id = p_id and official for update;
  if not found then
    raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
  end if;
  if p.pinned_until is null or p.pinned_until <= now() then
    return;
  end if;
  update public.posts set pinned_until = null where id = p_id;
  perform private.log_activity('annonces', 'desepinglage',
    'a retiré l''épingle de l''annonce « ' || p.title || ' »', null, jsonb_build_object('annonce', p_id));
end;
$$;

create function public.delete_announcement(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  v_paths text[];
begin
  perform private.require('annonces');
  select * into p from public.posts where id = p_id and official for update;
  if not found then
    raise exception 'Cette annonce n''existe plus.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(path), '{}') into v_paths from public.post_media where post_id = p_id;
  delete from public.posts where id = p_id;
  perform private.log_activity('annonces', 'suppression',
    'a supprimé l''annonce « ' || p.title || ' »', null, jsonb_build_object('annonce', p_id));
  return v_paths;
end;
$$;

-- Chaque membre compte une fois, quand l'annonce s'affiche dans son fil.
create function public.mark_seen(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.post_views (post_id, member_id)
  select p.id, (select auth.uid())
  from public.posts p
  where p.id = any (p_ids)
    and p.official
    and p.published_at <= now()
    and public.can_read_post(p.author_id, p.official, p.audience, p.published_at, p.hidden_at)
  on conflict do nothing;
$$;

create function public.announcements_overview()
returns table (
  id uuid,
  title text,
  audience public.post_audience,
  published_at timestamptz,
  pinned_until timestamptz,
  written_by_name text,
  views integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require('annonces', 'lecture');
  return query
  select p.id, p.title, p.audience, p.published_at, p.pinned_until, aa.written_by_name,
         (select count(*)::integer from public.post_views v where v.post_id = p.id)
  from public.posts p
  left join public.announcement_authors aa on aa.post_id = p.id
  where p.official
  order by p.published_at desc
  limit 50;
end;
$$;

-- L'espace pris par les photos et les vidéos, pour le tableau de bord.
create function public.storage_used()
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
    where bucket_id in ('profils', 'publications')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Règles d'accès
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.announcement_authors enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_decisions enable row level security;
alter table public.post_views enable row level security;

revoke all on public.posts, public.announcement_authors, public.post_media, public.comments,
  public.reactions, public.reports, public.moderation_decisions, public.post_views
  from anon, authenticated;

grant select on public.posts, public.announcement_authors, public.post_media, public.comments,
  public.reactions, public.reports, public.moderation_decisions
  to authenticated;

create policy "Publications visibles selon le public et le statut"
  on public.posts for select
  to authenticated
  using (public.can_read_post(author_id, official, audience, published_at, hidden_at));

create policy "Auteurs des annonces visibles par le bureau des annonces"
  on public.announcement_authors for select
  to authenticated
  using ((select public.can('annonces', 'lecture')));

create policy "Photos visibles avec leur publication"
  on public.post_media for select
  to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "Commentaires visibles avec leur publication"
  on public.comments for select
  to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id)
    and (hidden_at is null or author_id = (select auth.uid()) or (select public.can('moderation', 'lecture')))
  );

create policy "Réactions visibles avec ce qu'elles visent"
  on public.reactions for select
  to authenticated
  using (
    (post_id is not null and exists (select 1 from public.posts p where p.id = post_id))
    or (comment_id is not null and exists (select 1 from public.comments c where c.id = comment_id))
  );

create policy "Chacun voit ses propres signalements"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Décisions visibles par la modération"
  on public.moderation_decisions for select
  to authenticated
  using ((select public.can('moderation', 'lecture')));

-- ---------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.can_read_post(uuid, boolean, public.post_audience, timestamptz, timestamptz),
  public.create_post(uuid, text, jsonb),
  public.update_post(uuid, text),
  public.delete_post(uuid),
  public.add_comment(uuid, text, uuid),
  public.update_comment(uuid, text),
  public.delete_comment(uuid),
  public.react(uuid, uuid, public.reaction_kind),
  public.report_content(uuid, uuid, public.report_reason),
  public.moderate(uuid, uuid, public.moderation_decision, public.report_reason),
  public.moderation_queue(),
  public.moderation_pending(),
  public.publish_announcement(uuid, text, text, public.post_audience, boolean, timestamptz, jsonb),
  public.unpin_announcement(uuid),
  public.delete_announcement(uuid),
  public.mark_seen(uuid[]),
  public.announcements_overview(),
  public.storage_used()
  from public, anon;

grant execute on function
  public.can_read_post(uuid, boolean, public.post_audience, timestamptz, timestamptz),
  public.create_post(uuid, text, jsonb),
  public.update_post(uuid, text),
  public.delete_post(uuid),
  public.add_comment(uuid, text, uuid),
  public.update_comment(uuid, text),
  public.delete_comment(uuid),
  public.react(uuid, uuid, public.reaction_kind),
  public.report_content(uuid, uuid, public.report_reason),
  public.moderate(uuid, uuid, public.moderation_decision, public.report_reason),
  public.moderation_queue(),
  public.moderation_pending(),
  public.publish_announcement(uuid, text, text, public.post_audience, boolean, timestamptz, jsonb),
  public.unpin_announcement(uuid),
  public.delete_announcement(uuid),
  public.mark_seen(uuid[]),
  public.announcements_overview(),
  public.storage_used()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Photos et vidéos des publications
-- ---------------------------------------------------------------------------

-- 15 Mo : une vidéo de 30 secondes. Les photos sont réduites dans le
-- téléphone avant l'envoi. Chacun range ses fichiers dans son dossier ; les
-- annonces vont dans le dossier « bureau », qui ne dit pas qui les a écrites.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publications', 'publications', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']);

create policy "Photos des publications visibles par les membres actifs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'publications' and (select public.is_active_member()));

create policy "Chacun dépose les photos de ses publications"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'publications'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active_member()))
      or ((storage.foldername(name))[1] = 'bureau' and (select public.can('annonces')))
    )
  );

create policy "Chacun retire les photos de ses publications"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'publications'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'bureau' and (select public.can('annonces')))
    )
  );
