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

const formatoData = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
        <p className="aiuto">
          Un accordo è un impegno di parola, non una certezza: il fantino potrebbe montare per un&apos;altra Contrada.
          Si ottiene parlando con lui nella pagina Fantini.
        </p>
        {accordi.length === 0 && <p className="aiuto">Nessun accordo ancora.</p>}
        <div className="pr-lista">
          {accordi.map((a) => (
            <div key={a.id} className="pr-riga">
              <div>
                <p className="pr-nome">
                  {a.fantini?.nome}{a.fantini?.soprannome ? ` «${a.fantini.soprannome}»` : ''}
                  <span className="badge-accordo" style={{ marginLeft: 8 }}>{nomeAccordo(a.tipo)}</span>
                </p>
                <p className="pr-sotto">{a.testo}</p>
                {eSindaco && <p className="pr-sotto">Contrada {a.contrade?.nome}</p>}
              </div>
              <span className="pr-sotto">{formatoData(a.aggiornato_il)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="carta">
        <h3 className="dash-titolo">Contrattazione</h3>
        <p className="aiuto">In arrivo: dipende dalle regole della contrattazione, che stiamo ancora definendo.</p>
      </section>
    </main>
  );
}