-- Lot 7 : « En ligne ».
--
-- L'appli ouverte rejoint le salon de présence « en-ligne ». Le salon est
-- privé : seuls les membres validés y entrent, pour dire qu'ils sont là et
-- voir qui d'autre l'est. Qui cache son « En ligne » n'y entre pas (c'est
-- l'appli qui s'en charge), et ne voit donc personne.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute $p$
      create policy "Membres validés : voir qui est en ligne"
        on realtime.messages for select
        to authenticated
        using (realtime.topic() = 'en-ligne' and extension = 'presence' and (select public.is_active_member()))
    $p$;
    execute $p$
      create policy "Membres validés : dire qu'on est en ligne"
        on realtime.messages for insert
        to authenticated
        with check (realtime.topic() = 'en-ligne' and extension = 'presence' and (select public.is_active_member()))
    $p$;
  end if;
end;
$$;
