create or replace function public.fai_attivita(
  p_partita uuid,
  p_utente uuid,
  p_fantino uuid,
  p_tipo_attivita uuid,
  p_costo numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrada uuid;
  v_tipo tipi_attivita%rowtype;
  v_fantino fantini%rowtype;
  v_livello integer;
  v_costo_min numeric;
  v_costo_max numeric;
  v_proporzione numeric;
  v_successo boolean;
  v_delta integer;
  v_saldo numeric;
begin
  select m.contrada_id
    into v_contrada
  from membri m
  where m.partita_id = p_partita
    and m.utente_id = p_utente
  for share;

  if not found or v_contrada is null then
    raise exception 'ATTIVITA: Non hai ancora una Contrada assegnata.';
  end if;

  select *
    into v_tipo
  from tipi_attivita
  where id = p_tipo_attivita;

  if not found then
    raise exception 'ATTIVITA: Attività non trovata.';
  end if;

  if p_costo is null
     or p_costo < v_tipo.costo_minimo
     or p_costo > v_tipo.costo_massimo then
    raise exception 'ATTIVITA: Scegli un importo tra % e %.',
      v_tipo.costo_minimo, v_tipo.costo_massimo;
  end if;

  if v_tipo.costo_massimo < v_tipo.costo_minimo then
    raise exception 'Configurazione attività non valida.';
  end if;

  select *
    into v_fantino
  from fantini
  where id = p_fantino;

  if not found then
    raise exception 'ATTIVITA: Fantino non trovato.';
  end if;

  perform 1
    from contrade
    where id = v_contrada
    for update;

  select coalesce(sum(importo), 0)
    into v_saldo
  from movimenti_crediti
  where partita_id = p_partita
    and contrada_id = v_contrada;

  if v_saldo < p_costo then
    raise exception 'ATTIVITA: Crediti insufficienti per questa attività.';
  end if;

  select livello
    into v_livello
  from relazioni_contrada_fantino
  where partita_id = p_partita
    and contrada_id = v_contrada
    and fantino_id = p_fantino
  for update;

  v_livello := coalesce(v_livello, v_fantino.livello_base);
  v_costo_min := v_tipo.costo_minimo;
  v_costo_max := v_tipo.costo_massimo;
  v_proporzione := case
    when v_costo_max > v_costo_min
      then (p_costo - v_costo_min) / (v_costo_max - v_costo_min)
    else 1
  end;
  v_successo := random() < 0.25 + 0.65 * v_proporzione;
  v_delta := case
    when v_successo then greatest(1, round(v_tipo.variazione_massima * v_proporzione)::integer)
    else 0
  end;

  insert into movimenti_crediti (partita_id, contrada_id, importo, motivo, tipo)
  values (p_partita, v_contrada, -p_costo, v_tipo.nome, 'spesa_attivita');

  insert into relazioni_contrada_fantino (partita_id, contrada_id, fantino_id, livello)
  values (p_partita, v_contrada, p_fantino, least(100, greatest(0, v_livello + v_delta)))
  on conflict (partita_id, contrada_id, fantino_id)
  do update set livello = excluded.livello;

  insert into attivita_svolte (partita_id, contrada_id, fantino_id, tipo_attivita_id)
  values (p_partita, v_contrada, p_fantino, p_tipo_attivita);

  return jsonb_build_object(
    'successo', v_successo,
    'delta', v_delta,
    'tipo_nome', v_tipo.nome,
    'fantino_nome', coalesce(v_fantino.soprannome, v_fantino.nome)
  );
end;
$$;

revoke all on function public.fai_attivita(uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.fai_attivita(uuid, uuid, uuid, uuid, numeric) to service_role;
