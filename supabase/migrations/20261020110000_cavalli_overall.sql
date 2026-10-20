create table if not exists public.cavalli (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  overall integer not null default 0,
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

alter table public.cavalli
  add column if not exists overall integer not null default 0;

revoke all on table public.cavalli from anon, authenticated;
grant select on table public.cavalli to authenticated;
grant all on table public.cavalli to service_role;
