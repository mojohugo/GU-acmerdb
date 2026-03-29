-- Schema for GU ACMerDB (Supabase PostgreSQL)

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text,
  cohort_year int not null,
  class_name text,
  major text,
  joined_team_year int,
  is_active boolean not null default true,
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (
    category in (
      'freshman',
      'school',
      'icpc_regional',
      'ccpc_regional',
      'provincial',
      'lanqiao',
      'ladder',
      'other'
    )
  ),
  season_year int not null,
  cohort_year int,
  contest_level text,
  award text,
  rank text,
  team_name text,
  happened_at date,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.competition_members (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (competition_id, member_id)
);

create table if not exists public.competition_media (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  standing_competition_id uuid references public.competitions (id) on delete cascade,
  media_type text not null check (media_type in ('certificate', 'event_photo')),
  file_name text not null,
  object_key text not null unique,
  mime_type text,
  file_size bigint,
  url text not null,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;
alter table public.competition_media enable row level security;
alter table public.admin_users enable row level security;

create index if not exists idx_competition_media_competition
  on public.competition_media (competition_id, media_type, created_at desc);

create index if not exists idx_competition_media_standing
  on public.competition_media (standing_competition_id, media_type, created_at desc);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = uid
      and is_admin = true
  );
$$;

-- Public read policies
drop policy if exists "members_read_public" on public.members;
create policy "members_read_public" on public.members
for select using (true);

drop policy if exists "competitions_read_public" on public.competitions;
create policy "competitions_read_public" on public.competitions
for select using (true);

drop policy if exists "competition_members_read_public" on public.competition_members;
create policy "competition_members_read_public" on public.competition_members
for select using (true);

drop policy if exists "competition_media_read_public" on public.competition_media;
create policy "competition_media_read_public" on public.competition_media
for select using (true);

drop policy if exists "admin_users_read_self" on public.admin_users;
create policy "admin_users_read_self" on public.admin_users
for select using (auth.uid() = user_id);

-- Admin write policies
drop policy if exists "members_write_admin" on public.members;
create policy "members_write_admin" on public.members
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "competitions_write_admin" on public.competitions;
create policy "competitions_write_admin" on public.competitions
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "competition_members_write_admin" on public.competition_members;
create policy "competition_members_write_admin" on public.competition_members
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "competition_media_write_admin" on public.competition_media;
create policy "competition_media_write_admin" on public.competition_media
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- NOTE:
-- 1) 先在 Supabase Auth 创建管理员账号。
-- 2) 再插入 admin_users(user_id, display_name, is_admin=true)。
-- 3) TODO: 后续可增加审计日志、软删除、批量导入表结构。
