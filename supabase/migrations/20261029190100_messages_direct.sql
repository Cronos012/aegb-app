-- Lot 3 : messages en direct.
-- L'appli écoute ses conversations (nouveau message, « Vu ») et recharge ce
-- qui a changé par les fonctions de lecture. À part de la migration des
-- messages : sans elle, l'appli recharge toute seule chaque minute.
alter publication supabase_realtime add table public.conversations, public.conversation_members;
