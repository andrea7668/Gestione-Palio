'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import FantinoChat from '../../../../components/FantinoChat';

type Fantino = {
  id: string; nome: string; soprannome: string | null; eta: number | null; overall: number | null;
  palii_corsi: number; vittorie: number; etichetta: string | null; stato: string; fascia: string | null;
  mossa: number; sanmartino_curva1: number; sanmartino_curva2: number; sanmartino_curva3: number;
  casato_curva1: number; casato_curva2: number; casato_curva3: number;
  nerbate_disponibili: number; parate_disponibili: number; livello_base: number;
};

function etichettaRapporto(l: number) {
  if (l < 20) return 'Diffidente';
  if (l < 50) return 'Cauto';
  if (l < 80) return 'Cordiale';
  return 'Fedele';
}

export default function PaginaFantini() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contradaId, setContradaId] = useState<string | null>(null);
  const [nomeContrada, setNomeContrada] = useState<string>('');
  const [fantini, setFantini] = useState<Fantino[]>([]);
  const [livelli, setLivelli] = useState<Record<string, number>>({});
  const [caricato, setCaricato] = useState(false);
  const [chatApertaCon, setChatApertaCon] = useState<Fantino | null>(null);
  const [selettoreAperto, setSelettoreAperto] = useState(false);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const { data: m } = await supabase
      .from('membri')
      .select('contrada_id, contrade(nome)')
      .eq('partita_id', id)
      .eq('utente_id', s.session.user.id)
      .single();
    if (!m) return router.replace('/partite');
    setContradaId(m.contrada_id);
    setNomeContrada((m.contrade as unknown as { nome: string } | null)?.nome ?? '');

    if (m.contrada_id) {
      const [{ data: f }, { data: rel }] = await Promise.all([
        supabase.from('fantini').select('*').order('nome'),
        supabase.from('relazioni_contrada_fantino').select('fantino_id, livello').eq('partita_id', id).eq('contrada_id', m.contrada_id),
      ]);
      setFantini((f as Fantino[]) ?? []);
      const mappa: Record<string, number> = {};
      (rel ?? []).forEach((r) => { mappa[r.fantino_id] = r.livello; });
      setLivelli(mappa);
    }
    setCaricato(true);
  }, [id, router]);

  useEffect(() => { carica(); }, [carica]);

  if (!caricato) return null;
  if (!contradaId) return <p className="carta">In attesa: il Sindaco deve ancora assegnarti ruolo e Contrada.</p>;

  return (
    <div className="pagina-fantini">
      <div className="griglia-fantini">
        {fantini.map((f) => {
          const livello = livelli[f.id] ?? f.livello_base;
          const perc = f.palii_corsi > 0 ? Math.round((f.vittorie / f.palii_corsi) * 100) : null;
          return (
            <article key={f.id} className="scheda-fantino">
              <header className="scheda-fantino-testa">
                <h3>{f.nome} {f.soprannome && <em>«{f.soprannome}»</em>}</h3>
                {f.etichetta && <span className="badge-etichetta">{f.etichetta}</span>}
              </header>
              <p className="scheda-fantino-sotto">{f.stato}{f.fascia ? ` · ${f.fascia}` : ''}</p>

              <div className="righe-stat">
                <span>Età</span><strong>{f.eta ?? '—'}</strong>
                <span>Overall</span><strong>{f.overall ?? '—'}</strong>
                <span>Palii corsi</span><strong>{f.palii_corsi}</strong>
                <span>Vittorie</span><strong>{f.vittorie}</strong>
                <span>Percentuale vittorie</span><strong>{perc === null ? '—' : `${perc}%`}</strong>
              </div>

              <div className="box-mossa"><span>Mossa</span><strong>{f.mossa}</strong></div>

              <div className="due-box">
                <div className="box-curve">
                  <p className="box-curve-titolo">San Martino</p>
                  <div><span>1ª curva</span><strong>{f.sanmartino_curva1}</strong></div>
                  <div><span>2ª curva</span><strong>{f.sanmartino_curva2}</strong></div>
                  <div><span>3ª curva</span><strong>{f.sanmartino_curva3}</strong></div>
                </div>
                <div className="box-curve">
                  <p className="box-curve-titolo">Casato</p>
                  <div><span>1ª curva</span><strong>{f.casato_curva1}</strong></div>
                  <div><span>2ª curva</span><strong>{f.casato_curva2}</strong></div>
                  <div><span>3ª curva</span><strong>{f.casato_curva3}</strong></div>
                </div>
              </div>

              <div className="due-box">
                <div className="box-azione"><p>Nerbata</p><strong>{f.nerbate_disponibili}</strong><span>azioni disponibili</span></div>
                <div className="box-azione"><p>Parata</p><strong>{f.parate_disponibili}</strong><span>azioni disponibili</span></div>
              </div>

              <div className={`box-rapporto${livello >= 50 ? ' positivo' : livello < 20 ? ' negativo' : ''}`}>
                <span>Rapporto con {nomeContrada}</span>
                <div><strong>{livello}</strong><em>{etichettaRapporto(livello)}</em></div>
              </div>
            </article>
          );
        })}
      </div>

      <button className="chat-fantini-fab" onClick={() => { setSelettoreAperto(true); setChatApertaCon(null); }}>
        💬 Chat fantini
      </button>

      {(selettoreAperto || chatApertaCon) && (
        <div className="chat-overlay">
          <div className="chat-overlay-pannello">
            <button className="chat-overlay-chiudi" onClick={() => { setSelettoreAperto(false); setChatApertaCon(null); }}>×</button>
            {chatApertaCon ? (
              <FantinoChat
                partitaId={id}
                fantinoId={chatApertaCon.id}
                fantinoNome={chatApertaCon.nome}
                fantinoSoprannome={chatApertaCon.soprannome ?? undefined}
              />
            ) : (
              <div className="chat-overlay-lista">
                <h3>Con chi vuoi parlare?</h3>
                {fantini.map((f) => (
                  <button key={f.id} className="btn btn-vuoto" style={{ textAlign: 'left' }} onClick={() => setChatApertaCon(f)}>
                    {f.nome}{f.soprannome ? ` — «${f.soprannome}»` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}