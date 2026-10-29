-- Lot 3 : les messages privés, le grand groupe AEGB, les petits groupes, le
-- compte officiel AEGB (bienvenue automatique et réponses du bureau) et les
-- messages signalés (plan validé par Cronos le 29 octobre 2026).
--
-- Le bureau ne lit pas les conversations : aucune fonction ne lui ouvre une
-- conversation privée ou un groupe. Il voit seulement un message qu'un membre
-- a signalé, et les conversations des membres avec le compte AEGB.
--
-- Les messages ne se lisent que par des fonctions de la base : elles cachent
-- le texte d'un message supprimé ou masqué, et ce qu'envoie un membre bloqué.

create type public.conversation_kind as enum ('prive', 'groupe', 'grand_groupe', 'aegb');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- prive : deux membres, une seule conversation par paire (pair_key).
-- aegb : un membre et le compte officiel, une par membre (member_id).
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  title text check (char_length(title) between 1 and 60),
  photo_path text,
  pair_key text unique,
  member_id uuid unique references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_shape check (
    (kind = 'prive' and pair_key is not null and title is null and member_id is null)
    or (kind = 'groupe' and title is not null and pair_key is null and member_id is null)
    or (kind = 'grand_groupe' and pair_key is null and member_id is null)
    or (kind = 'aegb' and member_id is not null and pair_key is null and title is null)
  ),
  constraint conversations_photo_in_folder check (photo_path is null or starts_with(photo_path, id::text || '/'))
);

create unique index conversations_one_grand_groupe on public.conversations (kind) where kind = 'grand_groupe';

-- last_read_at : jusqu'où le membre a lu. Sert aux pastilles et à « Vu ».
create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  is_manager boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, member_id)
);

create index conversation_members_member_idx on public.conversation_members (member_id);

-- kind : message (d'un membre ou du compte AEGB), bienvenue (envoyé tout seul
-- à la validation), arrivee (annonce dans le grand groupe), systeme (« a créé
-- le groupe », « a quitté le groupe »).
-- Un message du compte AEGB n'a pas d'expéditeur visible : as_aegb est vrai
-- et qui l'a écrit est rangé à part, pour le bureau.
-- blocked_for : le message privé est parti pendant que le destinataire
-- bloquait l'expéditeur. Il ne lui arrive jamais, même après déblocage.
-- L'identifiant est choisi par l'appli, pour ranger les fichiers avant l'envoi.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  kind text not null default 'message' check (kind in ('message', 'bienvenue', 'arrivee', 'systeme')),
  sender_id uuid references public.profiles (id) on delete set null,
  as_aegb boolean not null default false,
  body text check (char_length(body) <= 4000),
  meta jsonb not null default '{}'::jsonb,
  post_id uuid references public.posts (id) on delete set null,
  reply_to uuid references public.messages (id) on delete set null,
  blocked_for uuid references public.profiles (id) on delete set null,
  -- L'heure exacte, pas celle du début de la transaction : la bienvenue part
  -- dans la même transaction que l'entrée du membre et doit rester « non lue ».
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 300)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

-- 10 photos, ou un vocal, ou un document par message.
create table public.message_files (
  message_id uuid not null references public.messages (id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  kind text not null check (kind in ('photo', 'vocal', 'document')),
  path text not null unique,
  name text check (char_length(name) between 1 and 120),
  size integer check (size >= 0),
  mime text,
  width integer check (width > 0),
  height integer check (height > 0),
  duration numeric(6, 1) check (duration >= 0 and duration <= 121),
  primary key (message_id, position)
);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (message_id, member_id)
);

create index message_reactions_member_idx on public.message_reactions (member_id);

-- Qui a répondu au nom d'AEGB : lisible par le bureau seulement.
create table public.aegb_replies (
  message_id uuid primary key references public.messages (id) on delete cascade,
  written_by uuid references public.profiles (id) on delete set null,
  written_by_name text not null
);

-- Le membre bloqué n'est pas prévenu : ses messages privés n'arrivent plus.
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- Le message de bienvenue et ses réglages : une seule ligne.
-- {Prénom}, {Ville} et {Type} sont remplacés pour chaque membre.
create table public.aegb_settings (
  id boolean primary key default true check (id),
  welcome_text text not null check (char_length(welcome_text) between 1 and 2000),
  welcome_actions text[] not null default array['charte', 'profil'],
  announce_arrival boolean not null default true,
  updated_at timestamptz,
  updated_by_name text
);

insert into public.aegb_settings (welcome_text) values (
  'Bonjour {Prénom}, bienvenue dans l''AEGB ! Ton compte est validé.' || chr(10) || chr(10)
  || 'Tu fais maintenant partie du grand groupe : présente-toi, on a hâte de te connaître. Avant tout, prends deux minutes pour lire la charte.' || chr(10) || chr(10)
  || 'Une question ? Réponds simplement à ce message, un membre du bureau te répondra.'
);

-- Les messages signalés rejoignent la modération du lot 2. Ils ont leur
-- propre table, pour ne rien retirer à celle des publications.
create table public.message_reports (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (message_id, reporter_id)
);

create index message_reports_pending_idx on public.message_reports (created_at) where resolved_at is null;
create index message_reports_reporter_idx on public.message_reports (reporter_id);

alter table public.moderation_decisions add column message_id uuid references public.messages (id) on delete set null;

-- L'écran du bureau devient « Compte officiel AEGB » : répondre aux membres
-- et régler la bienvenue. Les postes qui l'ont déjà gardent leurs droits.
update public.bureau_screens
set label = 'Compte officiel AEGB', description = 'Répondre au nom d''AEGB, régler la bienvenue'
where code = 'bienvenue';

-- ---------------------------------------------------------------------------
-- Qui voit une conversation
-- ---------------------------------------------------------------------------

