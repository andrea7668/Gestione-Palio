'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import FantinoChat from '../../../../components/FantinoChat';

type Fantino = { id: string; nome: string; soprannome: string | null };

export default function PaginaFantini() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contradaId, setContradaId] = useState<string | null>(null);
  const [fantini, setFantini] = useState<Fantino[]>([]);
  const [fantinoScelto, setFantinoScelto] = useState<Fantino | null>(null);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/accedi');
      const { data: m } = await supabase
        .from('membri')
        .select('contrada_id')
        .eq('partita_id', id)
        .eq('utente_id', s.session.user.id)
        .single();
      if (!m) return router.replace('/partite');
      setContradaId(m.contrada_id);
      if (m.contrada_id) {
        const { data: f } = await supabase.from('fantini').select('id, nome, soprannome').order('nome');
        setFantini(f ?? []);
      }
      setCaricato(true);
    })();
  }, [id, router]);

  if (!caricato) return null;

  if (!contradaId) {
    return <p className="carta">In attesa: il Sindaco deve ancora assegnarti ruolo e Contrada.</p>;
  }

  if (fantinoScelto) {
    return (
      <>
        <button className="btn btn-vuoto" style={{ alignSelf: 'flex-start' }} onClick={() => setFantinoScelto(null)}>← Tutti i fantini</button>
        <FantinoChat
          partitaId={id}
          fantinoId={fantinoScelto.id}
          fantinoNome={fantinoScelto.nome}
          fantinoSoprannome={fantinoScelto.soprannome ?? undefined}
        />
      </>
    );
  }

  return (
    <section className="carta">
      <h2>Fantini</h2>
      {fantini.length === 0 && <p className="aiuto">Nessun fantino disponibile al momento.</p>}
      <div className="griglia">
        {fantini.map((f) => (
          <button key={f.id} className="btn btn-vuoto" onClick={() => setFantinoScelto(f)} style={{ textAlign: 'left' }}>
            {f.nome}{f.soprannome ? ` — detto ${f.soprannome}` : ''}
          </button>
        ))}
      </div>
    </section>
  );
}