create index if not exists chat_contrada_utente_idx
  on public.chat_contrada (utente_id, creato_il desc);
