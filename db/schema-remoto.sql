--
-- PostgreSQL database dump
--

\restrict tRIUPgKZeusJjYYWtJ95uNunhFDX2v4OBnZG3guA7G7I0FdtgoIijqlOGSVhcuP

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'capitano',
    'mangino',
    'sindaco'
);


--
-- Name: copia_rapporti_iniziali(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.copia_rapporti_iniziali() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into relazioni_contrada_fantino (partita_id, contrada_id, fantino_id, livello)
  select new.id, r.contrada_id, r.fantino_id, r.livello
  from rapporti_iniziali r
  on conflict (partita_id, contrada_id, fantino_id) do nothing;
  return new;
end $$;


--
-- Name: dashboard_partita(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dashboard_partita(p_partita uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_ruolo user_role;
  v_contrada uuid;
  v_partita jsonb;
  v_eventi jsonb;
  v_contrada_json jsonb := null;
  v_saldo numeric := 0;
  v_movimenti jsonb := '[]'::jsonb;
  v_membri jsonb := '[]'::jsonb;
  v_contrade jsonb := '[]'::jsonb;
begin
  select m.ruolo, m.contrada_id into v_ruolo, v_contrada
  from membri m
  where m.partita_id = p_partita and m.utente_id = v_uid;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
           'nome', p.nome,
           'anno', p.anno,
           'codice', case when v_ruolo = 'sindaco' then p.codice else null end
         )
    into v_partita
  from partite p
  where p.id = p_partita;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', e.id, 'tipo', e.tipo, 'titolo', e.titolo, 'testo', e.testo, 'creato_il', e.creato_il)
           order by e.creato_il desc, e.id desc), '[]'::jsonb)
    into v_eventi
  from (
    select * from eventi where partita_id = p_partita order by creato_il desc, id desc limit 30
  ) e;

  if v_contrada is not null then
    select jsonb_build_object('id', c.id, 'nome', c.nome, 'rivale', c.rivale)
      into v_contrada_json
    from contrade c
    where c.id = v_contrada;

    select coalesce(sum(importo), 0) into v_saldo
    from movimenti_crediti
    where partita_id = p_partita and contrada_id = v_contrada;

    select coalesce(jsonb_agg(
             jsonb_build_object('id', t.id, 'importo', t.importo, 'motivo', t.motivo, 'creato_il', t.creato_il,
                                'prima', t.dopo - t.importo, 'dopo', t.dopo)
             order by t.creato_il desc, t.id desc), '[]'::jsonb)
      into v_movimenti
    from (
      select id, importo, motivo, creato_il, dopo
      from (
        select id, importo, motivo, creato_il,
               sum(importo) over (order by creato_il, id) as dopo
        from movimenti_crediti
        where partita_id = p_partita and contrada_id = v_contrada
      ) w
      order by creato_il desc, id desc
      limit 20
    ) t;
  end if;

  if v_ruolo = 'sindaco' then
    select coalesce(jsonb_agg(
             jsonb_build_object('utente_id', m.utente_id, 'ruolo', m.ruolo, 'contrada_id', m.contrada_id,
                                'nome', pr.nome, 'cognome', pr.cognome, 'username', pr.username)
             order by pr.cognome, pr.nome), '[]'::jsonb)
      into v_membri
    from membri m
    left join profiles pr on pr.id = m.utente_id
    where m.partita_id = p_partita and m.ruolo is distinct from 'sindaco'::user_role;

    select coalesce(jsonb_agg(
             jsonb_build_object('id', c.id, 'nome', c.nome, 'saldo', coalesce(s.saldo, 0))
             order by c.nome), '[]'::jsonb)
      into v_contrade
    from contrade c
    left join (
      select contrada_id, sum(importo) as saldo
      from movimenti_crediti
      where partita_id = p_partita
      group by contrada_id
    ) s on s.contrada_id = c.id;
  end if;

  return jsonb_build_object(
    'partita', v_partita,
    'io', jsonb_build_object('ruolo', v_ruolo, 'contrada_id', v_contrada),
    'contrada', v_contrada_json,
    'saldo', v_saldo,
    'movimenti', v_movimenti,
    'eventi', v_eventi,
    'membri', v_membri,
    'contrade', v_contrade
  );
