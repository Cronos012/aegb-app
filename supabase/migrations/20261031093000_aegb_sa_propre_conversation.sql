-- Un membre du bureau qui écrit lui-même au compte AEGB ne peut pas se répondre
-- au nom de l'AEGB : sa conversation n'apparaît pas dans sa propre boîte du
-- compte AEGB (elle s'ouvrait vide), ni dans son compteur. Les autres membres
-- du bureau la voient et lui répondent, comme pour tout membre.

create or replace function public.aegb_inbox()
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
    and c.member_id <> auth.uid()
    and exists (select 1 from public.messages m where m.conversation_id = c.id and m.kind = 'message' and not m.as_aegb)
  order by (not l.as_aegb) desc, l.created_at desc;
end;
$$;

create or replace function public.aegb_pending()
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
    where c.kind = 'aegb' and c.member_id <> auth.uid() and not l.as_aegb
  ) end;
$$;
