'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, chiama } from '../lib/supabase';

type Messaggio = { id: number; utente_id: string | null; autore_nome: string; contenuto: string; creato_il: string };

const ora = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

export default function ChatContrada({ partitaId, contradaId, mioId }: { partitaId: string; contradaId: string; mioId: string }) {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);

  const carica = useCallback(async () => {
    const { data } = await supabase
      .from('chat_contrada')
      .select('id, utente_id, autore_nome, contenuto, creato_il')
      .eq('partita_id', partitaId)
      .eq('contrada_id', contradaId)
      .order('creato_il', { ascending: false })
      .limit(100);
    setMessaggi(((data ?? []) as Messaggio[]).reverse());
  }, [partitaId, contradaId]);

  useEffect(() => { carica(); }, [carica]);

  useEffect(() => {
    const canale = supabase
      .channel(`chat-contrada-${partitaId}-${contradaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_contrada', filter: `contrada_id=eq.${contradaId}` }, (payload) => {
        const m = payload.new as unknown as Messaggio & { partita_id: string };
        if (m.partita_id !== partitaId) return;
        setMessaggi((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(canale); };
  }, [partitaId, contradaId]);

  useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [messaggi]);

  async function invia() {
    const t = testo.trim();
    if (!t || invio) return;
    setInvio(true);
    setErrore(null);
    const r = await chiama({ azione: 'chat_contrada', partita_id: partitaId, testo: t });
    setInvio(false);
    if (!r.ok) { setErrore(r.error); return; }
    setTesto('');
    const messaggio = r.messaggio as Messaggio | undefined;
    if (messaggio) {
      setMessaggi((prev) => (prev.some((x) => x.id === messaggio.id) ? prev : [...prev, messaggio]));
    }
  }

  return (
    <section className="carta">
      <h3 className="dash-titolo">Chat di Contrada</h3>
      <div className="cc-lista" ref={lista}>
        {messaggi.length === 0 && <p className="aiuto">Nessun messaggio: apri tu la conversazione.</p>}
        {messaggi.map((m) => {
          const mio = m.utente_id === mioId;
          return (
            <div key={m.id} className={`cc-msg ${mio ? 'mio' : 'altro'}`}>
              {!mio && <span className="cc-autore">{m.autore_nome}</span>}
              <span className="cc-testo">{m.contenuto}</span>
              <span className="cc-ora">{ora(m.creato_il)}</span>
            </div>
          );
        })}
      </div>
      {errore && <p className="errore">{errore}</p>}
      <form className="cc-barra" onSubmit={(e) => { e.preventDefault(); invia(); }}>
        <input className="campo" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi alla tua Contrada" maxLength={500} />
        <button className="btn" type="submit" disabled={invio}>Invia</button>
      </form>
    </section>
  );
}