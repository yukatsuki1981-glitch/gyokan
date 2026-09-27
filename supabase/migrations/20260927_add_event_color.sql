-- Selectable label color for private-mode events (10-color palette, chosen
-- client-side in lib/gyokan/event-colors.ts).
alter table public.events add column if not exists color text;