end $$;


--
-- Name: fai_attivita(uuid, uuid, uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fai_attivita(p_partita uuid, p_utente uuid, p_fantino uuid, p_tipo_attivita uuid, p_costo numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: is_sindaco(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_sindaco(p_partita uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from partite where id = p_partita and sindaco_id = auth.uid());
$$;


--
-- Name: nuovo_utente(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nuovo_utente() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into profiles (id, nome, cognome, username, nome_visualizzato)
  values (new.id, new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'cognome',
          new.raw_user_meta_data->>'username',
          (new.raw_user_meta_data->>'nome') || ' ' || (new.raw_user_meta_data->>'cognome'));
  return new;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accordi_fantini; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accordi_fantini (
    id bigint NOT NULL,
    partita_id uuid,
    contrada_id uuid,
    fantino_id uuid,
    tipo text NOT NULL,
    testo text NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    aggiornato_il timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accordi_fantini_tipo_check CHECK ((tipo = ANY (ARRAY['interesse'::text, 'intesa'::text, 'priorita'::text, 'impegno'::text])))
);


--
-- Name: accordi_fantini_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accordi_fantini ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.accordi_fantini_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attivita_svolte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attivita_svolte (
    id bigint NOT NULL,
    partita_id uuid,
    contrada_id uuid,
    fantino_id uuid,
    tipo_attivita_id uuid,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attivita_svolte_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attivita_svolte ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attivita_svolte_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_contrada; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_contrada (
    id bigint NOT NULL,
    partita_id uuid,
    contrada_id uuid,
    utente_id uuid,
    autore_nome text NOT NULL,
    contenuto text NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_contrada_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chat_contrada ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_contrada_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_messaggi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messaggi (
    id bigint NOT NULL,
    contrada_id uuid,
    fantino_id uuid,
    autore text NOT NULL,
    utente_id uuid,
    contenuto text NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    partita_id uuid NOT NULL,
    CONSTRAINT chat_messaggi_autore_check CHECK ((autore = ANY (ARRAY['utente'::text, 'fantino'::text])))
);


--
-- Name: chat_messaggi_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chat_messaggi ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_messaggi_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: colloqui_continuita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colloqui_continuita (
    id bigint NOT NULL,
    partita_id uuid,
    contrada_id uuid,
    fantino_id uuid,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: colloqui_continuita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.colloqui_continuita ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.colloqui_continuita_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contrade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    colori text,
    crediti integer DEFAULT 0 NOT NULL,
    rivale text
);


--
-- Name: eventi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventi (
    id bigint NOT NULL,
    partita_id uuid,
    contrada_id uuid,
    tipo text NOT NULL,
    titolo text NOT NULL,
    testo text,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eventi_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.eventi ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.eventi_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fantini; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fantini (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    soprannome text,
    personalita text NOT NULL,
    avatar_url text,
    eta integer,
    overall integer,
    palii_corsi integer DEFAULT 0 NOT NULL,
    vittorie integer DEFAULT 0 NOT NULL,
    etichetta text,
    stato text DEFAULT 'Libero'::text NOT NULL,
    fascia text,
    mossa integer DEFAULT 0 NOT NULL,
    sanmartino_curva1 integer DEFAULT 0 NOT NULL,
    sanmartino_curva2 integer DEFAULT 0 NOT NULL,
    sanmartino_curva3 integer DEFAULT 0 NOT NULL,
    casato_curva1 integer DEFAULT 0 NOT NULL,
    casato_curva2 integer DEFAULT 0 NOT NULL,
    casato_curva3 integer DEFAULT 0 NOT NULL,
    nerbate_disponibili integer DEFAULT 0 NOT NULL,
    parate_disponibili integer DEFAULT 0 NOT NULL,
    livello_base integer DEFAULT 0 NOT NULL,
    foto text,
    mossa_rincorsa integer
);

--
-- Name: cavalli; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cavalli (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    overall integer DEFAULT 0 NOT NULL,
    attivo boolean DEFAULT true NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: membri; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membri (
    partita_id uuid NOT NULL,
    utente_id uuid NOT NULL,
    ruolo public.user_role,
    contrada_id uuid
);


--
-- Name: movimenti_crediti; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimenti_crediti (
    id bigint NOT NULL,
    partita_id uuid,
    contrada_id uuid,
    importo numeric(10,2) NOT NULL,
    motivo text NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    tipo text
);


--
-- Name: movimenti_crediti_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.movimenti_crediti ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.movimenti_crediti_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifiche; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifiche (
    id bigint NOT NULL,
    partita_id uuid,
    utente_id uuid,
    tipo text NOT NULL,
    titolo text NOT NULL,
    testo text,
    letta boolean DEFAULT false NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifiche_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notifiche ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notifiche_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: partite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    anno integer NOT NULL,
    descrizione text,
    codice text NOT NULL,
    sindaco_id uuid,
    fase text DEFAULT 'inverno'::text NOT NULL,
    creato_il timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    contrada_id uuid,
    ruolo public.user_role NOT NULL,
    nome_visualizzato text,
    nome text,
    cognome text,
    username text
);


--
-- Name: rapporti_iniziali; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rapporti_iniziali (
    contrada_id uuid NOT NULL,
    fantino_id uuid NOT NULL,
    livello integer NOT NULL,
    CONSTRAINT rapporti_iniziali_livello_check CHECK (((livello >= 0) AND (livello <= 100)))
);


--
-- Name: relazioni_contrada_fantino; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relazioni_contrada_fantino (
    contrada_id uuid NOT NULL,
    fantino_id uuid NOT NULL,
    livello integer DEFAULT 0 NOT NULL,
    partita_id uuid NOT NULL,
    CONSTRAINT relazioni_contrada_fantino_livello_check CHECK (((livello >= 0) AND (livello <= 100)))
);


--
-- Name: saldi_contrade; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.saldi_contrade WITH (security_invoker='true') AS
 SELECT partita_id,
    contrada_id,
    (COALESCE(sum(importo), (0)::numeric))::numeric(12,2) AS saldo
   FROM public.movimenti_crediti
  GROUP BY partita_id, contrada_id;


--
-- Name: tipi_attivita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipi_attivita (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    costo_minimo numeric(10,2) DEFAULT 0 NOT NULL,
    costo_massimo numeric(10,2) DEFAULT 0 NOT NULL,
    variazione_massima integer DEFAULT 0 NOT NULL
);


--
-- Name: accordi_fantini accordi_fantini_partita_id_contrada_id_fantino_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accordi_fantini
    ADD CONSTRAINT accordi_fantini_partita_id_contrada_id_fantino_id_tipo_key UNIQUE (partita_id, contrada_id, fantino_id, tipo);


--
-- Name: accordi_fantini accordi_fantini_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accordi_fantini
    ADD CONSTRAINT accordi_fantini_pkey PRIMARY KEY (id);


--
-- Name: attivita_svolte attivita_svolte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attivita_svolte
    ADD CONSTRAINT attivita_svolte_pkey PRIMARY KEY (id);


--
-- Name: chat_contrada chat_contrada_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contrada
    ADD CONSTRAINT chat_contrada_pkey PRIMARY KEY (id);


--
-- Name: chat_messaggi chat_messaggi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messaggi
    ADD CONSTRAINT chat_messaggi_pkey PRIMARY KEY (id);


--
-- Name: colloqui_continuita colloqui_continuita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colloqui_continuita
    ADD CONSTRAINT colloqui_continuita_pkey PRIMARY KEY (id);


--
-- Name: contrade contrade_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrade
    ADD CONSTRAINT contrade_nome_key UNIQUE (nome);


--
-- Name: contrade contrade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrade
    ADD CONSTRAINT contrade_pkey PRIMARY KEY (id);


--
-- Name: eventi eventi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventi
    ADD CONSTRAINT eventi_pkey PRIMARY KEY (id);


--
-- Name: fantini fantini_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fantini
    ADD CONSTRAINT fantini_pkey PRIMARY KEY (id);

--
-- Name: cavalli cavalli_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cavalli
    ADD CONSTRAINT cavalli_nome_key UNIQUE (nome);

--
-- Name: cavalli cavalli_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cavalli
    ADD CONSTRAINT cavalli_pkey PRIMARY KEY (id);

--
-- Name: membri membri_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membri
    ADD CONSTRAINT membri_pkey PRIMARY KEY (partita_id, utente_id);


--
-- Name: movimenti_crediti movimenti_crediti_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimenti_crediti
    ADD CONSTRAINT movimenti_crediti_pkey PRIMARY KEY (id);


--
-- Name: notifiche notifiche_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifiche
    ADD CONSTRAINT notifiche_pkey PRIMARY KEY (id);


--
-- Name: partite partite_codice_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partite
    ADD CONSTRAINT partite_codice_key UNIQUE (codice);


--
-- Name: partite partite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partite
    ADD CONSTRAINT partite_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: rapporti_iniziali rapporti_iniziali_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rapporti_iniziali
    ADD CONSTRAINT rapporti_iniziali_pkey PRIMARY KEY (contrada_id, fantino_id);


--
-- Name: relazioni_contrada_fantino relazioni_contrada_fantino_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relazioni_contrada_fantino
    ADD CONSTRAINT relazioni_contrada_fantino_pkey PRIMARY KEY (partita_id, contrada_id, fantino_id);


--
-- Name: tipi_attivita tipi_attivita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipi_attivita
    ADD CONSTRAINT tipi_attivita_pkey PRIMARY KEY (id);


--
-- Name: attivita_svolte_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attivita_svolte_idx ON public.attivita_svolte USING btree (partita_id, contrada_id, fantino_id);


--
-- Name: chat_contrada_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_contrada_idx ON public.chat_contrada USING btree (partita_id, contrada_id, creato_il);

--
-- Name: chat_contrada_utente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_contrada_utente_idx ON public.chat_contrada USING btree (utente_id, creato_il DESC);


--
-- Name: chat_messaggi_contrada_id_fantino_id_creato_il_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messaggi_contrada_id_fantino_id_creato_il_idx ON public.chat_messaggi USING btree (contrada_id, fantino_id, creato_il);


--
-- Name: chat_messaggi_partita_id_fantino_id_creato_il_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messaggi_partita_id_fantino_id_creato_il_idx ON public.chat_messaggi USING btree (partita_id, fantino_id, creato_il);


--
-- Name: chat_messaggi_storico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messaggi_storico_idx ON public.chat_messaggi USING btree (partita_id, contrada_id, fantino_id, creato_il DESC, id DESC);


--
-- Name: chat_messaggi_utente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messaggi_utente_idx ON public.chat_messaggi USING btree (utente_id, creato_il DESC);


--
-- Name: colloqui_continuita_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX colloqui_continuita_idx ON public.colloqui_continuita USING btree (partita_id);


--
-- Name: eventi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventi_idx ON public.eventi USING btree (partita_id, creato_il DESC);


--
-- Name: membri_contrada_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membri_contrada_idx ON public.membri USING btree (partita_id, contrada_id);


--
-- Name: membri_utente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membri_utente_idx ON public.membri USING btree (utente_id);


--
-- Name: movimenti_crediti_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movimenti_crediti_idx ON public.movimenti_crediti USING btree (partita_id, contrada_id, creato_il DESC);


--
-- Name: notifiche_partita_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifiche_partita_idx ON public.notifiche USING btree (partita_id);


--
-- Name: notifiche_utente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifiche_utente_idx ON public.notifiche USING btree (utente_id, creato_il DESC);


--
-- Name: partite alla_creazione_partita; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER alla_creazione_partita AFTER INSERT ON public.partite FOR EACH ROW EXECUTE FUNCTION public.copia_rapporti_iniziali();


--
-- Name: accordi_fantini accordi_fantini_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accordi_fantini
    ADD CONSTRAINT accordi_fantini_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: accordi_fantini accordi_fantini_fantino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accordi_fantini
    ADD CONSTRAINT accordi_fantini_fantino_id_fkey FOREIGN KEY (fantino_id) REFERENCES public.fantini(id) ON DELETE CASCADE;


--
-- Name: accordi_fantini accordi_fantini_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accordi_fantini
    ADD CONSTRAINT accordi_fantini_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: attivita_svolte attivita_svolte_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attivita_svolte
    ADD CONSTRAINT attivita_svolte_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: attivita_svolte attivita_svolte_fantino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attivita_svolte
    ADD CONSTRAINT attivita_svolte_fantino_id_fkey FOREIGN KEY (fantino_id) REFERENCES public.fantini(id) ON DELETE CASCADE;


--
-- Name: attivita_svolte attivita_svolte_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attivita_svolte
    ADD CONSTRAINT attivita_svolte_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: attivita_svolte attivita_svolte_tipo_attivita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attivita_svolte
    ADD CONSTRAINT attivita_svolte_tipo_attivita_id_fkey FOREIGN KEY (tipo_attivita_id) REFERENCES public.tipi_attivita(id) ON DELETE SET NULL;


--
-- Name: chat_contrada chat_contrada_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contrada
    ADD CONSTRAINT chat_contrada_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: chat_contrada chat_contrada_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contrada
    ADD CONSTRAINT chat_contrada_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: chat_contrada chat_contrada_utente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contrada
    ADD CONSTRAINT chat_contrada_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_messaggi chat_messaggi_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messaggi
    ADD CONSTRAINT chat_messaggi_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: chat_messaggi chat_messaggi_fantino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messaggi
    ADD CONSTRAINT chat_messaggi_fantino_id_fkey FOREIGN KEY (fantino_id) REFERENCES public.fantini(id) ON DELETE CASCADE;


--
-- Name: chat_messaggi chat_messaggi_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messaggi
    ADD CONSTRAINT chat_messaggi_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: chat_messaggi chat_messaggi_utente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messaggi
    ADD CONSTRAINT chat_messaggi_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES public.profiles(id);


--
-- Name: colloqui_continuita colloqui_continuita_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colloqui_continuita
    ADD CONSTRAINT colloqui_continuita_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: colloqui_continuita colloqui_continuita_fantino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colloqui_continuita
    ADD CONSTRAINT colloqui_continuita_fantino_id_fkey FOREIGN KEY (fantino_id) REFERENCES public.fantini(id) ON DELETE CASCADE;


--
-- Name: colloqui_continuita colloqui_continuita_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colloqui_continuita
    ADD CONSTRAINT colloqui_continuita_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: eventi eventi_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventi
    ADD CONSTRAINT eventi_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: eventi eventi_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventi
    ADD CONSTRAINT eventi_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: membri membri_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membri
    ADD CONSTRAINT membri_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id);


--
-- Name: membri membri_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membri
    ADD CONSTRAINT membri_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: membri membri_utente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membri
    ADD CONSTRAINT membri_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: movimenti_crediti movimenti_crediti_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimenti_crediti
    ADD CONSTRAINT movimenti_crediti_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: movimenti_crediti movimenti_crediti_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimenti_crediti
    ADD CONSTRAINT movimenti_crediti_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: notifiche notifiche_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifiche
    ADD CONSTRAINT notifiche_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: notifiche notifiche_utente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifiche
    ADD CONSTRAINT notifiche_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: partite partite_sindaco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partite
    ADD CONSTRAINT partite_sindaco_id_fkey FOREIGN KEY (sindaco_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rapporti_iniziali rapporti_iniziali_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rapporti_iniziali
    ADD CONSTRAINT rapporti_iniziali_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: rapporti_iniziali rapporti_iniziali_fantino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rapporti_iniziali
    ADD CONSTRAINT rapporti_iniziali_fantino_id_fkey FOREIGN KEY (fantino_id) REFERENCES public.fantini(id) ON DELETE CASCADE;


--
-- Name: relazioni_contrada_fantino relazioni_contrada_fantino_contrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relazioni_contrada_fantino
    ADD CONSTRAINT relazioni_contrada_fantino_contrada_id_fkey FOREIGN KEY (contrada_id) REFERENCES public.contrade(id) ON DELETE CASCADE;


--
-- Name: relazioni_contrada_fantino relazioni_contrada_fantino_fantino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relazioni_contrada_fantino
    ADD CONSTRAINT relazioni_contrada_fantino_fantino_id_fkey FOREIGN KEY (fantino_id) REFERENCES public.fantini(id) ON DELETE CASCADE;


--
-- Name: relazioni_contrada_fantino relazioni_contrada_fantino_partita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relazioni_contrada_fantino
    ADD CONSTRAINT relazioni_contrada_fantino_partita_id_fkey FOREIGN KEY (partita_id) REFERENCES public.partite(id) ON DELETE CASCADE;


--
-- Name: accordi_fantini accordi: lettura propria contrada o sindaco; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "accordi: lettura propria contrada o sindaco" ON public.accordi_fantini FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = accordi_fantini.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = accordi_fantini.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: accordi_fantini; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accordi_fantini ENABLE ROW LEVEL SECURITY;

--
-- Name: attivita_svolte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attivita_svolte ENABLE ROW LEVEL SECURITY;

--
-- Name: attivita_svolte attivita_svolte: lettura propria contrada o sindaco; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attivita_svolte: lettura propria contrada o sindaco" ON public.attivita_svolte FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = attivita_svolte.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = attivita_svolte.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: chat_messaggi chat: lettura propria contrada nella partita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat: lettura propria contrada nella partita" ON public.chat_messaggi FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = chat_messaggi.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = chat_messaggi.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: chat_messaggi chat: scrittura propria contrada nella partita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat: scrittura propria contrada nella partita" ON public.chat_messaggi FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = chat_messaggi.partita_id) AND (membri.utente_id = auth.uid()) AND (membri.contrada_id = chat_messaggi.contrada_id)))));


--
-- Name: chat_contrada; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_contrada ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_contrada chat_contrada: lettura propria contrada o sindaco; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_contrada: lettura propria contrada o sindaco" ON public.chat_contrada FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = chat_contrada.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = chat_contrada.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: chat_messaggi; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messaggi ENABLE ROW LEVEL SECURITY;

--
-- Name: colloqui_continuita; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.colloqui_continuita ENABLE ROW LEVEL SECURITY;

--
-- Name: colloqui_continuita colloqui_continuita: lettura propria contrada o sindaco; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "colloqui_continuita: lettura propria contrada o sindaco" ON public.colloqui_continuita FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = colloqui_continuita.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = colloqui_continuita.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: contrade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contrade ENABLE ROW LEVEL SECURITY;

--
-- Name: contrade contrade: lettura per utenti loggati; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contrade: lettura per utenti loggati" ON public.contrade FOR SELECT TO authenticated USING (true);


--
-- Name: eventi; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventi ENABLE ROW LEVEL SECURITY;

--
-- Name: eventi eventi: lettura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "eventi: lettura" ON public.eventi FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = eventi.partita_id) AND (membri.utente_id = auth.uid()) AND ((eventi.contrada_id IS NULL) OR (membri.contrada_id = eventi.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: fantini; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fantini ENABLE ROW LEVEL SECURITY;

--
-- Name: fantini fantini: lettura per utenti loggati; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fantini: lettura per utenti loggati" ON public.fantini FOR SELECT TO authenticated USING (true);


--
-- Name: membri; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.membri ENABLE ROW LEVEL SECURITY;

--
-- Name: membri membri: il sindaco vede tutti i membri della sua partita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "membri: il sindaco vede tutti i membri della sua partita" ON public.membri FOR SELECT USING (public.is_sindaco(partita_id));


--
-- Name: membri membri: solo la mia riga; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "membri: solo la mia riga" ON public.membri FOR SELECT USING ((utente_id = auth.uid()));


--
-- Name: movimenti_crediti movimenti: lettura propria contrada o sindaco; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "movimenti: lettura propria contrada o sindaco" ON public.movimenti_crediti FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = movimenti_crediti.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = movimenti_crediti.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: movimenti_crediti; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimenti_crediti ENABLE ROW LEVEL SECURITY;

--
-- Name: notifiche; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifiche ENABLE ROW LEVEL SECURITY;

--
-- Name: notifiche notifiche: leggo le mie; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifiche: leggo le mie" ON public.notifiche FOR SELECT USING ((utente_id = auth.uid()));


--
-- Name: notifiche notifiche: segno come lette le mie; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifiche: segno come lette le mie" ON public.notifiche FOR UPDATE USING ((utente_id = auth.uid())) WITH CHECK ((utente_id = auth.uid()));


--
-- Name: partite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partite ENABLE ROW LEVEL SECURITY;

--
-- Name: partite partite: quelle a cui partecipo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "partite: quelle a cui partecipo" ON public.partite FOR SELECT USING ((id IN ( SELECT membri.partita_id
   FROM public.membri
  WHERE (membri.utente_id = auth.uid()))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: il sindaco vede i profili dei suoi giocatori; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: il sindaco vede i profili dei suoi giocatori" ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.utente_id = profiles.id) AND public.is_sindaco(membri.partita_id)))));


--
-- Name: profiles profiles: ognuno legge il proprio profilo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: ognuno legge il proprio profilo" ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: rapporti_iniziali; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rapporti_iniziali ENABLE ROW LEVEL SECURITY;

--
-- Name: relazioni_contrada_fantino relazioni: lettura propria contrada nella partita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "relazioni: lettura propria contrada nella partita" ON public.relazioni_contrada_fantino FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.membri
  WHERE ((membri.partita_id = relazioni_contrada_fantino.partita_id) AND (membri.utente_id = auth.uid()) AND ((membri.contrada_id = relazioni_contrada_fantino.contrada_id) OR (membri.ruolo = 'sindaco'::public.user_role))))));


--
-- Name: relazioni_contrada_fantino; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relazioni_contrada_fantino ENABLE ROW LEVEL SECURITY;

--
-- Name: tipi_attivita; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipi_attivita ENABLE ROW LEVEL SECURITY;

--
-- Name: tipi_attivita tipi_attivita: lettura per utenti loggati; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tipi_attivita: lettura per utenti loggati" ON public.tipi_attivita FOR SELECT TO authenticated USING (true);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION copia_rapporti_iniziali(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.copia_rapporti_iniziali() FROM PUBLIC;
GRANT ALL ON FUNCTION public.copia_rapporti_iniziali() TO service_role;


--
-- Name: FUNCTION dashboard_partita(p_partita uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dashboard_partita(p_partita uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dashboard_partita(p_partita uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dashboard_partita(p_partita uuid) TO service_role;


--
-- Name: FUNCTION fai_attivita(p_partita uuid, p_utente uuid, p_fantino uuid, p_tipo_attivita uuid, p_costo numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fai_attivita(p_partita uuid, p_utente uuid, p_fantino uuid, p_tipo_attivita uuid, p_costo numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fai_attivita(p_partita uuid, p_utente uuid, p_fantino uuid, p_tipo_attivita uuid, p_costo numeric) TO service_role;


--
-- Name: FUNCTION is_sindaco(p_partita uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_sindaco(p_partita uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_sindaco(p_partita uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_sindaco(p_partita uuid) TO service_role;


--
-- Name: FUNCTION nuovo_utente(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nuovo_utente() FROM PUBLIC;
GRANT ALL ON FUNCTION public.nuovo_utente() TO service_role;


--
-- Name: TABLE accordi_fantini; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accordi_fantini TO service_role;
GRANT SELECT ON TABLE public.accordi_fantini TO authenticated;


--
-- Name: SEQUENCE accordi_fantini_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.accordi_fantini_id_seq TO anon;
GRANT ALL ON SEQUENCE public.accordi_fantini_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.accordi_fantini_id_seq TO service_role;


--
-- Name: TABLE attivita_svolte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attivita_svolte TO service_role;
GRANT SELECT ON TABLE public.attivita_svolte TO authenticated;


--
-- Name: SEQUENCE attivita_svolte_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.attivita_svolte_id_seq TO anon;
GRANT ALL ON SEQUENCE public.attivita_svolte_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.attivita_svolte_id_seq TO service_role;


--
-- Name: TABLE chat_contrada; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_contrada TO service_role;
GRANT SELECT ON TABLE public.chat_contrada TO authenticated;


--
-- Name: SEQUENCE chat_contrada_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.chat_contrada_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chat_contrada_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chat_contrada_id_seq TO service_role;


--
-- Name: TABLE chat_messaggi; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messaggi TO service_role;
GRANT SELECT ON TABLE public.chat_messaggi TO authenticated;


--
-- Name: SEQUENCE chat_messaggi_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.chat_messaggi_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chat_messaggi_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chat_messaggi_id_seq TO service_role;


--
-- Name: TABLE colloqui_continuita; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.colloqui_continuita TO service_role;


--
-- Name: SEQUENCE colloqui_continuita_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.colloqui_continuita_id_seq TO anon;
GRANT ALL ON SEQUENCE public.colloqui_continuita_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.colloqui_continuita_id_seq TO service_role;


--
-- Name: TABLE contrade; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contrade TO service_role;
GRANT SELECT ON TABLE public.contrade TO authenticated;


--
-- Name: TABLE eventi; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.eventi TO service_role;
GRANT SELECT ON TABLE public.eventi TO authenticated;


--
-- Name: SEQUENCE eventi_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.eventi_id_seq TO anon;
GRANT ALL ON SEQUENCE public.eventi_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.eventi_id_seq TO service_role;


--
-- Name: TABLE fantini; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fantini TO service_role;
GRANT SELECT ON TABLE public.fantini TO authenticated;

--
-- Name: TABLE cavalli; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cavalli TO service_role;
GRANT SELECT ON TABLE public.cavalli TO authenticated;

--
-- Name: TABLE membri; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.membri TO service_role;
GRANT SELECT ON TABLE public.membri TO authenticated;


--
-- Name: TABLE movimenti_crediti; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.movimenti_crediti TO service_role;
GRANT SELECT ON TABLE public.movimenti_crediti TO authenticated;


--
-- Name: SEQUENCE movimenti_crediti_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.movimenti_crediti_id_seq TO anon;
GRANT ALL ON SEQUENCE public.movimenti_crediti_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.movimenti_crediti_id_seq TO service_role;


--
-- Name: TABLE notifiche; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifiche TO service_role;
GRANT SELECT,UPDATE ON TABLE public.notifiche TO authenticated;


--
-- Name: SEQUENCE notifiche_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notifiche_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notifiche_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notifiche_id_seq TO service_role;


--
-- Name: TABLE partite; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partite TO service_role;
GRANT SELECT ON TABLE public.partite TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE rapporti_iniziali; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rapporti_iniziali TO service_role;


--
-- Name: TABLE relazioni_contrada_fantino; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relazioni_contrada_fantino TO service_role;
GRANT SELECT ON TABLE public.relazioni_contrada_fantino TO authenticated;


--
-- Name: TABLE saldi_contrade; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saldi_contrade TO service_role;
GRANT SELECT ON TABLE public.saldi_contrade TO authenticated;


--
-- Name: TABLE tipi_attivita; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tipi_attivita TO service_role;
GRANT SELECT ON TABLE public.tipi_attivita TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict tRIUPgKZeusJjYYWtJ95uNunhFDX2v4OBnZG3guA7G7I0FdtgoIijqlOGSVhcuP
