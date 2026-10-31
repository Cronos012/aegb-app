-- Le compte AEGB dans le fil.
--
-- Ceux qui ont le droit « Annonces » (la communication, et les postes qui
-- voient tout) publient, commentent et réagissent au nom de l'AEGB. Les
-- membres voient « AEGB » ; le nom de la personne qui a écrit est rangé à
-- part et ne se lit qu'avec le droit « Annonces », comme pour les annonces.
-- Une publication AEGB sans titre est une publication ordinaire : pas
-- d'épingle, pas de notification. Les annonces ne changent pas.
-- Un écrit AEGB ne se signale pas : on écrit au compte AEGB dans Messages.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Une publication officielle peut ne pas avoir de titre.
alter table public.posts drop constraint posts_official_or_member;
alter table public.posts add constraint posts_official_or_member check (
  (official and author_id is null)
  or (not official and author_id is not null and title is null and audience = 'tous' and pinned_until is null)
);

alter table public.comments alter column author_id drop not null;
alter table public.comments add column official boolean not null default false;
alter table public.comments add constraint comments_official_or_member check (
  (official and author_id is null) or (not official and author_id is not null)
);

create table public.comment_authors (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  written_by uuid references public.profiles (id) on delete set null,
  written_by_name text not null
);

-- Une seule réaction AEGB par publication ou par commentaire.
alter table public.reactions alter column member_id drop not null;
alter table public.reactions add column official boolean not null default false;
alter table public.reactions add constraint reactions_official_or_member check (
  (official and member_id is null) or (not official and member_id is not null)
);
create unique index reactions_post_official_once on public.reactions (post_id) where official and post_id is not null;
create unique index reactions_comment_official_once on public.reactions (comment_id) where official and comment_id is not null;

alter table public.comment_authors enable row level security;
revoke all on public.comment_authors from anon, authenticated;
grant select on public.comment_authors to authenticated;

create policy "Auteurs des commentaires AEGB visibles par le bureau des annonces"
  on public.comment_authors for select
  to authenticated
  using ((select public.can('annonces', 'lecture')));

-- ---------------------------------------------------------------------------
-- Publier, commenter, réagir au nom de l'AEGB
-- ---------------------------------------------------------------------------

create function public.publish_as_aegb(p_id uuid, p_body text, p_media jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.require('annonces');
  if char_length(v_body) > 2000 then
    raise exception 'La publication dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if v_body = '' and (jsonb_typeof(p_media) is distinct from 'array' or jsonb_array_length(p_media) = 0) then
    raise exception 'Écris quelque chose ou ajoute une photo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.posts where id = p_id) then
    raise exception 'Cette publication existe déjà.' using errcode = '22023';
  end if;

  insert into public.posts (id, author_id, official, title, body, audience)
  values (p_id, null, true, null, v_body, 'tous');
  perform private.attach_media(p_id, 'bureau', p_media);

  insert into public.announcement_authors (post_id, written_by, written_by_name)
  values (p_id, case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid()));

  perform private.log_activity('annonces', 'publication_aegb',
    'a publié dans le fil au nom de l''AEGB : « ' || private.one_line(coalesce(nullif(v_body, ''), 'photo'), 80) || ' »',
    null, jsonb_build_object('publication', p_id));
end;
$$;

create function public.update_aegb_post(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.require('annonces');
  select * into p from public.posts where id = p_id and official and title is null for update;
  if not found then
    raise exception 'Cette publication n''existe plus.' using errcode = 'P0002';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'La publication dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if v_body = '' and not exists (select 1 from public.post_media where post_id = p_id) then
    raise exception 'Écris quelque chose ou ajoute une photo.' using errcode = '22023';
  end if;
  if v_body = p.body then
    return;
  end if;
  update public.posts set body = v_body, edited_at = now() where id = p_id;
  perform private.log_activity('annonces', 'modification_aegb',
    'a modifié une publication AEGB', null, jsonb_build_object('publication', p_id));
end;
$$;

create function public.comment_as_aegb(p_post uuid, p_body text, p_parent uuid default null)
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
  perform private.require('annonces');
  perform private.open_post(p_post);
  if v_body = '' then
    raise exception 'Écris le commentaire.' using errcode = '22023';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Le commentaire dépasse 1 000 caractères.' using errcode = '22023';
  end if;
  if p_parent is not null then
    v_parent := private.open_comment(p_parent);
    if v_parent.post_id <> p_post then
      raise exception 'Ce commentaire n''est pas sous cette publication.' using errcode = '22023';
    end if;
  end if;

  insert into public.comments (post_id, parent_id, author_id, official, body)
  values (p_post, coalesce(v_parent.parent_id, v_parent.id), null, true, v_body)
  returning id into v_id;

  insert into public.comment_authors (comment_id, written_by, written_by_name)
  values (v_id, case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid()));

  perform private.log_activity('annonces', 'commentaire_aegb',
    'a commenté au nom de l''AEGB : « ' || private.one_line(v_body, 80) || ' »',
    null, jsonb_build_object('publication', p_post, 'commentaire', v_id));
  return v_id;
