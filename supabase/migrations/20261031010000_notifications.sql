-- Lot 7 : les notifications (la cloche et les appareils), les réglages, la
-- confidentialité et « Supprimer mon compte » (plan validé par Cronos le
-- 31 octobre 2026).
--
-- Le trajet d'une notification : une action qui existe déjà (message,
-- réaction, annonce, vote, rappel...) range une ligne dans la cloche du
-- membre, puis, si ses réglages le permettent, une ligne dans la file
-- d'envoi vers ses appareils. La fonction serveur « push » vide cette file
-- par le service standard du web (Web Push).
--
-- Les messages privés et de groupe ne vont pas dans la cloche : ils sont
-- déjà dans l'onglet Messages, et partent seulement vers les appareils.
-- Pendant les heures calmes, rien ne part : la file attend la fin des
-- heures calmes, et la fonction n'envoie alors qu'une notification.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Un compte fermé par son titulaire : invisible tout de suite, effacé
-- 30 jours plus tard. Se reconnecter avant annule la suppression.
alter table public.profiles add column deletion_requested_at timestamptz;

create index profiles_deletion_idx on public.profiles (deletion_requested_at) where deletion_requested_at is not null;

-- Ce que le membre reçoit sur ses appareils. Tout est activé au départ.
-- Les annonces du bureau et les nouvelles du compte ne se coupent pas.
create table public.notification_settings (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  prives boolean not null default true,
  groupes boolean not null default true,
  grand_groupe boolean not null default true,
  reactions boolean not null default true,
  votes boolean not null default true,
  evenements boolean not null default true,
  cotisation boolean not null default true,
  poste boolean not null default true,
  calme boolean not null default true,
  calme_debut time not null default '22:00',
  calme_fin time not null default '08:00',
  apercu boolean not null default true,
  updated_at timestamptz not null default now()
);

-- « En ligne » et « Vu » sont réciproques : qui les cache ne voit plus ceux
-- des autres. Le numéro reste au bureau, sauf si le membre le montre.
create table public.member_privacy (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  show_online boolean not null default true,
  show_seen boolean not null default true,
  phone_visibility text not null default 'bureau' check (phone_visibility in ('bureau', 'membres')),
  who_can_write text not null default 'tous' check (who_can_write in ('tous', 'conversations')),
  updated_at timestamptz not null default now()
);

-- Un téléphone ou un PC connecté. L'identifiant est choisi par l'appareil.
-- endpoint, p256dh et auth_key : son abonnement aux notifications, s'il en a
-- un. Retiré depuis un autre appareil : il se déconnecte à sa prochaine
-- ouverture (revoked_at).
create table public.devices (
  id uuid primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default 'autre' check (platform in ('android', 'iphone', 'ordinateur', 'autre')),
  label text not null check (char_length(label) between 1 and 60),
  endpoint text unique check (endpoint is null or (starts_with(endpoint, 'https://') and char_length(endpoint) <= 1000)),
  p256dh text check (p256dh is null or char_length(p256dh) between 40 and 200),
  auth_key text check (auth_key is null or char_length(auth_key) between 10 and 64),
  push_since timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_push_at timestamptz,
  failures integer not null default 0,
  revoked_at timestamptz,
  constraint devices_push_complete check (
    (endpoint is null and p256dh is null and auth_key is null)
    or (endpoint is not null and p256dh is not null and auth_key is not null)
  )
);

create index devices_member_idx on public.devices (member_id);

-- La cloche. text : la phrase, avec le nom en gras entre ** **.
-- actors : les personnes, la plus récente d'abord (« Awa et 4 autres »).
-- group_key : une notification non lue de même clé est mise à jour au lieu
-- d'en ajouter une. chip : l'écran du bureau concerné (Comptes, Modération...).
create table public.notifications (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in (
    'grand_groupe', 'reactions', 'annonces', 'votes', 'evenements', 'cotisation', 'compte', 'poste'
  )),
  icon text not null,
  text text not null check (char_length(text) between 1 and 600),
  link text not null check (starts_with(link, '/')),
  actors uuid[] not null default '{}',
  official boolean not null default false,
  chip text,
  group_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_member_idx on public.notifications (member_id, created_at desc);
create index notifications_unread_idx on public.notifications (member_id) where read_at is null;
create unique index notifications_open_group on public.notifications (member_id, group_key)
  where read_at is null and group_key is not null;

-- La file d'envoi vers les appareils. tag : la notification remplace sur
-- l'appareil celle de même tag (une par conversation, par publication...).
-- quiet : reportée par les heures calmes.
create table private.push_outbox (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid references public.devices (id) on delete cascade,
  category text not null,
  tag text not null,
  title text not null,
  body text not null,
  link text not null,
  quiet boolean not null default false,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);

create index push_outbox_due_idx on private.push_outbox (due_at) where sent_at is null;
create index push_outbox_tag_idx on private.push_outbox (member_id, tag, created_at desc);

-- L'adresse des fonctions serveur, que la base appelle quand il y a du
-- travail. Elle est publique : l'appli l'utilise aussi.
create table private.app_config (
  key text primary key,
  value text not null
);

insert into private.app_config (key, value) values
  ('functions_url', 'https://lahllstfpmjfcavptlmt.supabase.co/functions/v1');

