'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useFase } from '../lib/contesto-fase';
import { FASI_CON_ACCORDI } from '../lib/fasi';
import { TIPI_ACCORDO, nomeAccordo, ordineAccordo, etichettaRapporto } from '../lib/accordi';
import FotoFantino from './FotoFantino';

type Messaggio = { autore: 'utente' | 'fantino'; contenuto: string; creato_il: string };
type Accordo = { id: number; tipo: string; testo: string };

interface Props {
  partitaId: string;
  fantinoId: string;
  fantinoNome: string;
  fantinoSoprannome?: string;
  fantinoFoto?: string | null;
  livelloIniziale: number;
}

const ora = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

export default function FantinoChat({ partitaId, fantinoId, fantinoNome, fantinoSoprannome, fantinoFoto, livelloIniziale }: Props) {
  const { fase } = useFase();
  const inTratta = !!fase && FASI_CON_ACCORDI.includes(fase);
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [accordi, setAccordi] = useState<Accordo[]>([]);
  const [livello, setLivello] = useState(livelloIniziale);
  const [testo, setTesto] = useState('');
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const fine = useRef<HTMLDivElement>(null);

  const caricaAccordi = useCallback(async () => {
    const { data } = await supabase
      .from('accordi_fantini')
      .select('id, tipo, testo')
      .eq('partita_id', partitaId)
      .eq('fantino_id', fantinoId);
    setAccordi((data ?? []) as Accordo[]);
  }, [partitaId, fantinoId]);

  const caricaLivello = useCallback(async () => {
    const { data } = await supabase
      .from('relazioni_contrada_fantino')
      .select('livello')
      .eq('partita_id', partitaId)
      .eq('fantino_id', fantinoId)
      .maybeSingle();
    if (data) setLivello(data.livello);
  }, [partitaId, fantinoId]);

  useEffect(() => {
    supabase
      .from('chat_messaggi')
      .select('autore, contenuto, creato_il')
      .eq('partita_id', partitaId)
      .eq('fantino_id', fantinoId)
      .order('creato_il', { ascending: true })
      .order('id', { ascending: true })
      .limit(200)
      .then(({ data }) => { if (data) setMessaggi(data as Messaggio[]); });
    caricaAccordi();
    caricaLivello();
  }, [partitaId, fantinoId, caricaAccordi, caricaLivello]);

  useEffect(() => {
    fine.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messaggi, caricando]);

  async function invia() {
    const messaggio = testo.trim();
    if (!messaggio || caricando) return;

    setMessaggi((prev) => [...prev, { autore: 'utente', contenuto: messaggio, creato_il: new Date().toISOString() }]);
    setTesto('');
    setCaricando(true);
    setErrore(null);

    const { data: sessione } = await supabase.auth.getSession();

    try {
      const risposta = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partita_id: partitaId,
          fantino_id: fantinoId,
          messaggio,
          access_token: sessione.session?.access_token,
        }),
      });
      const dati = await risposta.json();
      if (!risposta.ok) {
        setErrore(dati.error ?? 'Qualcosa è andato storto, riprova.');
      } else {
        setMessaggi((prev) => [...prev, { autore: 'fantino', contenuto: dati.risposta, creato_il: new Date().toISOString() }]);
        caricaAccordi();
        caricaLivello();
      }
    } catch {
      setErrore('Connessione assente: controlla la rete e riprova.');
    } finally {
      setCaricando(false);
    }
  }

  const accordiOrdinati = [...accordi].sort((a, b) => ordineAccordo(b.tipo) - ordineAccordo(a.tipo));

  return (
    <div className="chat-wrap">
      <section className={`chat${inTratta ? ' compatta' : ''}`}>
        <header className="testa">
          <FotoFantino nome={fantinoNome} foto={fantinoFoto ?? null} />
          <div className="testa-info">
            <div className="nome">
              {fantinoNome}{fantinoSoprannome && <span className="detto"> «{fantinoSoprannome}»</span>}
            </div>
            <p className="testa-sotto">{inTratta ? 'Consultazione Tratta' : 'Colloquio'}</p>
            <div className="testa-badges">
              <span className="badge-chat">Rapporto {livello}</span>
              <span className="badge-chat">{etichettaRapporto(livello).toLowerCase()}</span>
            </div>
          </div>
        </header>

        <div className="corpo">
          {messaggi.length === 0 && (
            <p className="vuoto">Nessun messaggio ancora. Saluta {fantinoNome} e scopri quanto si fida della tua contrada.</p>
          )}
          {messaggi.map((m, i) => (
            <div key={i} className={m.autore === 'utente' ? 'msg msg-utente' : 'msg msg-fantino'}>
              {m.contenuto}
              <span className="msg-ora">{ora(m.creato_il)}</span>
            </div>
          ))}
          {caricando && (
            <div className="scrive" role="status" aria-label={`${fantinoNome} sta scrivendo`}>
              <i /><i /><i />
            </div>
          )}
          {errore && <p className="errore">{errore}</p>}
          <div ref={fine} />
        </div>

        <form className="barra" onSubmit={(e) => { e.preventDefault(); invia(); }}>
          <input
            className="campo"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder={`Scrivi a ${fantinoNome}`}
            disabled={caricando}
          />
          <button className="bottone" type="submit" disabled={caricando}>Invia</button>
        </form>
      </section>

      {inTratta && (
        <section className="tratta-pannello">
          <div className="tratta-info">
            <strong>Come funziona.</strong> Qui parli con il fantino per capire se è disposto a montare per la tua Contrada.
            Gli accordi che ottieni sono di parola, mai certezze: la scelta finale dipende dall&apos;estrazione dei cavalli e dalla
            contrattazione. Nessun credito viene speso e la Tratta non assegna punti rapporto diretti.
          </div>

          <button className="btn btn-vuoto tratta-aggiorna" onClick={() => { caricaAccordi(); caricaLivello(); }}>Aggiorna</button>

          {accordiOrdinati.length === 0 && <p className="aiuto">Nessun accordo ancora con questo fantino.</p>}
          {accordiOrdinati.map((a) => (
            <div key={a.id} className="accordo-card">
              <div className="accordo-testa">
                <span className="accordo-titolo">{nomeAccordo(a.tipo)}</span>
                <span className="accordo-tag">accordo verbale</span>
              </div>
              <p className="accordo-testo">{a.testo}</p>
            </div>
          ))}

          <div className="tratta-legenda">
            <p>
              Puoi stringere altri accordi con lo stesso fantino su condizioni diverse. Un nuovo accordo sostituisce
              soltanto un precedente accordo riferito alla stessa condizione.
            </p>
            <ul>
              {TIPI_ACCORDO.map((t) => (
                <li key={t.chiave}><strong>{t.nome}</strong>: {t.descrizione}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}