'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Messaggio = { autore: 'utente' | 'fantino'; contenuto: string };

interface Props {
  fantinoId: string;
  fantinoNome: string;
  fantinoSoprannome?: string;
}

export default function FantinoChat({ fantinoId, fantinoNome, fantinoSoprannome }: Props) {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState('');
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const fine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fine.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messaggi, caricando]);

  async function invia() {
    const messaggio = testo.trim();
    if (!messaggio || caricando) return;

    setMessaggi((prev) => [...prev, { autore: 'utente', contenuto: messaggio }]);
    setTesto('');
    setCaricando(true);
    setErrore(null);

    const { data: sessione } = await supabase.auth.getSession();

    try {
      const risposta = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fantino_id: fantinoId,
          messaggio,
          access_token: sessione.session?.access_token,
        }),
      });
      const dati = await risposta.json();
      if (!risposta.ok) {
        setErrore(dati.error ?? 'Qualcosa è andato storto, riprova.');
      } else {
        setMessaggi((prev) => [...prev, { autore: 'fantino', contenuto: dati.risposta }]);
      }
    } catch {
      setErrore('Connessione assente: controlla la rete e riprova.');
    } finally {
      setCaricando(false);
    }
  }

  return (
    <section className="chat">
      <header className="testa">
        <div className="avatar" aria-hidden="true">{fantinoNome.charAt(0)}</div>
        <div>
          <div className="nome">{fantinoNome}</div>
          {fantinoSoprannome && <div className="detto">detto {fantinoSoprannome}</div>}
        </div>
      </header>

      <div className="corpo">
        {messaggi.length === 0 && (
          <p className="vuoto">Nessun messaggio ancora. Saluta {fantinoNome} e scopri quanto si fida della tua contrada.</p>
        )}
        {messaggi.map((m, i) => (
          <div key={i} className={m.autore === 'utente' ? 'msg msg-utente' : 'msg msg-fantino'}>
            {m.contenuto}
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

      <div className="barra">
        <input
          className="campo"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && invia()}
          placeholder={`Scrivi a ${fantinoNome}`}
          disabled={caricando}
        />
        <button className="bottone" onClick={invia} disabled={caricando}>Invia</button>
      </div>
    </section>
  );
}