-- Ce qui est déjà parti, pour ne jamais prévenir deux fois.
create table private.announcements_sent (
  post_id uuid primary key references public.posts (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create table private.vote_eve_sent (
  ballot_id uuid primary key references public.ballots (id) on delete cascade,
  sent_at timestamptz not null default now()
);

-- Un réglage et une confidentialité par membre, créés avec le profil.
insert into public.notification_settings (member_id) select id from public.profiles;
insert into public.member_privacy (member_id) select id from public.profiles;

create function private.on_profile_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (member_id) values (new.id) on conflict do nothing;
  insert into public.member_privacy (member_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;

create trigger profiles_settings_created
  after insert on public.profiles
  for each row execute function private.on_profile_created();

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

-- Appelle une fonction serveur, une seule fois par transaction. pg_net
-- envoie l'appel après la validation de la transaction, jamais avant.
create function private.wake(p_function text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if coalesce(current_setting('aegb.reveil_' || p_function, true), '') = '1' then
    return;
  end if;
  perform set_config('aegb.reveil_' || p_function, '1', true);
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return;
  end if;
  select value || '/' || p_function into v_url from private.app_config where key = 'functions_url';
  if v_url is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, timeout_milliseconds := 10000)' using v_url;
end;
$$;

-- « Awa » + « 4 » dans une phrase : {nom} et {autres}.
create function private.fill_text(p_text text, p_name text, p_others integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(p_text, '{nom}', coalesce(p_name, 'Un membre')), '{autres}',
    case when p_others = 1 then 'une autre personne' else p_others || ' autres personnes' end);
$$;

-- Le début d'un texte, entre guillemets, sur une ligne.
create function private.excerpt(p_text text, p_length integer default 80)
returns text
language sql
immutable
set search_path = ''
as $$
  select '« ' || case when char_length(t) > p_length then rtrim(left(t, p_length - 1)) || '…' else t end || ' »'
  from (select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) as t) s;
$$;

-- Une ligne de texte sans retour à la ligne, raccourcie.
create function private.one_line(p_text text, p_length integer default 200)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(t) > p_length then rtrim(left(t, p_length - 1)) || '…' else t end
  from (select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) as t) s;
$$;

-- La fin des heures calmes en cours pour ce membre, ou null s'il n'est pas
-- dans ses heures calmes. Les heures sont celles de Paris.
create function private.quiet_until(s public.notification_settings)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := private.clock() at time zone 'Europe/Paris';
  v_time time := v_local::time;
  v_end timestamp;
begin
  if not s.calme or s.calme_debut = s.calme_fin then
    return null;
  end if;
  if s.calme_debut < s.calme_fin then
    if v_time >= s.calme_debut and v_time < s.calme_fin then
      v_end := v_local::date + s.calme_fin;
    end if;
  elsif v_time >= s.calme_debut then
    v_end := (v_local::date + 1) + s.calme_fin;
  elsif v_time < s.calme_fin then
    v_end := v_local::date + s.calme_fin;
  end if;
  return v_end at time zone 'Europe/Paris';
end;
$$;

-- Met une notification dans la file des appareils, si les réglages du
-- membre le permettent. p_hidden : le texte quand l'aperçu est caché.
-- p_throttle : pas deux notifications de même tag dans ce délai.
create function private.enqueue_push(
  p_member uuid,
  p_category text,
  p_tag text,
  p_title text,
  p_body text,
  p_hidden text,
  p_link text,
  p_throttle interval default null,
  p_device uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.notification_settings;
  v_quiet timestamptz;
  v_wanted boolean;
begin
  select * into s from public.notification_settings where member_id = p_member;
  if not found then
    return false;
  end if;
  v_wanted := case p_category
      when 'prives' then s.prives
      when 'groupes' then s.groupes
      when 'grand_groupe' then s.grand_groupe
      when 'reactions' then s.reactions
      when 'votes' then s.votes
      when 'evenements' then s.evenements
      when 'cotisation' then s.cotisation
      when 'poste' then s.poste
      else true
    end;
  if not v_wanted then
    return false;
  end if;
  if not exists (
    select 1 from public.devices d
    where d.member_id = p_member and d.endpoint is not null and d.revoked_at is null
      and (p_device is null or d.id = p_device)
  ) then
    return false;
  end if;
  if p_throttle is not null and exists (
    select 1 from private.push_outbox o
    where o.member_id = p_member and o.tag = p_tag and o.created_at > private.clock() - p_throttle
  ) then
    return false;
  end if;

  if p_category <> 'essai' then
    v_quiet := private.quiet_until(s);
  end if;
  insert into private.push_outbox (member_id, device_id, category, tag, title, body, link, quiet, due_at, created_at)
  values (p_member, p_device, p_category, left(p_tag, 200), private.one_line(p_title, 100),
          private.one_line(case when s.apercu then p_body else coalesce(p_hidden, 'Nouvelle notification') end, 240),
          p_link, v_quiet is not null, coalesce(v_quiet, private.clock()), private.clock());
  if v_quiet is null then
    perform private.wake('push');
  end if;
  return true;
end;
$$;

-- Range une notification dans la cloche d'un membre, puis vers ses
-- appareils. Rien pour soi-même, ni pour un compte qui n'est pas actif.
-- Sur l'appareil, le titre est la partie en gras du début de la phrase
-- (un nom, « Vote ouvert »), ou l'écran du bureau (p_chip), et le texte est
-- la suite.
create function private.notify(
  p_member uuid,
  p_category text,
  p_icon text,
  p_text text,
  p_link text,
  p_actor uuid default null,
  p_group text default null,
  p_text_many text default null,
  p_official boolean default false,
  p_chip text default null,
  p_push_title text default null,
  p_push_body text default null,
  p_hidden text default 'Nouvelle notification',
  p_tag text default null,
  p_throttle interval default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.notifications;
  v_actors uuid[];
  v_name text := private.full_name(p_actor);
  v_text text;
  v_plain text;
  v_title text;
  v_body text;
begin
  if p_member is null or p_member is not distinct from p_actor then
    return null;
  end if;
  if not exists (
    select 1 from public.profiles where id = p_member and status = 'actif' and deletion_requested_at is null
  ) then
    return null;
  end if;

  if p_group is not null then
    select * into n from public.notifications
    where member_id = p_member and group_key = p_group and read_at is null
    for update;
  end if;

  if n.id is not null then
    v_actors := case when p_actor is null then n.actors
                     else (array[p_actor] || array_remove(n.actors, p_actor))[1:20] end;
    v_text := private.fill_text(
      case when p_text_many is not null and cardinality(v_actors) > 1 then p_text_many else p_text end,
      v_name, cardinality(v_actors) - 1);
    update public.notifications
    set text = left(v_text, 600), actors = v_actors, link = p_link, chip = p_chip, created_at = private.clock()
    where id = n.id
    returning * into n;
  else
    v_text := private.fill_text(p_text, v_name, 0);
    insert into public.notifications (member_id, category, icon, text, link, actors, official, chip, group_key, created_at)
    values (p_member, p_category, p_icon, left(v_text, 600), p_link,
            case when p_actor is null then '{}'::uuid[] else array[p_actor] end,
            p_official, p_chip, p_group, private.clock())
    returning * into n;
  end if;

  v_plain := replace(v_text, '**', '');
  if v_text like '**%' then
    v_title := split_part(substr(v_text, 3), '**', 1);
    v_body := regexp_replace(substr(v_text, char_length(v_title) + 5), '^\s*:?\s*', '');
  end if;
  perform private.enqueue_push(
    p_member,
    p_category,
    coalesce(p_tag, p_group, 'notification:' || n.id),
    coalesce(p_push_title, p_chip, nullif(v_title, ''), 'AEGB'),
    coalesce(p_push_body, case when p_chip is not null or v_body is null or v_body = '' then v_plain else v_body end),
    p_hidden,
    p_link,
    p_throttle
  );
  return n.id;
end;
$$;

-- Les titulaires d'un poste qui ont la main sur un écran du bureau.
create function private.screen_holders(p_screen text)
returns table (member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.holder_id
  from public.bureau_roles r
  join public.profiles p on p.id = r.holder_id and p.status = 'actif' and p.deletion_requested_at is null
  left join public.role_permissions rp on rp.role_code = r.code and rp.screen_code = p_screen
  where r.locked or rp.level = 'complet';
$$;

-- Les messages pas encore lus d'un membre dans une conversation.
create function private.unread_in(p_conv uuid, p_member uuid, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.messages u
  where u.conversation_id = p_conv
    and u.created_at > p_since
    and u.sender_id is distinct from p_member
    and u.kind <> 'systeme'
    and u.blocked_for is distinct from p_member;
$$;

-- Le nombre sur l'icône de l'appli : les conversations non lues et les
-- notifications nouvelles.
create function private.badge_count(p_member uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)::integer from public.notifications where member_id = p_member and read_at is null
  ) + (
    select count(*)::integer
    from public.conversation_members me
    where me.member_id = p_member
      and exists (
        select 1 from public.messages u
        where u.conversation_id = me.conversation_id
          and u.created_at > me.last_read_at
          and u.sender_id is distinct from p_member
          and u.kind <> 'systeme'
          and u.blocked_for is distinct from p_member
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Ce qui déclenche une notification
-- ---------------------------------------------------------------------------

-- Un message d'un membre : vers les appareils pour une conversation privée
-- ou un petit groupe ; dans la cloche pour une mention ou une réponse dans
-- le grand groupe ; pour le bureau, un message au compte AEGB.
create function private.notify_member_message(m public.messages, c public.conversations)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.full_name(m.sender_id);
  v_first text;
  v_preview text := private.message_preview(m.id);
  v_reply_to uuid;
  v_n integer;
  r record;
begin
  select first_name into v_first from public.profiles where id = m.sender_id;
  if coalesce(v_preview, '') = '' then
    v_preview := 'Nouveau message';
  end if;

  if c.kind in ('prive', 'groupe') then
    for r in
      select x.member_id, x.last_read_at
      from public.conversation_members x
      join public.profiles p on p.id = x.member_id and p.status = 'actif'
      where x.conversation_id = c.id
        and x.member_id <> m.sender_id
        and x.member_id is distinct from m.blocked_for
    loop
      v_n := private.unread_in(c.id, r.member_id, r.last_read_at);
      perform private.enqueue_push(
        r.member_id,
        case when c.kind = 'prive' then 'prives' else 'groupes' end,
        'conv:' || c.id,
        case when c.kind = 'prive' then v_name else c.title end,
        case when c.kind = 'prive' then v_preview else v_first || ' : ' || v_preview end,
        case when v_n > 1 then v_n || ' nouveaux messages' else 'Nouveau message' end,
        '/app/messages/' || c.id
      );
    end loop;

  elsif c.kind = 'grand_groupe' then
    select q.sender_id into v_reply_to from public.messages q where q.id = m.reply_to and not q.as_aegb;
    for r in
      select p.id, p.id is not distinct from v_reply_to as reply
      from public.conversation_members x
      join public.profiles p on p.id = x.member_id and p.status = 'actif'
      where x.conversation_id = c.id
        and p.id <> m.sender_id
        and (
          p.id is not distinct from v_reply_to
          or (m.body is not null and position(lower('@' || p.first_name || ' ' || p.last_name) in lower(m.body)) > 0)
        )
    loop
      perform private.notify(
        r.id, 'grand_groupe', case when r.reply then 'reponse' else 'mention' end,
        '**{nom}** ' || case when r.reply then 'a répondu à ton message' else 't''a mentionné' end
          || ' : ' || private.excerpt(v_preview),
        '/app/messages/' || c.id,
        p_actor => m.sender_id,
        p_push_title => v_name || ' · Grand groupe',
        p_push_body => v_preview,
        p_hidden => case when r.reply then 'Nouvelle réponse' else 'Nouvelle mention' end
      );
    end loop;

  elsif c.kind = 'aegb' and m.sender_id = c.member_id then
    for r in select h.member_id from private.screen_holders('bienvenue') h loop
      perform private.notify(
        r.member_id, 'poste', 'aegb',
        '**{nom}** a écrit au compte AEGB : ' || private.excerpt(v_preview),
        '/bureau/aegb/' || c.id,
        p_actor => m.sender_id,
        p_group => 'aegb:' || c.id,
        p_chip => 'Compte AEGB',
        p_push_body => v_name || ' : ' || v_preview,
        p_hidden => 'Nouveau message au compte AEGB'
      );
    end loop;
  end if;
end;
$$;

-- Un message du compte AEGB à un membre. Ceux qu'envoie la base (rappel de
-- cotisation, vote, événement, bienvenue) vont dans la cloche ; une réponse
-- du bureau part vers les appareils comme un message privé.
create function private.notify_aegb_message(m public.messages, c public.conversations)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := coalesce(m.meta ->> 'type', '');
  v_label text;
  v_category text;
  v_icon text;
  v_link text;
  v_hidden text := 'Nouvelle notification';
begin
  if coalesce((m.meta ->> 'essai')::boolean, false) then
    return;
  end if;

  if m.kind = 'message' then
    perform private.enqueue_push(c.member_id, 'prives', 'conv:' || c.id, 'AEGB',
      coalesce(nullif(private.message_preview(m.id), ''), 'Nouveau message'), 'Nouveau message', '/app/messages/' || c.id);
    -- La réponse est partie : la notification du bureau n'est plus à traiter.
    update public.notifications set read_at = private.clock()
    where group_key = 'aegb:' || c.id and read_at is null;
    return;
  end if;

  if m.kind = 'bienvenue' then
    perform private.notify(c.member_id, 'compte', 'compte',
      '**Bienvenue dans l''AEGB** : ton compte est validé.', '/app/messages/' || c.id,
      p_official => true, p_push_title => 'AEGB', p_push_body => 'Ton compte est validé. Bienvenue dans l''AEGB !',
      p_hidden => 'Nouveau message');
    return;
  elsif m.kind = 'cotisation' then
    v_category := 'cotisation';
    v_icon := 'cotisation';
    v_link := '/app/cotisation';
    v_label := case v_type when 'recu' then 'Paiement reçu' when 'annule' then 'Paiement annulé'
                           when 'relance' then 'Cotisation en retard' else 'Cotisation' end;
  elsif m.kind = 'assemblee' then
    -- La convocation est aussi une annonce officielle, qui prévient déjà tout le monde.
    if v_type in ('convocation', 'seconde') then
      return;
    end if;
    v_category := 'votes';
    v_icon := 'vote';
    v_link := '/app/votes';
    v_hidden := 'Nouveau vote';
    v_label := case v_type
      when 'annulation' then 'AG annulée'
      when 'candidature_validee' then 'Candidature validée'
      when 'candidature_refusee' then 'Candidature refusée'
      when 'candidature_retiree' then 'Candidature retirée'
      when 'ouverture' then 'Vote ouvert'
      when 'relance' then 'Rappel de vote'
      when 'second_tour' then 'Second tour'
      else 'Assemblée générale' end;
  elsif m.kind = 'evenement' then
    v_category := 'evenements';
    v_icon := 'evenement';
    v_link := case when m.meta ? 'event' then '/app/evenements/' || (m.meta ->> 'event') else '/app/evenements' end;
    v_label := case v_type
      when 'rappel' then 'Rappel'
      when 'place' then 'Une place s''est libérée'
      when 'changement' then 'Événement modifié'
      when 'annulation' then 'Événement annulé'
      when 'paiement' then 'Paiement reçu'
      when 'desinscription' then 'Désinscription'
      when 'rembourse' then 'Remboursement'
      when 'paiement_annule' then 'Paiement annulé'
      else 'Événement' end;
  else
    return;
  end if;

  perform private.notify(c.member_id, v_category, v_icon,
    '**' || v_label || '** : ' || private.one_line(m.body, 300), v_link,
    p_official => true, p_hidden => v_hidden);
end;
$$;

-- À la validation de la transaction : les fichiers d'un message sont alors
-- rangés, et son aperçu est complet. Une erreur ici n'empêche jamais un
-- message de partir.
create function private.on_message_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  c public.conversations;
begin
  select * into m from public.messages where id = new.id;
  if not found or m.deleted_at is not null then
    return null;
  end if;
  select * into c from public.conversations where id = m.conversation_id;
  begin
    if m.as_aegb then
      if c.kind = 'aegb' then
        perform private.notify_aegb_message(m, c);
      end if;
    elsif m.kind = 'message' and m.sender_id is not null then
      perform private.notify_member_message(m, c);
    end if;
  exception when others then
    raise warning 'Notification du message % non envoyée : %', m.id, sqlerrm;
  end;
  return null;
end;
$$;

create constraint trigger messages_notify
  after insert on public.messages
  deferrable initially deferred
  for each row execute function private.on_message_notify();

-- Qui peut m'écrire, et un compte fermé ne reçoit plus de message privé.
-- Le bureau et le compte AEGB peuvent toujours écrire.
create function private.check_can_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other uuid;
  v_policy text;
  v_closed boolean;
begin
  if new.kind <> 'message' or new.as_aegb or new.sender_id is null then
    return new;
  end if;
  if not exists (select 1 from public.conversations where id = new.conversation_id and kind = 'prive') then
    return new;
  end if;
  select x.member_id, pv.who_can_write, p.deletion_requested_at is not null
  into v_other, v_policy, v_closed
  from public.conversation_members x
  join public.profiles p on p.id = x.member_id
  left join public.member_privacy pv on pv.member_id = x.member_id
  where x.conversation_id = new.conversation_id and x.member_id <> new.sender_id
  limit 1;
  if v_closed then
    raise exception 'Ce membre n''est plus joignable.' using errcode = '22023';
  end if;
  if v_policy = 'conversations'
     and not exists (select 1 from public.messages where conversation_id = new.conversation_id and kind = 'message')
     and not exists (select 1 from public.bureau_roles where holder_id = new.sender_id) then
    raise exception 'Cette personne reçoit seulement les messages des personnes avec qui elle a déjà une conversation.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_check_can_write
  before insert on public.messages
  for each row execute function private.check_can_write();

-- Une réaction à ma publication : regroupées, une notification par heure et
-- par publication au plus sur les appareils (réactions et commentaires
-- ensemble).
create function private.on_reaction_notify()
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

create trigger reactions_notify
  after insert on public.reactions
  for each row execute function private.on_reaction_notify();

-- Un commentaire : à l'auteur du commentaire auquel il répond, et à l'auteur
-- de la publication.
create function private.on_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts;
  v_parent uuid;
begin
  select * into p from public.posts where id = new.post_id;
  if not found or p.hidden_at is not null then
    return null;
  end if;
  if new.parent_id is not null then
    select author_id into v_parent from public.comments where id = new.parent_id;
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

create trigger comments_notify
  after insert on public.comments
  for each row execute function private.on_comment_notify();

-- Une annonce officielle, à tous ceux à qui elle s'adresse, une seule fois.
-- Une annonce programmée part à son heure (voir notifications_tick).
create function private.notify_announcement(p_post uuid)
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
  if not found then
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
      '**Bureau de l''AEGB** : ' || private.one_line(p.title, 120), '/app/fil/' || p.id,
      p_official => true,
      p_push_title => 'Bureau de l''AEGB · Annonce',
      p_push_body => private.one_line(p.title, 120),
      p_hidden => 'Nouvelle annonce');
    n := n + 1;
  end loop;
  return n;
end;
$$;

create function private.on_post_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.official and new.published_at <= private.clock() then
    perform private.notify_announcement(new.id);
  end if;
  return null;
end;
$$;

create trigger posts_notify
  after insert on public.posts
  for each row execute function private.on_post_notify();

-- Un avertissement du bureau, toujours signé « Le bureau ».
create function private.on_warning_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.member_id, 'compte', 'compte',
    '**Le bureau** t''a adressé un avertissement : ' || private.excerpt(new.reason, 120), '/app/profil',
    p_official => true, p_push_title => 'Bureau de l''AEGB', p_hidden => 'Nouvelle notification');
  return null;
end;
$$;

create trigger member_warnings_notify
  after insert on public.member_warnings
  for each row execute function private.on_warning_notify();

-- Pour le bureau : un compte qui attend sa validation (email confirmé).
create function private.on_pending_account_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  r record;
begin
  select count(*)::integer into n from public.profiles where status = 'en_attente' and email_confirmed_at is not null;
  if new.status = 'en_attente' and new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    for r in select h.member_id from private.screen_holders('comptes') h loop
      perform private.notify(r.member_id, 'poste', 'comptes',
        case when n = 1 then '**1 compte** attend sa validation' else '**' || n || ' comptes** attendent leur validation' end,
        '/bureau/comptes', p_group => 'comptes', p_chip => 'Comptes', p_hidden => 'Nouveau compte à valider');
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'en_attente' and new.status <> 'en_attente' and n = 0 then
    update public.notifications set read_at = private.clock() where group_key = 'comptes' and read_at is null;
  end if;
  return null;
end;
$$;

create trigger profiles_pending_notify
  after insert or update of email_confirmed_at, status on public.profiles
  for each row execute function private.on_pending_account_notify();

-- Pour la modération : un contenu signalé, avec le nombre de signalements.
create function private.notify_report(p_post uuid, p_comment uuid, p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  v_text text;
  v_key text;
  v_author text;
  r record;
begin
  if p_post is not null then
    select count(*)::integer into n from public.reports where post_id = p_post and resolved_at is null;
    select case when p.official then null else private.full_name(p.author_id) end into v_author from public.posts p where p.id = p_post;
    v_text := case when v_author is null then 'Une annonce a été **signalée**' else 'Une publication de ' || v_author || ' a été **signalée**' end;
    v_key := 'signalement:publication:' || p_post;
  elsif p_comment is not null then
    select count(*)::integer into n from public.reports where comment_id = p_comment and resolved_at is null;
    select private.full_name(author_id) into v_author from public.comments where id = p_comment;
    v_text := 'Un commentaire de ' || coalesce(v_author, 'un ancien membre') || ' a été **signalé**';
    v_key := 'signalement:commentaire:' || p_comment;
  else
    select count(*)::integer into n from public.message_reports where message_id = p_message and resolved_at is null;
    select case when m.as_aegb then 'AEGB' else private.full_name(m.sender_id) end into v_author from public.messages m where m.id = p_message;
    v_text := 'Un message de ' || coalesce(v_author, 'un ancien membre') || ' a été **signalé**';
    v_key := 'signalement:message:' || p_message;
  end if;
  if n > 1 then
    v_text := v_text || ' ' || n || ' fois';
  end if;
  for r in select h.member_id from private.screen_holders('moderation') h loop
    perform private.notify(r.member_id, 'poste', 'signalement', v_text, '/bureau/moderation',
      p_group => v_key, p_chip => 'Modération', p_hidden => 'Nouveau signalement');
  end loop;
end;
$$;

create function private.on_report_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'reports' then
    perform private.notify_report(new.post_id, new.comment_id, null);
  else
    perform private.notify_report(null, null, new.message_id);
  end if;
  return null;
end;
$$;

create trigger reports_notify
  after insert on public.reports
  for each row execute function private.on_report_notify();

create trigger message_reports_notify
  after insert on public.message_reports
  for each row execute function private.on_report_notify();

-- Pour les élections : une candidature déposée dans l'appli.
create function private.on_candidacy_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  r record;
begin
  if new.paper or new.status <> 'deposee' then
    return null;
  end if;
  select label into v_role from public.bureau_roles where code = new.role_code;
  for r in select h.member_id from private.screen_holders('elections') h loop
    perform private.notify(r.member_id, 'poste', 'candidature',
      '**Nouvelle candidature** : {nom} pour « ' || v_role || ' »', '/bureau/elections',
      p_actor => new.member_id, p_chip => 'Élections', p_hidden => 'Nouvelle candidature');
  end loop;
  return null;
end;
$$;

create trigger candidacies_notify
  after insert on public.candidacies
  for each row execute function private.on_candidacy_notify();

-- Pour la trésorerie : un paiement par carte reçu (cotisation ou événement).
create function private.on_card_payment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  r record;
begin
  if new.method <> 'carte' or new.status <> 'confirme' or old.status = 'confirme' then
    return null;
  end if;
  select (select count(*) from public.dues_payments where method = 'carte' and status = 'confirme' and confirmed_at > private.clock() - interval '7 days')
       + (select count(*) from public.event_payments where method = 'carte' and status = 'confirme' and confirmed_at > private.clock() - interval '7 days')
  into n;
  n := greatest(n, 1);
  for r in select h.member_id from private.screen_holders('tresorerie') h loop
    perform private.notify(r.member_id, 'poste', 'paiement',
      case when n = 1 then '**1 paiement** par carte reçu cette semaine' else '**' || n || ' paiements** par carte reçus cette semaine' end,
      '/bureau/cotisations', p_group => 'paiements-carte', p_chip => 'Trésorerie', p_hidden => 'Nouveau paiement');
  end loop;
  return null;
end;
$$;

create trigger dues_payments_notify
  after update of status on public.dues_payments
  for each row execute function private.on_card_payment_notify();

create trigger event_payments_notify
  after update of status on public.event_payments
  for each row execute function private.on_card_payment_notify();

-- ---------------------------------------------------------------------------
-- Toutes les minutes, et chaque nuit
-- ---------------------------------------------------------------------------

-- Les annonces programmées arrivées à leur heure, la veille de la fermeture
-- d'un vote (pour qui n'a pas voté), et la file des appareils quand les
-- heures calmes se terminent.
create function private.notifications_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  e record;
begin
  for r in
    select p.id from public.posts p
    where p.official and p.hidden_at is null
      and p.published_at <= private.clock() and p.published_at > private.clock() - interval '2 days'
      and not exists (select 1 from private.announcements_sent s where s.post_id = p.id)
  loop
    perform private.notify_announcement(r.id);
  end loop;

  for r in
    select b.* from public.ballots b
    where b.status = 'ouvert'
      and b.closes_at > private.clock() and b.closes_at <= private.clock() + interval '24 hours'
      and b.closes_at - b.opened_at >= interval '36 hours'
      and not exists (select 1 from private.vote_eve_sent s where s.ballot_id = b.id)
  loop
    insert into private.vote_eve_sent (ballot_id) values (r.id);
    for e in
      select el.member_id from public.ballot_electors el
      where el.ballot_id = r.id
        and not exists (select 1 from public.ballot_voters v where v.ballot_id = r.id and v.member_id = el.member_id)
    loop
      perform private.notify(e.member_id, 'votes', 'vote',
        '**Rappel de vote** : le vote ferme ' || private.day_label(r.closes_at) || ' à ' || private.hour_label(r.closes_at)
          || ' et tu n''as pas encore voté.',
        '/app/votes', p_official => true, p_hidden => 'Rappel de vote');
    end loop;
  end loop;

  if exists (
    select 1 from private.push_outbox
    where sent_at is null and due_at <= private.clock()
      and (claimed_at is null or claimed_at < private.clock() - interval '2 minutes')
  ) then
    perform private.wake('push');
  end if;
end;
$$;

-- Le ménage de la nuit : la cloche garde 30 jours, la file 7 jours, un
-- appareil retiré disparaît au bout de 30 jours. Les comptes fermés depuis
-- 30 jours sont effacés par la fonction serveur « comptes » (elle retire
-- aussi leurs photos, ce que la base ne peut pas faire seule).
create function private.cleanup_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications where created_at < private.clock() - interval '30 days';
  delete from private.push_outbox where created_at < private.clock() - interval '7 days';
  delete from public.devices where revoked_at < private.clock() - interval '30 days';
  delete from public.devices where last_seen_at < private.clock() - interval '180 days';
  if exists (
    select 1 from public.profiles
    where deletion_requested_at <= private.clock() - interval '30 days'
  ) then
    perform private.wake('comptes');
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('aegb-notifications', '* * * * *', 'select private.notifications_tick()');
    perform cron.schedule('aegb-menage', '15 3 * * *', 'select private.cleanup_tick()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- La cloche
-- ---------------------------------------------------------------------------

create function public.my_notifications(p_before timestamptz default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id,
      'category', n.category,
      'icon', n.icon,
      'text', n.text,
      'link', n.link,
      'official', n.official,
      'chip', n.chip,
      'created_at', n.created_at,
      'read', n.read_at is not null,
      'others', greatest(cardinality(n.actors) - 1, 0),
      'actor', case when a.id is not null then jsonb_build_object(
        'id', a.id, 'first_name', a.first_name, 'last_name', a.last_name, 'avatar_path', a.avatar_path) end
    ) order by n.created_at desc, n.id desc)
    from (
      select * from public.notifications
      where member_id = auth.uid() and (p_before is null or created_at < p_before)
      order by created_at desc, id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) n
    left join public.profiles a on a.id = n.actors[1] and a.status = 'actif' and a.deletion_requested_at is null
  ), '[]'::jsonb);
end;
$$;

-- Le nombre de la pastille de la cloche, et celui de l'icône de l'appli.
create function public.my_badge()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    return jsonb_build_object('notifications', 0, 'total', 0);
  end if;
  return jsonb_build_object(
    'notifications', (select count(*)::integer from public.notifications where member_id = auth.uid() and read_at is null),
    'total', private.badge_count(auth.uid())
  );
end;
$$;

-- Lu : une liste, ou tout si p_ids est null.
create function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform private.require_member();
  update public.notifications set read_at = now()
  where member_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Ouvrir la conversation, la publication ou la page marque ses
-- notifications comme lues.
create function public.mark_link_read(p_link text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_active_member() then
    return 0;
  end if;
  update public.notifications set read_at = now()
  where member_id = auth.uid() and read_at is null and link = p_link;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Réglages et confidentialité
-- ---------------------------------------------------------------------------

create function public.my_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.notification_settings;
  v public.member_privacy;
  v_screens text[];
begin
  perform private.require_member();
  select * into s from public.notification_settings where member_id = auth.uid();
  select * into v from public.member_privacy where member_id = auth.uid();
  -- Ce que reçoit le poste du membre, dans l'ordre des écrans du bureau.
  select array_agg(x.label order by x.sort_order) into v_screens
  from (
    values ('comptes', 'comptes à valider', 1), ('moderation', 'signalements', 2), ('bienvenue', 'compte AEGB', 3),
           ('elections', 'candidatures', 4), ('tresorerie', 'paiements par carte', 5)
  ) x (screen, label, sort_order)
  where exists (select 1 from private.screen_holders(x.screen) h where h.member_id = auth.uid());

  return jsonb_build_object(
    'notifications', jsonb_build_object(
      'prives', s.prives, 'groupes', s.groupes, 'grand_groupe', s.grand_groupe, 'reactions', s.reactions,
      'votes', s.votes, 'evenements', s.evenements, 'cotisation', s.cotisation, 'poste', s.poste,
      'calme', s.calme, 'calme_debut', to_char(s.calme_debut, 'HH24:MI'), 'calme_fin', to_char(s.calme_fin, 'HH24:MI'),
      'apercu', s.apercu
    ),
    'privacy', jsonb_build_object(
      'show_online', v.show_online, 'show_seen', v.show_seen,
      'phone_visibility', v.phone_visibility, 'who_can_write', v.who_can_write
    ),
    'poste', case when v_screens is not null then jsonb_build_object(
      'role', (select label from public.bureau_roles where holder_id = auth.uid() limit 1),
      'receives', to_jsonb(v_screens)) end
  );
end;
$$;

-- p_settings : seulement les réglages qui changent.
create function public.save_notification_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  perform private.require_member();
  for k in select jsonb_object_keys(coalesce(p_settings, '{}'::jsonb)) loop
    if k not in ('prives', 'groupes', 'grand_groupe', 'reactions', 'votes', 'evenements', 'cotisation',
                 'poste', 'calme', 'calme_debut', 'calme_fin', 'apercu') then
      raise exception 'Réglage inconnu : %.', k using errcode = '22023';
    end if;
  end loop;
  update public.notification_settings set
    prives = coalesce((p_settings ->> 'prives')::boolean, prives),
    groupes = coalesce((p_settings ->> 'groupes')::boolean, groupes),
    grand_groupe = coalesce((p_settings ->> 'grand_groupe')::boolean, grand_groupe),
    reactions = coalesce((p_settings ->> 'reactions')::boolean, reactions),
    votes = coalesce((p_settings ->> 'votes')::boolean, votes),
    evenements = coalesce((p_settings ->> 'evenements')::boolean, evenements),
    cotisation = coalesce((p_settings ->> 'cotisation')::boolean, cotisation),
    poste = coalesce((p_settings ->> 'poste')::boolean, poste),
    calme = coalesce((p_settings ->> 'calme')::boolean, calme),
    calme_debut = coalesce((p_settings ->> 'calme_debut')::time, calme_debut),
    calme_fin = coalesce((p_settings ->> 'calme_fin')::time, calme_fin),
    apercu = coalesce((p_settings ->> 'apercu')::boolean, apercu),
    updated_at = now()
  where member_id = auth.uid();
end;
$$;

create function public.save_privacy(p_privacy jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  perform private.require_member();
  for k in select jsonb_object_keys(coalesce(p_privacy, '{}'::jsonb)) loop
    if k not in ('show_online', 'show_seen', 'phone_visibility', 'who_can_write') then
      raise exception 'Réglage inconnu : %.', k using errcode = '22023';
    end if;
  end loop;
  update public.member_privacy set
    show_online = coalesce((p_privacy ->> 'show_online')::boolean, show_online),
    show_seen = coalesce((p_privacy ->> 'show_seen')::boolean, show_seen),
    phone_visibility = coalesce(p_privacy ->> 'phone_visibility', phone_visibility),
    who_can_write = coalesce(p_privacy ->> 'who_can_write', who_can_write),
    updated_at = now()
  where member_id = auth.uid();
end;
$$;

-- Sur le profil d'un membre : son numéro s'il le montre aux membres (ou pour
-- le bureau), et si je peux lui écrire.
create function public.member_contact(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.member_privacy;
  v_phone text;
  v_bureau boolean := public.can('membres', 'lecture') or public.can('comptes', 'lecture');
  v_key text;
begin
  perform private.require_member();
  select * into v from public.member_privacy where member_id = p_member;
  if p_member = auth.uid() or v_bureau or v.phone_visibility = 'membres' then
    select phone into v_phone from public.member_contacts where id = p_member;
  end if;
  v_key := least(auth.uid()::text, p_member::text) || ':' || greatest(auth.uid()::text, p_member::text);
  return jsonb_build_object(
    'phone', v_phone,
    'can_write', p_member <> auth.uid() and (
      coalesce(v.who_can_write, 'tous') = 'tous'
      or exists (select 1 from public.bureau_roles where holder_id = auth.uid())
      or exists (
        select 1 from public.conversations c join public.messages m on m.conversation_id = c.id and m.kind = 'message'
        where c.pair_key = v_key
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Les appareils
-- ---------------------------------------------------------------------------

-- À chaque ouverture de l'appli. Un appareil retiré depuis un autre doit se
-- déconnecter (revoked) ; un identifiant déjà pris par un autre compte sur
-- ce navigateur doit être changé (other).
create function public.touch_device(p_id uuid, p_platform text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.devices;
begin
  perform private.require_member();
  select * into d from public.devices where id = p_id for update;
  if found and d.member_id <> auth.uid() then
    return jsonb_build_object('revoked', false, 'other', true, 'push', false);
  end if;
  if found and d.revoked_at is not null then
    delete from public.devices where id = p_id;
    return jsonb_build_object('revoked', true, 'other', false, 'push', false);
  end if;
  insert into public.devices (id, member_id, platform, label)
  values (p_id, auth.uid(),
          case when p_platform in ('android', 'iphone', 'ordinateur') then p_platform else 'autre' end,
          left(coalesce(nullif(btrim(p_label), ''), 'Appareil'), 60))
  on conflict (id) do update set last_seen_at = now(), platform = excluded.platform, label = excluded.label
  returning * into d;
  return jsonb_build_object('revoked', false, 'other', false, 'push', d.endpoint is not null);
end;
$$;

-- L'abonnement aux notifications de cet appareil (null : arrêté).
create function public.save_push_device(p_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  if not exists (select 1 from public.devices where id = p_id and member_id = auth.uid() and revoked_at is null) then
    raise exception 'Cet appareil n''est plus connecté.' using errcode = 'P0002';
  end if;
  if p_endpoint is null then
    update public.devices set endpoint = null, p256dh = null, auth_key = null, push_since = null where id = p_id;
    return;
  end if;
  -- Le même navigateur, connecté avant à un autre compte : son ancien abonnement s'arrête.
  update public.devices set endpoint = null, p256dh = null, auth_key = null, push_since = null
  where endpoint = p_endpoint and id <> p_id;
  update public.devices
  set endpoint = p_endpoint, p256dh = p_p256dh, auth_key = p_auth, push_since = now(), failures = 0, last_seen_at = now()
  where id = p_id;
end;
$$;

-- Se déconnecter : l'appareil disparaît de la liste et ne reçoit plus rien.
create function public.forget_device(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.devices where id = p_id and member_id = (select auth.uid());
$$;

create function public.my_devices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'platform', d.platform, 'label', d.label, 'push', d.endpoint is not null,
      'last_seen_at', d.last_seen_at, 'created_at', d.created_at
    ) order by d.last_seen_at desc)
    from public.devices d
    where d.member_id = auth.uid() and d.revoked_at is null
  ), '[]'::jsonb);
end;
$$;

-- « Retirer » un appareil perdu : il ne reçoit plus rien et se déconnecte
-- à sa prochaine ouverture.
create function public.revoke_device(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  update public.devices
  set revoked_at = now(), endpoint = null, p256dh = null, auth_key = null, push_since = null
  where id = p_id and member_id = auth.uid() and revoked_at is null;
  if not found then
    raise exception 'Cet appareil n''est plus dans la liste.' using errcode = 'P0002';
  end if;
end;
$$;

-- « Essayer » : une notification d'essai sur cet appareil, tout de suite,
-- même pendant les heures calmes.
create function public.test_push(p_device uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member();
  if not exists (select 1 from public.devices where id = p_device and member_id = auth.uid() and endpoint is not null) then
    raise exception 'Les notifications ne sont pas activées sur cet appareil.' using errcode = '22023';
  end if;
  return private.enqueue_push(auth.uid(), 'essai', 'essai', 'AEGB',
    'C''est un essai : les notifications arrivent bien sur cet appareil.', 'Notification d''essai',
    '/app/reglages/notifications', null, p_device);
end;
$$;

-- Pour le bureau : combien de membres ont activé les notifications, en
-- nombre seulement, jamais leurs noms.
create function public.reachable_members()
returns jsonb
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
    select jsonb_build_object(
      'reachable', count(*) filter (where exists (
        select 1 from public.devices d where d.member_id = p.id and d.endpoint is not null and d.revoked_at is null)),
      'android', count(*) filter (where exists (
        select 1 from public.devices d where d.member_id = p.id and d.endpoint is not null and d.revoked_at is null and d.platform = 'android')),
      'iphone', count(*) filter (where exists (
        select 1 from public.devices d where d.member_id = p.id and d.endpoint is not null and d.revoked_at is null and d.platform = 'iphone')),
      'ordinateur', count(*) filter (where exists (
        select 1 from public.devices d where d.member_id = p.id and d.endpoint is not null and d.revoked_at is null and d.platform = 'ordinateur')),
      'total', count(*)
    )
    from public.profiles p
    where p.status = 'actif' and p.deletion_requested_at is null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Supprimer mon compte
-- ---------------------------------------------------------------------------

-- Le compte est fermé tout de suite et effacé 30 jours plus tard. Un membre
-- du bureau quitte d'abord son poste. L'appli vérifie le mot de passe avant.
create function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_on timestamptz;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and status in ('en_attente', 'actif', 'suspendu', 'refuse')) then
    raise exception 'Ce compte n''existe plus.' using errcode = 'P0002';
  end if;
  select label into v_role from public.bureau_roles where holder_id = auth.uid() limit 1;
  if v_role is not null then
    raise exception 'Tu as le poste « % » au bureau. Quitte d''abord ton poste : la présidence nomme une autre personne, puis tu pourras supprimer ton compte.', v_role
      using errcode = '42501';
  end if;
  update public.profiles set deletion_requested_at = now()
  where id = auth.uid() and deletion_requested_at is null;
  delete from public.devices where member_id = auth.uid();
  delete from private.push_outbox where member_id = auth.uid() and sent_at is null;
  select deletion_requested_at + interval '30 days' into v_on from public.profiles where id = auth.uid();
  perform private.log_activity('comptes', 'suppression_demandee',
    'a fermé son compte (effacé le ' || private.french_date((v_on at time zone 'Europe/Paris')::date) || ')', auth.uid());
  return jsonb_build_object('purge_on', v_on);
end;
$$;

-- Se reconnecter avant les 30 jours : tout revient.
create function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set deletion_requested_at = null
  where id = auth.uid() and deletion_requested_at is not null;
  if not found then
    return false;
  end if;
  perform private.log_activity('comptes', 'suppression_annulee', 'a rouvert son compte', auth.uid());
  return true;
end;
$$;

-- Un compte fermé disparaît pour les autres membres ; le bureau le voit
-- encore, avec sa date d'effacement.
drop policy "Profils visibles selon le statut et le poste" on public.profiles;
create policy "Profils visibles selon le statut et le poste"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or (status = 'actif' and deletion_requested_at is null and (select public.is_active_member()))
    or (select public.can('membres', 'lecture'))
    or (select public.can('comptes', 'lecture'))
  );

-- ---------------------------------------------------------------------------
-- « Vu » réciproque
-- ---------------------------------------------------------------------------

-- Les membres d'une conversation ne lisent plus directement jusqu'où les
-- autres ont lu : « Vu » passe par conversation_info, qui le cache si l'un
-- des deux a caché son « Vu ».
drop policy "Membres visibles dans leurs conversations" on public.conversation_members;
create policy "Chacun voit ses propres lectures"
  on public.conversation_members for select
  to authenticated
  using (member_id = (select auth.uid()));

-- Lire une conversation privée prévient l'autre en direct (pour « Vu »),
-- seulement quand des messages de l'autre deviennent lus.
create or replace function public.mark_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before timestamptz;
begin
  if not public.is_active_member() then
    return;
  end if;
  select last_read_at into v_before from public.conversation_members
  where conversation_id = p_conversation and member_id = auth.uid()
  for update;
  if not found then
    return;
  end if;
  update public.conversation_members set last_read_at = clock_timestamp()
  where conversation_id = p_conversation and member_id = auth.uid();
  if exists (
    select 1 from public.conversations c
    where c.id = p_conversation and c.kind in ('prive', 'aegb')
      and exists (
        select 1 from public.messages m
        where m.conversation_id = c.id and m.created_at > v_before and m.sender_id is distinct from auth.uid()
      )
  ) then
    update public.conversations set changed_at = clock_timestamp() where id = p_conversation;
  end if;
  update public.notifications set read_at = now()
  where member_id = auth.uid() and read_at is null and link = '/app/messages/' || p_conversation;
end;
$$;

create function private.seen_visible(p_viewer uuid, p_member uuid, p_staff boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select show_seen from public.member_privacy where member_id = p_member), true)
     and (p_staff or coalesce((select show_seen from public.member_privacy where member_id = p_viewer), true));
$$;

create or replace function public.conversation_info(p_conversation uuid)
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
      'last_read_at', case when private.seen_visible(auth.uid(), p.id, c.kind = 'aegb') then x.last_read_at end,
      'closed', p.deletion_requested_at is not null,
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

-- ---------------------------------------------------------------------------
-- Pour les fonctions serveur (clé serveur seulement)
-- ---------------------------------------------------------------------------

-- Prend les notifications à envoyer, rangées par membre, avec ses appareils
-- et le nombre de son icône. Une notification prise et pas confirmée est
-- reprise deux minutes plus tard.
create function public.push_claim(p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
begin
  select array_agg(id) into v_ids from (
    select o.id from private.push_outbox o
    where o.sent_at is null and o.due_at <= private.clock()
      and (o.claimed_at is null or o.claimed_at < private.clock() - interval '2 minutes')
    order by o.id
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)
    for update skip locked
  ) t;
  if v_ids is null then
    return '[]'::jsonb;
  end if;
  update private.push_outbox set claimed_at = private.clock() where id = any (v_ids);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'member_id', g.member_id,
      'badge', private.badge_count(g.member_id),
      'items', g.items,
      'devices', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth_key))
        from public.devices d
        where d.member_id = g.member_id and d.endpoint is not null and d.revoked_at is null
      ), '[]'::jsonb)
    ))
    from (
      select o.member_id, jsonb_agg(jsonb_build_object(
        'id', o.id, 'device_id', o.device_id, 'category', o.category, 'tag', o.tag, 'title', o.title,
        'body', o.body, 'link', o.link, 'quiet', o.quiet
      ) order by o.id) as items
      from private.push_outbox o
      where o.id = any (v_ids)
      group by o.member_id
    ) g
  ), '[]'::jsonb);
