'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

type Cavallo = { id: string; nome: string; overall: number };

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
      supabase.from('cavalli').select('id, nome, overall').order('overall', { ascending: false }).order('nome'),
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
          <p>Schede tecniche dei cavalli: overall e dati della carriera.</p>
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

        {errore && <p className="errore" role="alert">{errore}</p>}
        {!errore && cavalli.length === 0 && <p className="aiuto">Nessun cavallo disponibile.</p>}
        <div className="griglia-cavalli">
          {cavalli.map((cavallo) => (
            <article className="scheda-cavallo" key={cavallo.id}>
              <h3>{cavallo.nome}</h3>
              <p>Overall {cavallo.overall}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
