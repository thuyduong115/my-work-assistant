export const SUPABASE_SQL = `-- My Work Assistant: chạy 1 lần trong Supabase → SQL Editor
create table if not exists public.items (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists items_user_server_updated on public.items (user_id, server_updated);

alter table public.items enable row level security;

drop policy if exists "own rows" on public.items;
create policy "own rows" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.items_touch() returns trigger
language plpgsql as $$
begin
  new.server_updated := now();
  return new;
end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();

-- realtime giữa các thiết bị
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;
`
