create extension if not exists "pgcrypto";

create type user_role as enum ('contradaiolo', 'mangino', 'sindaco');

create table contrade (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  colori text,
  crediti integer not null default 0
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  contrada_id uuid references contrade(id),
  ruolo user_role not null default 'contradaiolo',
  nome_visualizzato text
);

create table fantini (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  soprannome text,
  personalita text not null,
  avatar_url text
);

create table relazioni_contrada_fantino (
  contrada_id uuid references contrade(id) on delete cascade,
  fantino_id uuid references fantini(id) on delete cascade,
  livello integer not null default 0 check (livello between 0 and 100),
  primary key (contrada_id, fantino_id)
);

create table chat_messaggi (
  id bigint generated always as identity primary key,
  contrada_id uuid references contrade(id) on delete cascade,
  fantino_id uuid references fantini(id) on delete cascade,
  autore text not null check (autore in ('utente', 'fantino')),
  utente_id uuid references profiles(id),
  contenuto text not null,
  creato_il timestamptz not null default now()
);

create index on chat_messaggi (contrada_id, fantino_id, creato_il);

alter table chat_messaggi enable row level security;
alter table relazioni_contrada_fantino enable row level security;
alter table profiles enable row level security;

create policy "chat: lettura propria contrada o sindaco"
  on chat_messaggi for select
  using (
    contrada_id = (select contrada_id from profiles where id = auth.uid())
    or (select ruolo from profiles where id = auth.uid()) = 'sindaco'
  );

create policy "chat: scrittura solo propria contrada"
  on chat_messaggi for insert
  with check (
    contrada_id = (select contrada_id from profiles where id = auth.uid())
  );

create policy "relazioni: lettura propria contrada o sindaco"
  on relazioni_contrada_fantino for select
  using (
    contrada_id = (select contrada_id from profiles where id = auth.uid())
    or (select ruolo from profiles where id = auth.uid()) = 'sindaco'
  );

create policy "profiles: ognuno legge il proprio profilo"
  on profiles for select
  using (id = auth.uid());
