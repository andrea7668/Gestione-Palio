'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, chiama } from '../../../lib/supabase';
import FantinoChat from '../../../components/FantinoChat';

type Membro = { utente_id: string; ruolo: string | null; contrada_id: string | null; profiles: { nome: string; cognome: string; username: string } | null };
type Contrada = { id: string; nome: string };
type Fantino = { id: string; nome: string; soprannome: string | null };

export default function Partita() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [partita, setPartita] = useState<{ nome: string; anno: number; codice: string } | null>(null);
  const [io, setIo] = useState<{ ruolo: string | null; contrada_id: string | null } | null>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [fantino, setFantino] = useState<Fantino | null>(null);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const { data: m } = await supabase.from('membri').select('ruolo, contrada_id').eq('partita_id', id).eq('utente_id', s.session.user.id).single();
    if (!m) return router.replace('/partite');
    setIo(m);
    const { data: p } = await supabase.from('partite').select('nome, anno, codice').eq('id', id).single();
    setPartita(p);
    if (m.ruolo === 'sindaco') {
      const r = await chiama({ azione: 'membri', partita_id: id });
      setMembri(r.membri ?? []);
      const { data: c } = await supabase.from('contrade').select('id, nome').order('nome');
      setContrade(c ?? []);
    }
    if (m.contrada_id) {
      const { data: f } = await supabase.from('fantini').select('id, nome, soprannome').limit(1).single();
      setFantino(f);
    }
  }, [id, router]);

  useEffect(() => { carica(); }, [carica]);

  async function assegna(utente_id: string, ruolo: string, contrada_id: string) {
    await chiama({ azione: 'assegna', partita_id: id, utente_id, ruolo, contrada_id });
    carica();
  }

  return (
    <main className="pagina">
      <header className="intesta">
        <div>
          <p className="sopra">Anno {partita?.anno}</p>
          <h1>{partita?.nome ?? '...'}</h1>
          {io?.ruolo === 'sindaco' && <p className="aiuto">Codice per invitare i giocatori: <strong>{partita?.codice}</strong></p>}
        </div>
        <Link className="btn btn-vuoto" href="/partite">Le tue partite</Link>
      </header>

      {io?.ruolo === 'sindaco' && (
        <section className="carta">
          <h2>Giocatori</h2>
          {membri.filter((m) => m.ruolo !== 'sindaco').length === 0 && <p className="aiuto">Nessun giocatore ancora. Condividi il codice della partita.</p>}
          {membri.filter((m) => m.ruolo !== 'sindaco').map((m) => (
            <RigaGiocatore key={m.utente_id} m={m} contrade={contrade} salva={assegna} />
          ))}
        </section>
      )}

      {io && io.ruolo !== 'sindaco' && !io.contrada_id && (
        <p className="carta">In attesa: il Sindaco deve ancora assegnarti ruolo e Contrada.</p>
      )}
      {io?.contrada_id && fantino && (
        <FantinoChat fantinoId={fantino.id} fantinoNome={fantino.nome} fantinoSoprannome={fantino.soprannome ?? undefined} />
      )}
    </main>
  );
}

function RigaGiocatore({ m, contrade, salva }: { m: Membro; contrade: Contrada[]; salva: (u: string, r: string, c: string) => void }) {
  const [ruolo, setRuolo] = useState(m.ruolo ?? '');
  const [contrada, setContrada] = useState(m.contrada_id ?? '');
  return (
    <div className="riga">
      <span>{m.profiles?.nome} {m.profiles?.cognome} <em>({m.profiles?.username})</em></span>
      <select className="campo" value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
        <option value="">Ruolo</option>
        <option value="contradaiolo">Contradaiolo</option>
        <option value="mangino">Mangino</option>
      </select>
      <select className="campo" value={contrada} onChange={(e) => setContrada(e.target.value)}>
        <option value="">Contrada</option>
        {contrade.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <button className="btn" onClick={() => salva(m.utente_id, ruolo, contrada)}>Salva</button>
    </div>
  );
}
