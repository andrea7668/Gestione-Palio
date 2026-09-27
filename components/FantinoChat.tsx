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
  const [erroreVisibile, setErroreVisibile] = useState<string | null>(null);
  const fineChatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fineChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messaggi, caricando]);

  async function inviaMessaggio() {
    const messaggioUtente = testo.trim();
    if (!messaggioUtente || caricando) return;

    setMessaggi((prev) => [...prev, { autore: 'utente', contenuto: messaggioUtente }]);
    setTesto('');
    setCaricando(true);
    setErroreVisibile(null);

    const { data: sessione } = await supabase.auth.getSession();
    const accessToken = sessione.session?.access_token;

    try {
      const risposta = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fantino_id: fantinoId, messaggio: messaggioUtente, access_token: accessToken }),
      });

      const dati = await risposta.json();

      if (!risposta.ok) {
        setErroreVisibile(dati.error ?? 'Qualcosa è andato storto, riprova.');
      } else {
        setMessaggi((prev) => [...prev, { autore: 'fantino', contenuto: dati.risposta }]);
      }
    } catch {
      setErroreVisibile('Impossibile contattare il fantino, controlla la connessione.');
    } finally {
      setCaricando(false);
    }
  }

  return (
    <div style={stile.contenitore}>
      <div style={stile.intestazione}>
        <span style={stile.nomeFantino}>{fantinoNome}</span>
        {fantinoSoprannome && <span style={stile.soprannome}>"{fantinoSoprannome}"</span>}
      </div>

      <div style={stile.corpoChat}>
        {messaggi.length === 0 && (
          <p style={stile.messaggioVuoto}>Scrivi il primo messaggio a {fantinoNome}.</p>
        )}
        {messaggi.map((m, i) => (
          <div key={i} style={m.autore === 'utente' ? stile.rigaUtente : stile.rigaFantino}>
            <span style={m.autore === 'utente' ? stile.bollaUtente : stile.bollaFantino}>
              {m.contenuto}
            </span>
          </div>
        ))}
        {caricando && <p style={stile.statoScrittura}>{fantinoNome} sta scrivendo…</p>}
        {erroreVisibile && <p style={stile.errore}>{erroreVisibile}</p>}
        <div ref={fineChatRef} />
      </div>

      <div style={stile.barraInput}>
        <input
          style={stile.input}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && inviaMessaggio()}
          placeholder={`Parla con ${fantinoNome}...`}
          disabled={caricando}
        />
        <button style={stile.bottoneInvia} onClick={inviaMessaggio} disabled={caricando}>
          Invia
        </button>
      </div>
    </div>
  );
}

const stile: Record<string, React.CSSProperties> = {
  contenitore: {
    display: 'flex',
    flexDirection: 'column',
    height: '520px',
    maxWidth: '420px',
    border: '1px solid #3a2a20',
    borderRadius: '4px',
    overflow: 'hidden',
    fontFamily: 'Georgia, "Times New Roman", serif',
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
  },
  intestazione: {
    background: '#3a2a20',
    color: '#f0e6d2',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  nomeFantino: { fontSize: '17px', fontWeight: 700, letterSpacing: '0.2px' },
  soprannome: { fontSize: '13px', fontStyle: 'italic', opacity: 0.8 },
  corpoChat: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    background: '#f4ecd8',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  messaggioVuoto: { color: '#8a7a63', fontSize: '14px', textAlign: 'center', marginTop: '24px' },
  rigaUtente: { display: 'flex', justifyContent: 'flex-end' },
  rigaFantino: { display: 'flex', justifyContent: 'flex-start' },
  bollaUtente: {
    background: '#8a3324',
    color: '#f4ecd8',
    padding: '8px 12px',
    borderRadius: '10px 10px 2px 10px',
    maxWidth: '80%',
    fontSize: '14.5px',
    lineHeight: 1.4,
  },
  bollaFantino: {
    background: '#e3d5b8',
    color: '#3a2a20',
    padding: '8px 12px',
    borderRadius: '10px 10px 10px 2px',
    maxWidth: '80%',
    fontSize: '14.5px',
    lineHeight: 1.4,
    border: '1px solid #cbb98f',
  },
  statoScrittura: { color: '#8a7a63', fontSize: '13px', fontStyle: 'italic' },
  errore: { color: '#8a3324', fontSize: '13px' },
  barraInput: { display: 'flex', borderTop: '1px solid #cbb98f', background: '#f4ecd8' },
  input: {
    flex: 1,
    padding: '12px',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '14.5px',
    fontFamily: 'inherit',
    color: '#3a2a20',
  },
  bottoneInvia: {
    padding: '0 20px',
    border: 'none',
    background: '#8a3324',
    color: '#f4ecd8',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