end;
$$;

-- Envoyées (ou abandonnées).
create function public.push_done(p_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update private.push_outbox set sent_at = private.clock() where id = any (p_ids);
$$;

-- Le résultat pour chaque appareil : gone, l'abonnement n'existe plus chez
-- le service du navigateur (désinstallé, autorisation retirée).
create function public.push_device_result(p_device uuid, p_ok boolean, p_gone boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ok then
    update public.devices set last_push_at = now(), failures = 0 where id = p_device;
  elsif p_gone then
    update public.devices set endpoint = null, p256dh = null, auth_key = null, push_since = null, failures = 0 where id = p_device;
  else
    update public.devices set failures = failures + 1 where id = p_device;
    update public.devices set endpoint = null, p256dh = null, auth_key = null, push_since = null
    where id = p_device and failures >= 20;
  end if;
end;
$$;

-- Les comptes fermés depuis 30 jours, et leurs fichiers à retirer.
create function public.accounts_to_purge()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.first_name || ' ' || p.last_name,
    'post_folders', coalesce((select jsonb_agg(po.id) from public.posts po where po.author_id = p.id), '[]'::jsonb)
  )), '[]'::jsonb)
  from public.profiles p
  where p.deletion_requested_at <= private.clock() - interval '30 days'
    and not exists (select 1 from public.bureau_roles r where r.holder_id = p.id);
