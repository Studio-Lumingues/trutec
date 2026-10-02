-- Rode isto uma vez no Supabase: SQL Editor > New query > Run
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text not null,
  wins       int  not null default 0,
  losses     int  not null default 0,
  character  text,
  theme      text,
  created_at timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9_]{3,16}$')
);
create unique index if not exists profiles_handle_key on public.profiles (handle);

-- RLS ligado e SEM policies: ninguém acessa pelo navegador.
-- Só o seu servidor (chave service_role) lê/escreve.
alter table public.profiles enable row level security;

create or replace function public.record_result(p_user uuid, p_win boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set wins   = wins   + (case when p_win then 1 else 0 end),
         losses = losses + (case when p_win then 0 else 1 end)
   where id = p_user;
$$;
revoke all on function public.record_result(uuid, boolean) from public, anon, authenticated;
