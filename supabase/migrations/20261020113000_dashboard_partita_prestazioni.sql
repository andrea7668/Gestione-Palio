alter function public.dashboard_partita(uuid)
  security definer;

alter function public.dashboard_partita(uuid)
  set search_path = public;

create index if not exists membri_partita_utente_idx
  on public.membri (partita_id, utente_id);

create index if not exists eventi_partita_data_id_idx
  on public.eventi (partita_id, creato_il desc, id desc);

create index if not exists movimenti_crediti_partita_contrada_data_id_idx
  on public.movimenti_crediti (partita_id, contrada_id, creato_il desc, id desc);