-- Un membre validé voit les conversations dont il fait partie. Le bureau qui
-- a le droit « Compte officiel AEGB » voit aussi les conversations des
-- membres avec AEGB, et rien d'autre.
create function public.can_read_conversation(p_conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and (
    exists (
      select 1 from public.conversation_members
      where conversation_id = p_conv and member_id = (select auth.uid())
    )
    or (
      public.can('bienvenue', 'lecture')
      and exists (select 1 from public.conversations where id = p_conv and kind = 'aegb')
    )
  );
$$;

-- Un fichier se lit avec son message : jamais celui d'un message supprimé,
-- ni celui d'un message masqué (sauf pour son auteur et la modération).
-- La photo d'un groupe se lit par ses membres.
create function public.can_read_message_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and (
    exists (
      select 1
      from public.message_files f
      join public.messages m on m.id = f.message_id
      where f.path = p_name
        and m.deleted_at is null
        and (
          (public.can_read_conversation(m.conversation_id)
            and (m.hidden_at is null or m.sender_id = (select auth.uid())))
          or (public.can('moderation', 'lecture')
            and exists (select 1 from public.message_reports r where r.message_id = m.id))
        )
    )
    or exists (
      select 1 from public.conversations c
      where c.photo_path = p_name and public.can_read_conversation(c.id)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

create function private.grand_groupe()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.conversations where kind = 'grand_groupe';
$$;

-- La conversation d'un membre avec AEGB, créée au besoin.
create function private.ensure_aegb(p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where kind = 'aegb' and member_id = p_member;
  if v_id is null then
    insert into public.conversations (kind, member_id) values ('aegb', p_member)
    on conflict (member_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversations where kind = 'aegb' and member_id = p_member;
    end if;
  end if;
  insert into public.conversation_members (conversation_id, member_id) values (v_id, p_member)
  on conflict do nothing;
  return v_id;
end;
$$;

-- Le texte de bienvenue, rempli pour un membre.
create function private.welcome_text(p_template text, p_member uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select replace(replace(replace(p_template,
    '{Prénom}', p.first_name),
    '{Ville}', coalesce(p.city, '')),
    '{Type}', lower(private.type_label(p.member_type)))
  from public.profiles p
  where p.id = p_member;
$$;

create function private.send_welcome(p_member uuid, p_test boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.aegb_settings;
  v_conv uuid := private.ensure_aegb(p_member);
begin
  select * into s from public.aegb_settings;
  insert into public.messages (conversation_id, kind, as_aegb, body, meta)
  values (v_conv, 'bienvenue', true, private.welcome_text(s.welcome_text, p_member),
          jsonb_build_object('actions', to_jsonb(s.welcome_actions), 'essai', p_test));
  update public.conversations set last_message_at = now() where id = v_conv;
end;
$$;

-- Un message « système » dans un groupe : « Awa a quitté le groupe ».
create function private.system_message(p_conv uuid, p_actor uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.messages (conversation_id, kind, sender_id, body)
  values (p_conv, 'systeme', p_actor, p_text);
  update public.conversations set last_message_at = now() where id = p_conv;
end;
$$;

-- Ce qu'affiche la liste des conversations pour un message.
create function private.message_preview(p_message uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.deleted_at is not null then 'Message supprimé'
    when m.hidden_at is not null then 'Message masqué par le bureau'
    when coalesce(btrim(m.body), '') <> '' then left(regexp_replace(m.body, '\s+', ' ', 'g'), 140)
    when f.kind = 'photo' and f.n > 1 then f.n || ' photos'
    when f.kind = 'photo' then 'Photo'
    when f.kind = 'vocal' then 'Message vocal (' || floor(coalesce(f.duration, 0) / 60)::integer || ':'
      || lpad((floor(coalesce(f.duration, 0))::integer % 60)::text, 2, '0') || ')'
    when f.kind = 'document' then 'Document : ' || coalesce(f.name, 'fichier')
    when (m.meta ->> 'publication')::boolean then 'Publication partagée'
    else ''
  end
  from public.messages m
  left join lateral (
    select min(mf.kind) as kind, count(*)::integer as n, max(mf.duration) as duration, max(mf.name) as name
    from public.message_files mf where mf.message_id = m.id
  ) f on true
  where m.id = p_message;
$$;

-- Les fichiers d'un message, déjà déposés dans son dossier.
create function private.attach_message_files(p_conv uuid, p_message uuid, p_files jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_kinds text[];
  v_n integer;
  f jsonb;
  i integer := 0;
begin
  if jsonb_typeof(v_files) <> 'array' then
    raise exception 'Les fichiers joints sont mal décrits.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_files);
  if v_n = 0 then
    return 0;
  end if;
  select array_agg(distinct coalesce(e ->> 'kind', '')) into v_kinds from jsonb_array_elements(v_files) e;
  if array_length(v_kinds, 1) > 1 then
    raise exception 'Envoie les photos, le vocal et le document séparément.' using errcode = '22023';
  end if;
  if v_kinds[1] = 'photo' and v_n > 10 then
    raise exception 'Dix photos au plus par envoi.' using errcode = '22023';
  end if;
  if v_kinds[1] in ('vocal', 'document') and v_n > 1 then
    raise exception 'Un seul vocal ou un seul document par envoi.' using errcode = '22023';
  end if;
  if v_kinds[1] not in ('photo', 'vocal', 'document') then
    raise exception 'Seuls les photos, les vocaux et les documents sont acceptés.' using errcode = '22023';
  end if;

  for f in select value from jsonb_array_elements(v_files) loop
    if not starts_with(coalesce(f ->> 'path', ''), p_conv::text || '/' || p_message::text || '/')
       or not exists (select 1 from storage.objects where bucket_id = 'messages' and name = f ->> 'path') then
      raise exception 'Un fichier n''a pas été envoyé correctement. Réessaie.' using errcode = '22023';
    end if;
    if f ->> 'kind' = 'vocal' and coalesce(nullif(f ->> 'duration', '')::numeric, 0) > 121 then
      raise exception 'Un vocal dure 2 minutes au plus.' using errcode = '22023';
    end if;
    insert into public.message_files (message_id, position, kind, path, name, size, mime, width, height, duration)
    values (
      p_message, i, f ->> 'kind', f ->> 'path',
      nullif(left(btrim(coalesce(f ->> 'name', '')), 120), ''),
      nullif(f ->> 'size', '')::integer,
      nullif(f ->> 'mime', ''),
      nullif(f ->> 'width', '')::integer,
      nullif(f ->> 'height', '')::integer,
      nullif(f ->> 'duration', '')::numeric
    );
    i := i + 1;
  end loop;
  return v_n;
end;
$$;

-- Un groupe que je gère.
create function private.managed_group(p_conv uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
begin
  perform private.require_member();
  select * into c from public.conversations where id = p_conv for update;
  if not found or c.kind <> 'groupe'
     or not exists (select 1 from public.conversation_members where conversation_id = p_conv and member_id = auth.uid()) then
    raise exception 'Ce groupe n''existe plus.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and member_id = auth.uid() and is_manager
  ) then
    raise exception 'Seuls les gérants du groupe peuvent faire cela.' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- « Awa Diallo, Moussa Camara et Fanta Bah »
create function private.names_list(p_ids uuid[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select n, row_number() over (order by n) as rn, count(*) over () as total
    from (select private.full_name(id) as n from unnest(p_ids) as id) x
  )
  select coalesce(
    string_agg(n, ', ' order by rn) filter (where rn < total)
      || ' et ' || max(n) filter (where rn = total and total > 1),
    max(n) filter (where rn = total),
    ''
  )
  from t;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Arrivée d'un membre
-- ---------------------------------------------------------------------------

-- À la première validation : le grand groupe, la conversation avec AEGB, le
-- message de bienvenue et l'annonce dans le grand groupe. Un membre réactivé
-- retrouve ses conversations, sans nouveau message.
create function private.on_member_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.grand_groupe();
  v_announce boolean;
begin
  if new.status <> 'actif' or old.status = 'actif' then
    return null;
  end if;

  insert into public.conversation_members (conversation_id, member_id) values (v_group, new.id)
  on conflict do nothing;
  perform private.ensure_aegb(new.id);

  if old.validated_at is null and new.validated_at is not null then
    perform private.send_welcome(new.id);
    select announce_arrival into v_announce from public.aegb_settings;
    if v_announce then
      insert into public.messages (conversation_id, kind, as_aegb, body, meta)
      values (v_group, 'arrivee', true,
              private.full_name(new.id) || ' vient de rejoindre l''AEGB. Souhaitez-lui la bienvenue !',
              jsonb_build_object('member', new.id));
      update public.conversations set last_message_at = now() where id = v_group;
      -- Sa propre annonce n'est pas « non lue » pour le nouveau membre.
      update public.conversation_members set last_read_at = clock_timestamp()
      where conversation_id = v_group and member_id = new.id;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.on_member_activated() from public, anon, authenticated;

create trigger profiles_member_activated
  after update of status on public.profiles
  for each row execute function private.on_member_activated();

-- ---------------------------------------------------------------------------
-- Ouvrir une conversation
-- ---------------------------------------------------------------------------

create function public.open_private(p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_id uuid;
begin
  perform private.require_member();
  if p_member is null or p_member = auth.uid() then
    raise exception 'Choisis un autre membre.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_member and status = 'actif') then
    raise exception 'Ce membre n''est pas joignable.' using errcode = 'P0002';
  end if;

  v_key := least(auth.uid()::text, p_member::text) || ':' || greatest(auth.uid()::text, p_member::text);
  select id into v_id from public.conversations where pair_key = v_key;
  if v_id is null then
    insert into public.conversations (kind, pair_key, created_by) values ('prive', v_key, auth.uid())
    on conflict (pair_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversations where pair_key = v_key;
    end if;
  end if;
  insert into public.conversation_members (conversation_id, member_id)
  values (v_id, auth.uid()), (v_id, p_member)
  on conflict do nothing;
  return v_id;
end;
$$;

-- Ma conversation avec le compte AEGB.
create function public.my_aegb()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  return private.ensure_aegb(auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Envoyer, supprimer, réagir, lire
-- ---------------------------------------------------------------------------

-- Dans une conversation AEGB, le membre écrit en son nom ; le bureau qui a le
-- droit « Compte officiel AEGB » répond au nom d'AEGB.
create function public.send_message(
  p_conversation uuid,
  p_id uuid,
  p_body text,
  p_reply_to uuid default null,
  p_files jsonb default '[]'::jsonb,
  p_post uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_as_aegb boolean := false;
  v_other uuid;
  v_blocked_for uuid;
  v_files integer;
begin
  perform private.require_member();
  select * into c from public.conversations where id = p_conversation;
  if not found or not public.can_read_conversation(p_conversation) then
    raise exception 'Cette conversation n''existe plus.' using errcode = 'P0002';
  end if;

  if c.kind = 'aegb' and c.member_id <> auth.uid() then
    perform private.require('bienvenue');
    v_as_aegb := true;
  elsif not exists (select 1 from public.conversation_members where conversation_id = p_conversation and member_id = auth.uid()) then
    raise exception 'Tu ne fais plus partie de cette conversation.' using errcode = '42501';
  end if;

  if c.kind = 'prive' then
    select member_id into v_other from public.conversation_members
    where conversation_id = p_conversation and member_id <> auth.uid();
    if v_other is null or not exists (select 1 from public.profiles where id = v_other and status = 'actif') then
      raise exception 'Ce membre n''est plus joignable.' using errcode = '22023';
    end if;
    if exists (select 1 from public.blocks where blocker_id = auth.uid() and blocked_id = v_other) then
      raise exception 'Tu as bloqué ce membre. Débloque-le depuis son profil pour lui écrire.' using errcode = '22023';
    end if;
    -- Bloqué par l'autre : le message part, mais ne lui arrivera pas. Il n'en sait rien.
    if exists (select 1 from public.blocks where blocker_id = v_other and blocked_id = auth.uid()) then
      v_blocked_for := v_other;
    end if;
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'Ton message dépasse 4 000 caractères.' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages where id = p_id) then
    raise exception 'Ce message est déjà parti.' using errcode = '22023';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and conversation_id = p_conversation and deleted_at is null
  ) then
    raise exception 'Le message auquel tu réponds n''est plus là.' using errcode = '22023';
  end if;
  if p_post is not null then
    perform private.open_post(p_post);
  end if;

  insert into public.messages (id, conversation_id, sender_id, as_aegb, body, post_id, reply_to, blocked_for, meta)
  values (p_id, p_conversation, case when v_as_aegb then null else auth.uid() end, v_as_aegb, v_body, p_post, p_reply_to,
          v_blocked_for, case when p_post is not null then jsonb_build_object('publication', true) else '{}'::jsonb end);
  v_files := private.attach_message_files(p_conversation, p_id, p_files);
  if v_body is null and v_files = 0 and p_post is null then
    raise exception 'Écris un message ou joins un fichier.' using errcode = '22023';
  end if;

  if v_as_aegb then
    insert into public.aegb_replies (message_id, written_by, written_by_name)
    values (p_id, case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid()));
  end if;

  update public.conversations set last_message_at = now() where id = p_conversation;
  update public.conversation_members set last_read_at = clock_timestamp()
  where conversation_id = p_conversation and member_id = auth.uid();
end;
$$;

-- Supprimer pour tous : il reste « Message supprimé ». Rend la liste des
-- fichiers, que l'appli efface ensuite.
create function public.delete_message(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  v_paths text[];
begin
  perform private.require_member();
  select * into m from public.messages where id = p_id for update;
  if not found or m.kind <> 'message' or m.deleted_at is not null then
    raise exception 'Ce message n''est plus là.' using errcode = 'P0002';
  end if;
  if m.as_aegb then
    if not (public.can('bienvenue') and public.can_read_conversation(m.conversation_id)) then
      raise exception 'Seul le bureau peut supprimer un message d''AEGB.' using errcode = '42501';
    end if;
  elsif m.sender_id is distinct from auth.uid() then
    raise exception 'Tu ne peux supprimer que tes propres messages.' using errcode = '42501';
  end if;

  select coalesce(array_agg(path), '{}') into v_paths from public.message_files where message_id = p_id;
  delete from public.message_files where message_id = p_id;
  delete from public.message_reactions where message_id = p_id;
  update public.messages set deleted_at = now(), body = null, post_id = null, meta = '{}'::jsonb where id = p_id;
  return v_paths;
end;
$$;

-- Une réaction par personne : en choisir une autre la remplace, null l'enlève.
create function public.react_message(p_id uuid, p_kind public.reaction_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  perform private.require_member();
  select * into m from public.messages where id = p_id;
  if not found or m.deleted_at is not null or m.hidden_at is not null or m.kind = 'systeme'
     or not exists (select 1 from public.conversation_members where conversation_id = m.conversation_id and member_id = auth.uid()) then
    raise exception 'Ce message n''est plus là.' using errcode = 'P0002';
  end if;
  if p_kind is null then
    delete from public.message_reactions where message_id = p_id and member_id = auth.uid();
  else
    insert into public.message_reactions (message_id, member_id, kind) values (p_id, auth.uid(), p_kind)
    on conflict (message_id, member_id) do update set kind = excluded.kind, created_at = now();
  end if;
end;
$$;

create function public.mark_read(p_conversation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members set last_read_at = clock_timestamp()
  where conversation_id = p_conversation and member_id = (select auth.uid()) and (select public.is_active_member());
$$;

-- ---------------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------------

-- La liste de mes conversations. Une conversation privée sans message n'y
-- figure pas encore.
create function public.my_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  title text,
  photo_path text,
  other_id uuid,
  other_first_name text,
  other_last_name text,
  other_avatar_path text,
  members integer,
  last_at timestamptz,
  last_kind text,
  last_sender_id uuid,
  last_sender_name text,
  last_as_aegb boolean,
  last_preview text,
  unread integer,
  blocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_member();
  return query
  select
    c.id,
    c.kind,
    case c.kind when 'grand_groupe' then 'Grand groupe AEGB' when 'aegb' then 'AEGB' else c.title end,
    c.photo_path,
    o.id,
    o.first_name,
    o.last_name,
    o.avatar_path,
    (select count(*)::integer from public.conversation_members x
       join public.profiles px on px.id = x.member_id and px.status = 'actif'
     where x.conversation_id = c.id),
    coalesce(l.created_at, c.last_message_at, c.created_at),
    l.kind,
    l.sender_id,
    ps.first_name,
    l.as_aegb,
    case when l.id is not null then private.message_preview(l.id) end,
    (select count(*)::integer from public.messages u
     where u.conversation_id = c.id
       and u.created_at > me.last_read_at
       and u.sender_id is distinct from auth.uid()
       and u.kind <> 'systeme'
       and u.blocked_for is distinct from auth.uid()),
    o.id is not null and exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = o.id)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select p.id, p.first_name, p.last_name, p.avatar_path
    from public.conversation_members x
    join public.profiles p on p.id = x.member_id
    where c.kind = 'prive' and x.conversation_id = c.id and x.member_id <> auth.uid()
    limit 1
  ) o on true
  left join lateral (
    select m.id, m.kind, m.sender_id, m.as_aegb, m.created_at
    from public.messages m
    where m.conversation_id = c.id
      and m.blocked_for is distinct from auth.uid()
    order by m.created_at desc
    limit 1
  ) l on true
  left join public.profiles ps on ps.id = l.sender_id
  where me.member_id = auth.uid()
    and (c.kind <> 'prive' or l.id is not null)
  order by coalesce(l.created_at, c.last_message_at, c.created_at) desc;
end;
$$;

-- L'en-tête d'une conversation : titre, membres d'un groupe, l'autre membre
-- d'une conversation privée, le membre d'une conversation AEGB (pour le bureau).
create function public.conversation_info(p_conversation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  v_member boolean;
  v_members jsonb := '[]'::jsonb;
  v_other jsonb;
  v_count integer;
begin
  perform private.require_member();
  select * into c from public.conversations where id = p_conversation;
  if not found or not public.can_read_conversation(p_conversation) then
    raise exception 'Cette conversation n''existe plus.' using errcode = 'P0002';
  end if;
  v_member := exists (select 1 from public.conversation_members where conversation_id = c.id and member_id = auth.uid());

  select count(*)::integer into v_count
  from public.conversation_members x join public.profiles p on p.id = x.member_id and p.status = 'actif'
  where x.conversation_id = c.id;

  if c.kind = 'groupe' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_path', p.avatar_path,
      'city', p.city, 'member_type', p.member_type, 'is_manager', x.is_manager, 'joined_at', x.joined_at
    ) order by x.is_manager desc, x.joined_at), '[]'::jsonb)
    into v_members
    from public.conversation_members x
    join public.profiles p on p.id = x.member_id and p.status = 'actif'
    where x.conversation_id = c.id;
  end if;

  if c.kind in ('prive', 'aegb') then
    select jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_path', p.avatar_path,
      'city', p.city, 'member_type', p.member_type, 'status', p.status, 'validated_at', p.validated_at,
      'last_read_at', x.last_read_at,
      'blocked', exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
    ) into v_other
    from public.conversation_members x
    join public.profiles p on p.id = x.member_id
    where x.conversation_id = c.id
      and (case when c.kind = 'aegb' then x.member_id = c.member_id and c.member_id <> auth.uid() else x.member_id <> auth.uid() end)
    limit 1;
  end if;

  return jsonb_build_object(
    'id', c.id,
    'kind', c.kind,
    'title', case c.kind when 'grand_groupe' then 'Grand groupe AEGB' when 'aegb' then 'AEGB' else c.title end,
    'photo_path', c.photo_path,
    'created_by', c.created_by,
    'created_by_name', private.full_name(c.created_by),
    'created_at', c.created_at,
    'members_count', v_count,
    'member', v_member,
    'manager', exists (select 1 from public.conversation_members where conversation_id = c.id and member_id = auth.uid() and is_manager),
    'as_aegb', c.kind = 'aegb' and c.member_id <> auth.uid(),
    'members', v_members,
    'other', v_other
  );
end;
$$;

-- Les messages d'une conversation, du plus récent au plus ancien. Le texte et
-- les fichiers d'un message supprimé ou masqué ne partent pas (sauf, pour un
-- message masqué, vers son auteur). Dans une conversation privée, ce
-- qu'a envoyé un membre pendant qu'il était bloqué n'arrive pas.
create function public.conversation_messages(p_conversation uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (
  id uuid,
  kind text,
  sender_id uuid,
  sender_first_name text,
  sender_last_name text,
  sender_avatar_path text,
  as_aegb boolean,
  written_by_name text,
  body text,
  meta jsonb,
  files jsonb,
  post_id uuid,
  reply jsonb,
  reactions jsonb,
  created_at timestamptz,
  deleted boolean,
  hidden boolean,
  hidden_reason text,
  reported boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c public.conversations;
  v_staff boolean := public.can('bienvenue', 'lecture');
begin
  perform private.require_member();
  select * into c from public.conversations where id = p_conversation;
  if not found or not public.can_read_conversation(p_conversation) then
    raise exception 'Cette conversation n''existe plus.' using errcode = 'P0002';
  end if;

  return query
  with visible as (
    select m.*,
           (m.deleted_at is not null or (m.hidden_at is not null and m.sender_id is distinct from auth.uid())) as masked
    from public.messages m
    where m.conversation_id = p_conversation
      and (p_before is null or m.created_at < p_before)
      and m.blocked_for is distinct from auth.uid()
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select
    v.id,
    v.kind,
    v.sender_id,
    s.first_name,
    s.last_name,
    s.avatar_path,
    v.as_aegb,
    case when v.as_aegb and v_staff and c.kind = 'aegb' then ar.written_by_name end,
    case when v.masked then null else v.body end,
    case when v.masked then '{}'::jsonb else v.meta end,
    case when v.masked then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', f.path, 'kind', f.kind, 'name', f.name, 'size', f.size, 'mime', f.mime,
        'width', f.width, 'height', f.height, 'duration', f.duration) order by f.position)
      from public.message_files f where f.message_id = v.id), '[]'::jsonb) end,
    case when v.masked then null else v.post_id end,
    case when r.id is not null then jsonb_build_object(
      'id', r.id,
      'sender_id', r.sender_id,
      'as_aegb', r.as_aegb,
      'sender_name', case when r.as_aegb then 'AEGB' else coalesce(rs.first_name || ' ' || rs.last_name, 'Membre parti') end,
      'excerpt', case when r.deleted_at is not null or (r.hidden_at is not null and r.sender_id is distinct from auth.uid())
                      then null else private.message_preview(r.id) end
    ) end,
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'member_id', x.member_id) order by x.created_at)
      from public.message_reactions x where x.message_id = v.id), '[]'::jsonb),
    v.created_at,
    v.deleted_at is not null,
    v.hidden_at is not null,
    v.hidden_reason,
    exists (select 1 from public.message_reports rp where rp.message_id = v.id and rp.reporter_id = auth.uid())
  from visible v
  left join public.profiles s on s.id = v.sender_id
  left join public.aegb_replies ar on ar.message_id = v.id
  left join public.messages r on r.id = v.reply_to
  left join public.profiles rs on rs.id = r.sender_id
  order by v.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Petits groupes
-- ---------------------------------------------------------------------------

create function public.create_group(p_title text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_members uuid[];
  v_id uuid;
begin
  perform private.require_member();
  if v_title = '' then
    raise exception 'Donne un nom au groupe.' using errcode = '22023';
  end if;
  if char_length(v_title) > 60 then
    raise exception 'Le nom du groupe dépasse 60 caractères.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_members
  from unnest(coalesce(p_members, '{}')) m
  where m <> auth.uid();
  if cardinality(v_members) = 0 then
    raise exception 'Choisis au moins un membre.' using errcode = '22023';
  end if;
  if cardinality(v_members) > 99 then
    raise exception 'Un groupe compte 100 membres au plus.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_members) m where not exists (select 1 from public.profiles where id = m and status = 'actif')) then
    raise exception 'Un des membres choisis n''est pas joignable.' using errcode = '22023';
  end if;

  insert into public.conversations (kind, title, created_by) values ('groupe', v_title, auth.uid()) returning id into v_id;
  insert into public.conversation_members (conversation_id, member_id, is_manager) values (v_id, auth.uid(), true);
  insert into public.conversation_members (conversation_id, member_id) select v_id, m from unnest(v_members) m;
  perform private.system_message(v_id, auth.uid(), private.full_name(auth.uid()) || ' a créé le groupe « ' || v_title || ' »');
  return v_id;
end;
$$;

-- Le nom et la photo. La photo est déjà déposée dans le dossier du groupe.
create function public.update_group(p_conversation uuid, p_title text, p_photo text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations := private.managed_group(p_conversation);
  v_title text := btrim(coalesce(p_title, ''));
  v_old text := c.photo_path;
begin
  if v_title = '' then
    raise exception 'Donne un nom au groupe.' using errcode = '22023';
  end if;
  if char_length(v_title) > 60 then
    raise exception 'Le nom du groupe dépasse 60 caractères.' using errcode = '22023';
  end if;
  if p_photo is not null and (
    not starts_with(p_photo, p_conversation::text || '/')
    or not exists (select 1 from storage.objects where bucket_id = 'messages' and name = p_photo)
  ) then
    raise exception 'La photo n''a pas été envoyée correctement. Réessaie.' using errcode = '22023';
  end if;

  update public.conversations
  set title = v_title, photo_path = coalesce(p_photo, photo_path)
  where id = p_conversation;
  if v_title <> c.title then
    perform private.system_message(p_conversation, auth.uid(),
      private.full_name(auth.uid()) || ' a renommé le groupe « ' || v_title || ' »');
  end if;
  -- L'ancienne photo, que l'appli efface.
  return case when p_photo is not null and v_old is distinct from p_photo then v_old end;
end;
$$;

create function public.add_group_members(p_conversation uuid, p_members uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations := private.managed_group(p_conversation);
  v_new uuid[];
begin
  select coalesce(array_agg(distinct m), '{}') into v_new
  from unnest(coalesce(p_members, '{}')) m
  where exists (select 1 from public.profiles where id = m and status = 'actif')
    and not exists (select 1 from public.conversation_members where conversation_id = c.id and member_id = m);
  if cardinality(v_new) = 0 then
    raise exception 'Ces membres sont déjà dans le groupe.' using errcode = '22023';
  end if;
  if (select count(*) from public.conversation_members where conversation_id = c.id) + cardinality(v_new) > 100 then
    raise exception 'Un groupe compte 100 membres au plus.' using errcode = '22023';
  end if;
  insert into public.conversation_members (conversation_id, member_id) select c.id, m from unnest(v_new) m;
  perform private.system_message(c.id, auth.uid(),
    private.full_name(auth.uid()) || ' a ajouté ' || private.names_list(v_new));
end;
$$;

create function public.remove_group_member(p_conversation uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations := private.managed_group(p_conversation);
begin
  if p_member = auth.uid() then
    raise exception 'Pour partir, utilise « Quitter le groupe ».' using errcode = '22023';
  end if;
  delete from public.conversation_members where conversation_id = c.id and member_id = p_member;
  if not found then
    raise exception 'Ce membre n''est plus dans le groupe.' using errcode = 'P0002';
  end if;
  perform private.system_message(c.id, auth.uid(),
    private.full_name(auth.uid()) || ' a retiré ' || coalesce(private.full_name(p_member), 'un membre'));
end;
$$;

create function public.set_group_manager(p_conversation uuid, p_member uuid, p_manager boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations := private.managed_group(p_conversation);
begin
  if p_member = auth.uid() and not p_manager then
    raise exception 'Pour ne plus gérer le groupe, confie la gestion à quelqu''un puis quitte le groupe.' using errcode = '22023';
  end if;
  update public.conversation_members set is_manager = coalesce(p_manager, false)
  where conversation_id = c.id and member_id = p_member;
  if not found then
    raise exception 'Ce membre n''est plus dans le groupe.' using errcode = 'P0002';
  end if;
end;
$$;

-- Si le dernier gérant part, le membre le plus ancien prend le relais.
create function public.leave_group(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  v_next uuid;
begin
  perform private.require_member();
  select * into c from public.conversations where id = p_conversation for update;
  if not found or not exists (select 1 from public.conversation_members where conversation_id = p_conversation and member_id = auth.uid()) then
    raise exception 'Tu ne fais plus partie de ce groupe.' using errcode = 'P0002';
  end if;
  if c.kind <> 'groupe' then
    raise exception 'On ne quitte que les petits groupes.' using errcode = '22023';
  end if;

  delete from public.conversation_members where conversation_id = c.id and member_id = auth.uid();
  if not exists (select 1 from public.conversation_members where conversation_id = c.id and is_manager) then
    select member_id into v_next from public.conversation_members
    where conversation_id = c.id order by joined_at, member_id limit 1;
    if v_next is not null then
      update public.conversation_members set is_manager = true where conversation_id = c.id and member_id = v_next;
    end if;
  end if;
  perform private.system_message(c.id, auth.uid(), private.full_name(auth.uid()) || ' a quitté le groupe');
end;
$$;

-- ---------------------------------------------------------------------------
-- Bloquer
-- ---------------------------------------------------------------------------

create function public.block_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  if p_member is null or p_member = auth.uid() then
    raise exception 'Choisis un autre membre.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_member) then
    raise exception 'Ce membre n''existe pas.' using errcode = 'P0002';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_member) on conflict do nothing;
end;
$$;

create function public.unblock_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signaler un message et le modérer
-- ---------------------------------------------------------------------------

-- Rend faux si la personne avait déjà signalé ce message.
create function public.report_message(p_id uuid, p_reason public.report_reason)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  perform private.require_member();
  if p_reason is null then
    raise exception 'Choisis pourquoi tu signales ce message.' using errcode = '22023';
  end if;
  select * into m from public.messages where id = p_id;
  if not found or m.deleted_at is not null or m.hidden_at is not null
     or not exists (select 1 from public.conversation_members where conversation_id = m.conversation_id and member_id = auth.uid()) then
    raise exception 'Ce message n''est plus là.' using errcode = 'P0002';
  end if;
  if m.kind <> 'message' or m.as_aegb then
    raise exception 'Les messages d''AEGB ne se signalent pas. Réponds-y si besoin.' using errcode = '22023';
  end if;
  if m.sender_id = auth.uid() then
    raise exception 'Tu ne peux pas signaler ton propre message.' using errcode = '22023';
  end if;
  insert into public.message_reports (reporter_id, message_id, reason) values (auth.uid(), p_id, p_reason)
  on conflict (message_id, reporter_id) do nothing;
  return found;
end;
$$;

create function public.moderate_message(
  p_id uuid,
  p_decision public.moderation_decision,
  p_reason public.report_reason default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  v_reports integer;
  v_reason public.report_reason := p_reason;
  v_excerpt text;
  v_summary text;
begin
  perform private.require('moderation');
  if p_decision is null then
    raise exception 'Choisis la décision.' using errcode = '22023';
  end if;
  select * into m from public.messages where id = p_id for update;
  if not found then
    raise exception 'Ce message n''existe plus.' using errcode = 'P0002';
  end if;
  select count(*) into v_reports from public.message_reports where message_id = p_id and resolved_at is null;
  if v_reports = 0 then
    -- Le bureau ne lit pas les conversations : il ne décide que sur un message signalé.
    raise exception 'Il n''y a plus rien à examiner ici.' using errcode = '22023';
  end if;
  v_excerpt := coalesce(nullif(private.message_preview(p_id), ''), '(message)');

  if p_decision <> 'garder' then
    if m.hidden_at is not null then
      raise exception 'C''est déjà masqué.' using errcode = '22023';
    end if;
    if v_reason is null then
      select r.reason into v_reason
      from public.message_reports r
      where r.message_id = p_id and r.resolved_at is null
      group by r.reason
      order by count(*) desc, r.reason
      limit 1;
    end if;
    if p_decision = 'masquer_avertir' then
      if m.sender_id = auth.uid() then
        raise exception 'Tu ne peux pas t''avertir toi-même.' using errcode = '22023';
      end if;
      if not exists (select 1 from public.profiles where id = m.sender_id and status = 'actif') then
        raise exception 'Seul un membre actif peut être averti.' using errcode = '22023';
      end if;
    end if;
    update public.messages set hidden_at = now(), hidden_reason = private.reason_label(v_reason) where id = p_id;
    if p_decision = 'masquer_avertir' then
      insert into public.member_warnings (member_id, given_by, given_by_name, reason)
      values (m.sender_id, auth.uid(), private.full_name(auth.uid()),
              'Un message masqué : ' || lower(private.reason_label(v_reason)) || '.');
    end if;
  end if;

  update public.message_reports set resolved_at = now() where message_id = p_id and resolved_at is null;

  insert into public.moderation_decisions
    (message_id, author_id, author_name, excerpt, decision, reason, reports, decided_by, decided_by_name)
  values (
    p_id, m.sender_id, coalesce(private.full_name(m.sender_id), 'Membre parti'), left(v_excerpt, 160),
    p_decision, case when p_decision = 'garder' then null else v_reason end, v_reports,
    case when private.is_guarantor(auth.uid()) then null else auth.uid() end, private.signature(auth.uid())
  );

  v_summary := case p_decision
    when 'garder' then 'a gardé un message de ' || coalesce(private.full_name(m.sender_id), 'un membre parti') || ' après signalement'
    when 'masquer' then 'a masqué un message de ' || coalesce(private.full_name(m.sender_id), 'un membre parti') || ' (' || lower(private.reason_label(v_reason)) || ')'
    else 'a masqué un message de ' || private.full_name(m.sender_id) || ' avec un avertissement (' || lower(private.reason_label(v_reason)) || ')'
  end;
  perform private.log_activity('moderation', 'moderation_' || p_decision::text, v_summary, m.sender_id,
    jsonb_build_object('signalements', v_reports, 'extrait', left(v_excerpt, 160)));
end;
$$;

-- Les messages signalés, à côté de la file du lot 2 (publications et
-- commentaires). Le bureau voit ce message seul, jamais la conversation autour.
create function public.moderation_messages()
returns table (
  message_id uuid,
  place text,
  author_id uuid,
  author_first_name text,
  author_last_name text,
  author_avatar_path text,
  body text,
  media_path text,
  media_kind text,
  media_duration numeric,
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
    select r.message_id, r.reason, count(*)::integer as n, max(r.created_at) as last_at
    from public.message_reports r
    where r.resolved_at is null
    group by r.message_id, r.reason
  ),
  pending as (
    select b.message_id, sum(b.n)::integer as n, max(b.last_at) as last_at,
           jsonb_object_agg(b.reason, b.n) as reasons
    from by_reason b
    group by b.message_id
  )
  select
    q.message_id,
    cv.kind::text,
    a.id,
    a.first_name,
    a.last_name,
    a.avatar_path,
    msg.body,
    mf.path,
    mf.kind,
    mf.duration,
    msg.created_at,
    msg.hidden_at is not null,
    q.n,
    q.reasons,
    q.last_at,
    (select count(*)::integer from public.member_warnings w where w.member_id = a.id),
    (select max(w.created_at) from public.member_warnings w where w.member_id = a.id),
    (select w.reason from public.member_warnings w where w.member_id = a.id order by w.created_at desc limit 1)
  from pending q
  join public.messages msg on msg.id = q.message_id
  join public.conversations cv on cv.id = msg.conversation_id
  left join public.profiles a on a.id = msg.sender_id
  left join lateral (
    select f.path, f.kind, f.duration from public.message_files f where f.message_id = msg.id order by f.position limit 1
  ) mf on true
  order by q.n desc, q.last_at desc;
end;
$$;

create or replace function public.moderation_pending()
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
  ) + (
    select count(distinct message_id)::integer from public.message_reports where resolved_at is null
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- Le compte officiel AEGB, côté bureau
-- ---------------------------------------------------------------------------

-- Les conversations où un membre a écrit à AEGB. À répondre : le dernier
-- message vient du membre.
create function public.aegb_inbox()
returns table (
  id uuid,
  member_id uuid,
  first_name text,
  last_name text,
  avatar_path text,
  member_type public.member_type,
  city text,
  validated_at timestamptz,
  last_at timestamptz,
  last_preview text,
  last_from_member boolean,
  replied_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_member();
  perform private.require('bienvenue', 'lecture');
  return query
  select c.id, p.id, p.first_name, p.last_name, p.avatar_path, p.member_type, p.city, p.validated_at,
         l.created_at, private.message_preview(l.id), not l.as_aegb,
         (select ar.written_by_name from public.messages a2 join public.aegb_replies ar on ar.message_id = a2.id
          where a2.conversation_id = c.id order by a2.created_at desc limit 1)
  from public.conversations c
  join public.profiles p on p.id = c.member_id
  join lateral (
    select m.id, m.as_aegb, m.created_at from public.messages m
    where m.conversation_id = c.id and m.kind = 'message'
    order by m.created_at desc limit 1
  ) l on true
  where c.kind = 'aegb'
    and exists (select 1 from public.messages m where m.conversation_id = c.id and m.kind = 'message' and not m.as_aegb)
  order by (not l.as_aegb) desc, l.created_at desc;
end;
$$;

create function public.aegb_pending()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_active_member() and public.can('bienvenue', 'lecture') then (
    select count(*)::integer
    from public.conversations c
    join lateral (
      select m.as_aegb from public.messages m
      where m.conversation_id = c.id and m.kind = 'message'
      order by m.created_at desc limit 1
    ) l on true
    where c.kind = 'aegb' and not l.as_aegb
  ) end;
$$;

create function public.save_welcome(p_text text, p_actions text[], p_announce boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  perform private.require('bienvenue');
  if v_text = '' then
    raise exception 'Écris le message de bienvenue.' using errcode = '22023';
  end if;
  if char_length(v_text) > 2000 then
    raise exception 'Le message dépasse 2 000 caractères.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_actions, '{}')) a where a not in ('charte', 'profil')) then
    raise exception 'Ce bouton n''existe pas encore.' using errcode = '22023';
  end if;
  update public.aegb_settings
  set welcome_text = v_text,
      welcome_actions = coalesce((select array_agg(distinct a) from unnest(p_actions) a), '{}'),
      announce_arrival = coalesce(p_announce, true),
      updated_at = now(),
      updated_by_name = private.signature(auth.uid());
  perform private.log_activity('reglages', 'bienvenue', 'a modifié le message de bienvenue');
end;
$$;

-- « M'envoyer un test » : le message arrive dans ma conversation avec AEGB.
create function public.send_welcome_test()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require('bienvenue');
  perform private.send_welcome(auth.uid(), true);
  return private.ensure_aegb(auth.uid());
end;
$$;

-- L'espace pris par les fichiers, pour le tableau de bord.
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
    where bucket_id in ('profils', 'publications', 'messages')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Le grand groupe et les conversations AEGB des membres déjà validés
-- ---------------------------------------------------------------------------

-- Les membres déjà inscrits entrent tous dans le grand groupe, sans message
-- de bienvenue (choix du plan du lot 3).
insert into public.conversations (kind, title) values ('grand_groupe', 'Grand groupe AEGB');

insert into public.conversation_members (conversation_id, member_id)
select private.grand_groupe(), id from public.profiles where status = 'actif';

insert into public.conversations (kind, member_id)
select 'aegb', id from public.profiles where status = 'actif';

insert into public.conversation_members (conversation_id, member_id)
select c.id, c.member_id from public.conversations c where c.kind = 'aegb';

-- ---------------------------------------------------------------------------
-- Règles d'accès
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_files enable row level security;
alter table public.message_reactions enable row level security;
alter table public.aegb_replies enable row level security;
alter table public.blocks enable row level security;
alter table public.aegb_settings enable row level security;
alter table public.message_reports enable row level security;

revoke all on public.conversations, public.conversation_members, public.messages, public.message_files,
  public.message_reactions, public.aegb_replies, public.blocks, public.aegb_settings, public.message_reports
  from anon, authenticated;

-- Les messages, leurs fichiers, leurs réactions, qui a répondu pour AEGB et
-- les signalements ne se lisent que par les fonctions ci-dessus.
grant select on public.conversations, public.conversation_members, public.blocks, public.aegb_settings to authenticated;

create policy "Conversations visibles par leurs membres"
  on public.conversations for select
  to authenticated
  using (public.can_read_conversation(id));

create policy "Membres visibles dans leurs conversations"
  on public.conversation_members for select
  to authenticated
  using (public.can_read_conversation(conversation_id));

create policy "Chacun voit qui il a bloqué"
  on public.blocks for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Bienvenue visible par le compte officiel"
  on public.aegb_settings for select
  to authenticated
  using ((select public.can('bienvenue', 'lecture')));

-- En direct : l'appli écoute ses conversations (nouveau message, « Vu ») et
-- recharge ce qui a changé par les fonctions de lecture.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.conversations, public.conversation_members;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.can_read_conversation(uuid),
  public.can_read_message_file(text),
  public.open_private(uuid),
  public.my_aegb(),
  public.send_message(uuid, uuid, text, uuid, jsonb, uuid),
  public.delete_message(uuid),
  public.react_message(uuid, public.reaction_kind),
  public.mark_read(uuid),
  public.my_conversations(),
  public.conversation_info(uuid),
  public.conversation_messages(uuid, timestamptz, integer),
  public.create_group(text, uuid[]),
  public.update_group(uuid, text, text),
  public.add_group_members(uuid, uuid[]),
  public.remove_group_member(uuid, uuid),
  public.set_group_manager(uuid, uuid, boolean),
  public.leave_group(uuid),
  public.block_member(uuid),
  public.unblock_member(uuid),
  public.report_message(uuid, public.report_reason),
  public.moderate_message(uuid, public.moderation_decision, public.report_reason),
  public.moderation_messages(),
  public.aegb_inbox(),
  public.aegb_pending(),
  public.save_welcome(text, text[], boolean),
  public.send_welcome_test()
  from public, anon;

grant execute on function
  public.can_read_conversation(uuid),
  public.can_read_message_file(text),
  public.open_private(uuid),
  public.my_aegb(),
  public.send_message(uuid, uuid, text, uuid, jsonb, uuid),
  public.delete_message(uuid),
  public.react_message(uuid, public.reaction_kind),
  public.mark_read(uuid),
  public.my_conversations(),
  public.conversation_info(uuid),
  public.conversation_messages(uuid, timestamptz, integer),
  public.create_group(text, uuid[]),
  public.update_group(uuid, text, text),
  public.add_group_members(uuid, uuid[]),
  public.remove_group_member(uuid, uuid),
  public.set_group_manager(uuid, uuid, boolean),
  public.leave_group(uuid),
  public.block_member(uuid),
  public.unblock_member(uuid),
  public.report_message(uuid, public.report_reason),
  public.moderate_message(uuid, public.moderation_decision, public.report_reason),
  public.moderation_messages(),
  public.aegb_inbox(),
  public.aegb_pending(),
  public.save_welcome(text, text[], boolean),
  public.send_welcome_test()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Fichiers des messages
-- ---------------------------------------------------------------------------

-- 10 Mo : un document, ou un vocal de 2 minutes. Les photos sont réduites
-- dans le téléphone. Rangement : {conversation}/{message}/fichier, et la
-- photo d'un groupe dans {conversation}/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages', 'messages', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/webp',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a',
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet'
]);

create policy "Fichiers des messages visibles avec leur message"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'messages' and (select public.can_read_message_file(name)));

create policy "Chacun dépose les fichiers de ses messages"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'messages'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.can_read_conversation(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "Chacun retire les fichiers qu'il a déposés"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'messages' and owner_id = (select auth.uid())::text);