end;
$$;

create function public.react_as_aegb(p_post uuid, p_comment uuid, p_kind public.reaction_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require('annonces');
  if num_nonnulls(p_post, p_comment) <> 1 then
    raise exception 'Réagis à une publication ou à un commentaire.' using errcode = '22023';
  end if;

  if p_post is not null then
    perform private.open_post(p_post);
    if p_kind is null then
      delete from public.reactions where post_id = p_post and official;
    else
      insert into public.reactions (member_id, official, post_id, kind) values (null, true, p_post, p_kind)
      on conflict (post_id) where official and post_id is not null do update set kind = excluded.kind, created_at = now();
    end if;
  else
    perform private.open_comment(p_comment);
    if p_kind is null then
      delete from public.reactions where comment_id = p_comment and official;
    else
      insert into public.reactions (member_id, official, comment_id, kind) values (null, true, p_comment, p_kind)
      on conflict (comment_id) where official and comment_id is not null do update set kind = excluded.kind, created_at = now();
    end if;
  end if;
end;
$$;

-- Modifier ou supprimer un commentaire : le sien, ou un commentaire AEGB avec
-- le droit « Annonces ».
create or replace function public.update_comment(p_id uuid, p_body text)
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
  if not found or not (c.author_id = auth.uid() or (c.official and public.can('annonces'))) then
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

create or replace function public.delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  select * into c from public.comments where id = p_id for update;
  if not found or not (c.author_id = auth.uid() or (c.official and public.can('annonces'))) then
    raise exception 'Tu ne peux supprimer que tes propres commentaires.' using errcode = '42501';
  end if;
  delete from public.comments where id = p_id;
  if c.official then
    perform private.log_activity('annonces', 'suppression_commentaire_aegb',
      'a supprimé un commentaire AEGB', null, jsonb_build_object('publication', c.post_id));
  end if;
end;
$$;

-- Une publication AEGB sans titre n'a pas de titre à citer au journal.
create or replace function public.delete_announcement(p_id uuid)
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
    case when p.title is null then 'a supprimé une publication AEGB'
      else 'a supprimé l''annonce « ' || p.title || ' »' end,
    null, jsonb_build_object('annonce', p_id));
  return v_paths;
end;
$$;

-- Le bureau ne se signale pas à lui-même : on lui écrit.
create function private.check_report_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.comment_id is not null and exists (select 1 from public.comments where id = new.comment_id and official) then
    raise exception 'Les commentaires de l''AEGB ne se signalent pas. Écris au bureau si besoin.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger reports_check_target
  before insert on public.reports
  for each row execute function private.check_report_target();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- Une publication AEGB sans titre ne prévient personne ; l'annonce garde sa
