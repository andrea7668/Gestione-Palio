'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, chiama } from '../../lib/supabase';

type Riga = { ruolo: string | null; contrada_id: string | null; partite: { id: string; nome: string; anno: number } | null; contrade: { nome: string } | null };

export default function Partite() {
  const router = useRouter();
  const [nomeUtente, setNomeUtente] = useState('');
  const [righe, setRighe] = useState<Riga[]>([]);
  const [n, setN] = useState({ nome: '', anno: String(new Date().getFullYear()), descrizione: '', codice_admin: '' });
  const [codice, setCodice] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/accedi');
      const uid = s.session.user.id;
      const { data: p } = await supabase.from('profiles').select('nome, cognome').eq('id', uid).single();
      if (p) setNomeUtente(`${p.nome ?? ''} ${p.cognome ?? ''}`.trim());
      const { data } = await supabase.from('membri').select('ruolo, contrada_id, partite(id, nome, anno), contrade(nome)').eq('utente_id', uid);
      setRighe((data ?? []) as unknown as Riga[]);
    })();
  }, [router]);

  async function vai(body: object) {
    setErr(null);
    const r = await chiama(body);
    if (!r.ok) return setErr(r.error);
    router.push(`/partita/${r.id}`);
  }

  async function esci() { await supabase.auth.signOut(); router.push('/'); }

  return (
    <main className="pagina">
      <header className="intesta">
        <div>
          <p className="sopra">Il Gioco del Palio</p>
          <h1>Le tue partite</h1>
          <p className="aiuto">Bentornato, {nomeUtente || '...'}.</p>
        </div>
        <button className="btn btn-vuoto" onClick={esci}>Esci</button>
      </header>

      <h2>Carriere associate</h2>
      <div className="griglia">
        {righe.length === 0 && <p className="aiuto">Nessuna partita ancora: creane una o caricala con un codice.</p>}
        {righe.map((r) => r.partite && (
          <article className="carta" key={r.partite.id}>
            <h3>{r.partite.nome}</h3>
            <p className="aiuto">Anno {r.partite.anno}</p>
            <div className="tags">
              <span className="tag">{r.ruolo ?? 'In attesa'}</span>
              <span className="tag">{r.contrade?.nome ?? 'In attesa'}</span>
            </div>
            <Link className="btn" href={`/partita/${r.partite.id}`}>Continua</Link>
          </article>
        ))}
      </div>

      {err && <p className="errore">{err}</p>}
      <div className="griglia due">
        <div className="carta">
          <h2>Nuova partita</h2>
          <label>Nome della partita<input className="campo" value={n.nome} onChange={(e) => setN({ ...n, nome: e.target.value })} /></label>
          <label>Anno iniziale<input className="campo" type="number" value={n.anno} onChange={(e) => setN({ ...n, anno: e.target.value })} /></label>
          <label>Descrizione (facoltativa)<input className="campo" value={n.descrizione} onChange={(e) => setN({ ...n, descrizione: e.target.value })} /></label>
          <label>Codice amministratore<input className="campo" type="password" value={n.codice_admin} onChange={(e) => setN({ ...n, codice_admin: e.target.value })} /></label>
          <button className="btn" onClick={() => vai({ azione: 'crea', ...n })}>Crea partita e diventa Sindaco</button>
        </div>
        <div className="carta">
          <h2>Carica partita</h2>
          <p className="aiuto">Inserisci il codice ricevuto dal Sindaco. Alla prima entrata resterai in attesa finché non ti assegnerà ruolo e Contrada.</p>
          <label>Codice partita<input className="campo" placeholder="PALIO-XXXXXX" value={codice} onChange={(e) => setCodice(e.target.value)} /></label>
          <button className="btn btn-vuoto" onClick={() => vai({ azione: 'unisciti', codice })}>Carica partita</button>
        </div>
      </div>
    </main>
  );
}
