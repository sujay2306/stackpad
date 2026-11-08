-- Stackpad cloud sync schema. Paste into Supabase: SQL Editor -> New query -> Run.
-- Safe to re-run.

-- ---------- tables ----------
create table if not exists public.notebooks (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id         text   not null,
  name       text   not null,
  created    bigint not null,
  updated    bigint not null,
  deleted    boolean not null default false,           -- tombstone so other devices learn about deletes
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.notes (
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id          text   not null,
  notebook_id text,
  title       text   not null default '',
  content     text   not null default '',
  text        text   not null default '',
  tags        text[] not null default '{}',
  pinned      boolean not null default false,
  created     bigint not null,
  updated     bigint not null,
  trashed     bigint,
  deleted     boolean not null default false,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists notes_user_synced on public.notes (user_id, synced_at);
create index if not exists notebooks_user_synced on public.notebooks (user_id, synced_at);

-- ---------- last-write-wins + server sync cursor ----------
-- A write older than what the server already has is skipped, and every accepted
-- write gets a fresh server timestamp that clients use as their pull cursor.
create or replace function public.stackpad_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated < old.updated then
    return null;
  end if;
  new.user_id := old.user_id;            -- never allow moving rows between users
  new.synced_at := clock_timestamp();
  return new;
end $$;

create or replace function public.stackpad_insert() returns trigger
language plpgsql as $$
begin
  new.user_id := auth.uid();
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes for each row execute function public.stackpad_touch();
drop trigger if exists notes_insert on public.notes;
create trigger notes_insert before insert on public.notes for each row execute function public.stackpad_insert();
drop trigger if exists notebooks_touch on public.notebooks;
create trigger notebooks_touch before update on public.notebooks for each row execute function public.stackpad_touch();
drop trigger if exists notebooks_insert on public.notebooks;
create trigger notebooks_insert before insert on public.notebooks for each row execute function public.stackpad_insert();

-- ---------- row level security: each user sees only their own rows ----------
alter table public.notes enable row level security;
alter table public.notebooks enable row level security;

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own notebooks" on public.notebooks;
create policy "own notebooks" on public.notebooks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- realtime (live updates across devices) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.notes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notebooks; exception when duplicate_object then null; end;
end $$;
