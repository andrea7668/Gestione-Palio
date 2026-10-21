'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

type Cavallo = {
  id: string;
  nome: string;
  overall: number;
  eta: number | null;
  palii_corsi: number;
  vittorie: number;
  mossa: number;
  mossa_rincorsa: number | null;
  giro_1: number;
  giro_2: number;
  giro_3: number;
  sanmartino_curva_1: number;
  sanmartino_curva_2: number;
  sanmartino_curva_3: number;
  casato_curva_1: number;
  casato_curva_2: number;
  casato_curva_3: number;
  nota: string | null;
};

function bonus(valore: number) {
  return valore > 0 ? '+' + valore : String(valore);
}

export default function PaginaCavalli() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [nomePartita, setNomePartita] = useState('');
  const [anno, setAnno] = useState<number | null>(null);
  const [cavalli, setCavalli] = useState<Cavallo[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const { data: sessione } = await supabase.auth.getSession();
    if (!sessione.session) {
      router.replace('/accedi');
      return;
    }

    const [{ data: partita, error: errorePartita }, { data, error: erroreCavalli }] = await Promise.all([
      supabase.from('partite').select('nome, anno').eq('id', id).single(),
      supabase.from('cavalli')
        .select('id, nome, overall, eta, palii_corsi, vittorie, mossa, mossa_rincorsa, giro_1, giro_2, giro_3, sanmartino_curva_1, sanmartino_curva_2, sanmartino_curva_3, casato_curva_1, casato_curva_2, casato_curva_3, nota')
        .order('nome'),
    ]);

    if (errorePartita || !partita) {
      router.replace('/partite');
      return;
    }
    if (erroreCavalli) {
      console.error('cavalli:', erroreCavalli.message);
      setErrore('Impossibile caricare i cavalli. Riprova tra poco.');
      setCaricato(true);
      return;
    }

    setNomePartita(partita.nome);
    setAnno(partita.anno);
    setCavalli((data ?? []) as Cavallo[]);
    setErrore(null);
    setCaricato(true);
  }, [id, router]);

  useEffect(() => { void Promise.resolve().then(carica); }, [carica]);

  if (!caricato) return null;

  return (
    <main className="pagina-cavalli">
      <header className="intesta-cavalli">
        <div>
          <h1>Cavalli della tratta</h1>
          <p>Statistiche fisse dei cavalli: carriera, mossa, giri e curve.</p>
        </div>
        <button className="btn btn-vuoto" onClick={carica}>↻ Aggiorna</button>
      </header>

      <section className="carta tratta-cavalli">
        <div className="tratta-cavalli-testa">
          <div>
            <h2>Tratta{anno ? ` · Palio ${anno}` : ''}</h2>
            <p>{nomePartita}</p>
          </div>
        </div>

        <p className="nota-regole-cavalli">
          Mossa, giri, San Martino e Casato sono modificatori tecnici. I giri descrivono i tratti fuori curva; le note indicano quando il bonus o malus è già compreso nelle curve dello stesso giro.
        </p>

        {errore && <p className="errore" role="alert">{errore}</p>}
        {!errore && cavalli.length === 0 && <p className="aiuto">Nessun cavallo disponibile.</p>}
        <div className="griglia-cavalli">
          {cavalli.map((cavallo) => (
            <article className="scheda-cavallo" key={cavallo.id}>
              <header className="scheda-cavallo-testa">
                <h3>{cavallo.nome}</h3>
                <span className="badge-overall">Overall {cavallo.overall}</span>
              </header>

              <div className="dati-cavallo-riepilogo">
                <div><span>Età</span><strong>{cavallo.eta ?? '—'}</strong></div>
                <div><span>Palii corsi</span><strong>{cavallo.palii_corsi}</strong></div>
                <div><span>Vittorie</span><strong>{cavallo.vittorie}</strong></div>
              </div>

              <section className="stat-cavallo-sezione">
                <h4>Mossa</h4>
                <RigaStat nome="Bonus / malus alla mossa" valore={cavallo.mossa} />
                {cavallo.mossa_rincorsa !== null && (
                  <RigaStat nome="Mossa di rincorsa" valore={cavallo.mossa_rincorsa} />
                )}
              </section>

              <div className="gruppi-stat-cavallo">
                {[
                  {
                    nome: 'Giri',
                    righe: [
                      { nome: '1° giro', valore: cavallo.giro_1 },
                      { nome: '2° giro', valore: cavallo.giro_2 },
                      { nome: '3° giro', valore: cavallo.giro_3 },
                    ],
                  },
                  {
                    nome: 'San Martino',
                    righe: [
                      { nome: '1ª curva', valore: cavallo.sanmartino_curva_1 },
                      { nome: '2ª curva', valore: cavallo.sanmartino_curva_2 },
                      { nome: '3ª curva', valore: cavallo.sanmartino_curva_3 },
                    ],
                  },
                  {
                    nome: 'Casato',
                    righe: [
                      { nome: '1ª curva', valore: cavallo.casato_curva_1 },
                      { nome: '2ª curva', valore: cavallo.casato_curva_2 },
                      { nome: '3ª curva', valore: cavallo.casato_curva_3 },
                    ],
                  },
                ].map((gruppo) => (
                  <section className="stat-cavallo-sezione gruppo-stat-cavallo" key={gruppo.nome}>
                    <h4>{gruppo.nome}</h4>
                    {gruppo.righe.map((riga) => (
                      <RigaStat key={riga.nome} nome={riga.nome} valore={riga.valore} />
                    ))}
                  </section>
                ))}
              </div>

              {cavallo.nota && <p className="nota-cavallo">{cavallo.nota}</p>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function RigaStat({ nome, valore }: { nome: string; valore: number }) {
  return (
    <div className="stat-cavallo-riga">
      <span>{nome}</span>
      <strong>{bonus(valore)}</strong>
    </div>
  );
}