$$;

-- Noté au journal une fois le compte effacé (le nom est recopié, comme
-- pour toutes les lignes du journal).
create function public.account_purged(p_id uuid, p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, actor_name, category, action, summary, subject_id, subject_name)
  values (null, 'AEGB, automatique', 'comptes', 'compte_efface',
          'a effacé le compte fermé depuis 30 jours', p_id, p_name);
$$;

-- ---------------------------------------------------------------------------
-- Règles d'accès
-- ---------------------------------------------------------------------------

alter table public.notification_settings enable row level security;
alter table public.member_privacy enable row level security;
alter table public.devices enable row level security;
alter table public.notifications enable row level security;

revoke all on public.notification_settings, public.member_privacy, public.devices, public.notifications
  from anon, authenticated;

-- La cloche se lit par my_notifications ; la lecture directe sert au direct.
grant select on public.notifications to authenticated;

create policy "Chacun voit sa cloche"
  on public.notifications for select
  to authenticated
  using (member_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.my_notifications(timestamptz, integer),
  public.my_badge(),
  public.mark_notifications_read(bigint[]),
  public.mark_link_read(text),
  public.my_settings(),
  public.save_notification_settings(jsonb),
  public.save_privacy(jsonb),
  public.member_contact(uuid),
  public.touch_device(uuid, text, text),
  public.save_push_device(uuid, text, text, text),
  public.forget_device(uuid),
  public.my_devices(),
  public.revoke_device(uuid),
  public.test_push(uuid),
  public.reachable_members(),
  public.request_account_deletion(),
  public.cancel_account_deletion(),
  public.push_claim(integer),
  public.push_done(bigint[]),
  public.push_device_result(uuid, boolean, boolean),
  public.accounts_to_purge(),
  public.account_purged(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.my_notifications(timestamptz, integer),
  public.my_badge(),
  public.mark_notifications_read(bigint[]),
  public.mark_link_read(text),
  public.my_settings(),
  public.save_notification_settings(jsonb),
  public.save_privacy(jsonb),
  public.member_contact(uuid),
  public.touch_device(uuid, text, text),
  public.save_push_device(uuid, text, text, text),
  public.forget_device(uuid),
  public.my_devices(),
  public.revoke_device(uuid),
  public.test_push(uuid),
  public.reachable_members(),
  public.request_account_deletion(),
  public.cancel_account_deletion()
  to authenticated;

grant execute on function
  public.push_claim(integer),
  public.push_done(bigint[]),
  public.push_device_result(uuid, boolean, boolean),
  public.accounts_to_purge(),
  public.account_purged(uuid, text)
  to service_role;