-- notification, signée « AEGB ».
create or replace function private.notify_announcement(p_post uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  r record;
  n integer := 0;
begin
  select * into p from public.posts where id = p_post;
  if not found or not p.official or p.hidden_at is not null or p.published_at > private.clock() then
    return 0;
  end if;
  insert into private.announcements_sent (post_id) values (p_post) on conflict do nothing;
  if not found or p.title is null then
    return 0;
  end if;
  for r in
    select pr.id from public.profiles pr
    where pr.status = 'actif' and pr.deletion_requested_at is null
      and (
        p.audience = 'tous'
        or (p.audience = 'etudiants' and pr.member_type = 'etudiant')
        or (p.audience = 'alumni' and pr.member_type = 'alumni')
        or (p.audience = 'bureau' and exists (select 1 from public.bureau_roles b where b.holder_id = pr.id))
      )
  loop
    perform private.notify(r.id, 'annonces', 'annonce',
      '**AEGB** : ' || private.one_line(p.title, 120), '/app/fil/' || p.id,
      p_official => true,
      p_push_title => 'AEGB · Annonce',
      p_push_body => private.one_line(p.title, 120),
      p_hidden => 'Nouvelle annonce');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Une réaction AEGB prévient l'auteur sous le nom « AEGB », sauf si c'est
-- lui-même qui a réagi au nom de l'AEGB.
create or replace function private.on_reaction_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
begin
  if new.post_id is null then
    return null;
  end if;
  select * into p from public.posts where id = new.post_id;
  if p.author_id is null or p.hidden_at is not null then
    return null;
  end if;
  if new.official then
    if p.author_id is not distinct from auth.uid() then
      return null;
    end if;
    perform private.notify(p.author_id, 'reactions', 'reaction',
      '**AEGB** a réagi à ta publication', '/app/fil/' || p.id,
      p_official => true,
      p_group => 'reactions-aegb:' || p.id,
      p_tag => 'publication:' || p.id,
      p_throttle => interval '1 hour',
      p_hidden => 'Nouvelle réaction');
    return null;
  end if;
  perform private.notify(p.author_id, 'reactions', 'reaction',
    '**{nom}** a réagi à ta publication', '/app/fil/' || p.id,
    p_actor => new.member_id,
    p_group => 'reactions:' || p.id,
    p_text_many => '**{nom}** et {autres} ont réagi à ta publication',
    p_tag => 'publication:' || p.id,
    p_throttle => interval '1 hour',
    p_hidden => 'Nouvelle réaction');
  return null;
end;
$$;

create or replace function private.on_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  v_parent uuid;
  v_me uuid := auth.uid();
begin
  select * into p from public.posts where id = new.post_id;
  if not found or p.hidden_at is not null then
    return null;
  end if;
  if new.parent_id is not null then
    select author_id into v_parent from public.comments where id = new.parent_id;
  end if;

  if new.official then
    if v_parent is not null and v_parent is distinct from v_me then
      perform private.notify(v_parent, 'reactions', 'reponse',
        '**AEGB** a répondu à ton commentaire : ' || private.excerpt(new.body), '/app/fil/' || p.id,
        p_official => true,
        p_tag => 'publication:' || p.id,
        p_throttle => interval '1 hour',
        p_hidden => 'Nouvelle réponse');
    end if;
    if p.author_id is not null and p.author_id is distinct from v_parent and p.author_id is distinct from v_me then
      perform private.notify(p.author_id, 'reactions', 'commentaire',
        '**AEGB** a commenté ta publication : ' || private.excerpt(new.body), '/app/fil/' || p.id,
        p_official => true,
        p_tag => 'publication:' || p.id,
        p_throttle => interval '1 hour',
        p_hidden => 'Nouveau commentaire');
    end if;
    return null;
  end if;

  if v_parent is not null then
    perform private.notify(v_parent, 'reactions', 'reponse',
      '**{nom}** a répondu à ton commentaire : ' || private.excerpt(new.body), '/app/fil/' || p.id,
      p_actor => new.author_id,
      p_group => 'reponses:' || new.parent_id,
      p_text_many => '**{nom}** et {autres} ont répondu à ton commentaire',
      p_tag => 'publication:' || p.id,
      p_throttle => interval '1 hour',
      p_hidden => 'Nouvelle réponse');
  end if;
  if p.author_id is not null and p.author_id is distinct from v_parent then
    perform private.notify(p.author_id, 'reactions', 'commentaire',
      '**{nom}** a commenté ta publication : ' || private.excerpt(new.body), '/app/fil/' || p.id,
      p_actor => new.author_id,
      p_group => 'commentaires:' || p.id,
      p_text_many => '**{nom}** et {autres} ont commenté ta publication',
      p_tag => 'publication:' || p.id,
      p_throttle => interval '1 hour',
      p_hidden => 'Nouveau commentaire');
  end if;
  return null;
end;
$$;

revoke all on function public.publish_as_aegb(uuid, text, jsonb) from public, anon;
revoke all on function public.update_aegb_post(uuid, text) from public, anon;
revoke all on function public.comment_as_aegb(uuid, text, uuid) from public, anon;
revoke all on function public.react_as_aegb(uuid, uuid, public.reaction_kind) from public, anon;
revoke all on function private.check_report_target() from public, anon, authenticated;
grant execute on function public.publish_as_aegb(uuid, text, jsonb) to authenticated;
grant execute on function public.update_aegb_post(uuid, text) to authenticated;
grant execute on function public.comment_as_aegb(uuid, text, uuid) to authenticated;
grant execute on function public.react_as_aegb(uuid, uuid, public.reaction_kind) to authenticated;
