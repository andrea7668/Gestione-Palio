create table if not exists public.cavalli (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  overall integer not null default 0,
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

alter table public.cavalli
  add column if not exists overall integer not null default 0;

alter table public.cavalli enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cavalli'
      and policyname = 'cavalli: lettura per utenti loggati'
  ) then
    create policy "cavalli: lettura per utenti loggati"
      on public.cavalli
      for select
      to authenticated
      using (true);
  end if;
end
$$;

revoke all on table public.cavalli from anon, authenticated;
grant select on table public.cavalli to authenticated;
grant all on table public.cavalli to service_role;
