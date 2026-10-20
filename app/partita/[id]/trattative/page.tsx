'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { INFO_FASI, FASI_CON_TRATTATIVE } from '../../../../lib/fasi';
import { nomeAccordo } from '../../../../lib/accordi';
import { useFase } from '../../../../lib/contesto-fase';
import { useAggiorna } from '../../../../lib/useAggiorna';

type Accordo = {
  id: number;
  tipo: string;
  testo: string;
  aggiornato_il: string;
  fantini: { nome: string; soprannome: string | null } | null;
  contrade: { nome: string } | null;
};

const formatoData = (iso: string) => {
  const data = new Date(iso);
  const giorno = data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const ora = data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `${giorno} · ${ora}`;
};

export default function CentroTrattative() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { fase } = useFase();
  const [eSindaco, setESindaco] = useState(false);
  const [accordi, setAccordi] = useState<Accordo[]>([]);
  const [caricato, setCaricato] = useState(false);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const { data: m } = await supabase
      .from('membri')
      .select('ruolo, contrada_id')
      .eq('partita_id', id)
      .eq('utente_id', s.session.user.id)
      .single();
    if (!m) return router.replace('/partite');

    const sindaco = m.ruolo === 'sindaco';
    setESindaco(sindaco);

    if (!sindaco && !m.contrada_id) {
      setAccordi([]);
      setCaricato(true);
      return;
    }

    let richiesta = supabase
      .from('accordi_fantini')
      .select('id, tipo, testo, aggiornato_il, fantini(nome, soprannome), contrade(nome)')
      .eq('partita_id', id);
    if (!sindaco && m.contrada_id) richiesta = richiesta.eq('contrada_id', m.contrada_id);

    const { data } = await richiesta.order('aggiornato_il', { ascending: false });
    setAccordi((data ?? []) as unknown as Accordo[]);
    setCaricato(true);
  }, [id, router]);

  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    const canale = supabase
      .channel(`trattative-${id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'accordi_fantini', filter: `partita_id=eq.${id}`,
      }, () => { void carica(); })
      .subscribe();
    return () => { void supabase.removeChannel(canale); };
  }, [carica, id]);
  useAggiorna(carica, 20000);

  if (!caricato) return null;

  const aperto = !!fase && FASI_CON_TRATTATIVE.includes(fase);

  if (!aperto) {
    return (
      <main className="pagina">
        <header className="dash-intesta">
          <h1>Centro trattative</h1>
          <p className="aiuto">{fase ? `Fase attuale: ${INFO_FASI[fase].nome}` : ''}</p>
        </header>
        <section className="carta">
          <p className="aiuto">Il centro trattative si apre durante la Tratta.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pagina">
      <header className="dash-intesta">
        <h1>Centro trattative</h1>
        <p className="aiuto">Fase: {fase ? INFO_FASI[fase].nome : ''}</p>
      </header>

      <section className="carta">
        <h3 className="dash-titolo">{eSindaco ? 'Accordi dei fantini' : 'Accordi ottenuti'}</h3>
        <p className="aiuto">Impegni verbali raggiunti dai fantini. Non garantiscono la monta.</p>
        {accordi.length === 0 && <p className="aiuto">Nessun accordo ancora.</p>}
        <div className="tratta-accordi-lista">
          {accordi.map((a) => (
            <article key={a.id} className="tratta-accordo-riga">
              <div className="tratta-accordo-testa">
                <div className="tratta-accordo-identita">
                  <strong className="tratta-accordo-nome">
                    {a.fantini?.nome}{a.fantini?.soprannome ? ` «${a.fantini.soprannome}»` : ''}
                  </strong>
                  <span className="badge-accordo">{nomeAccordo(a.tipo)}</span>
                </div>
                <time className="tratta-accordo-data">{formatoData(a.aggiornato_il)}</time>
              </div>
              {eSindaco && <p className="tratta-accordo-contrada">Contrada {a.contrade?.nome}</p>}
              <p className="tratta-accordo-testo">{a.testo}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
