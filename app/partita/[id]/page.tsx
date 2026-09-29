'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, chiama } from '../../../lib/supabase';
import FantinoChat from '../../../components/FantinoChat';

type Membro = { utente_id: string; ruolo: string | null; contrada_id: string | null; profiles: { nome: string; cognome: string; username: string } | null };
type Contrada = { id: string; nome: string };
type Fantino = { id: string; nome: string; soprannome: string | null };
type Movimento = { contrada_id: string; importo: number; motivo: string; creato_il: string };

export default function Partita() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [partita, setPartita] = useState<{ nome: string; anno: number; codice: string } | null>(null);
  const [io, setIo] = useState<{ ruolo: string | null; contrada_id: string | null } | null>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [fantini, setFantini] = useState<Fantino[]>([]);
  const [fantinoScelto, setFantinoScelto] = useState<Fantino | null>(null);
  const [movimenti, setMovimenti] = useState<Movimento[]>([]);

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
      const { data: f } = await supabase.from('fantini').select('id, nome, soprannome').order('nome');
      setFantini(f ?? []);
    }
    const { data: mo } = await supabase.from('movimenti_crediti').select('contrada_id, importo, motivo, creato_il').eq('partita_id', id);
    setMovimenti(mo ?? []);
  }, [id, router]);

  useEffect(() => { carica(); }, [carica]);

  async function assegna(utente_id: string, ruolo: string, contrada_id: string) {
    await chiama({ azione: 'assegna', partita_id: id, utente_id, ruolo, contrada_id });
    carica();
  }

  async function elimina() {
    if (window.confirm('Eliminare definitivamente questa partita? Non si può annullare.') === false) return;
    const r = await chiama({ azione: 'elimina', partita_id: id });
    if (r.ok) router.push('/partite');
    else alert(r.error);
  }

  const saldoContrada = (contrada_id: string) =>
    movimenti.filter((m) => m.contrada_id === contrada_id).reduce((tot, m) => tot + m.importo, 0);

  return (
    <main className="pagina">
      <header className="intesta">
        <div>
          <p className="sopra">Anno {partita?.anno}</p>
          <h1>{partita?.nome ?? '...'}</h1>
          {io?.ruolo === 'sindaco' && <p className="aiuto">Codice per invitare i giocatori: <strong className="codice">{partita?.codice}</strong></p>}
          {io && io.ruolo !== 'sindaco' && io.contrada_id && (
            <p className="aiuto">Crediti disponibili: <strong>{saldoContrada(io.contrada_id)}</strong></p>
          )}
        </div>
        <div className="azioni" style={{ marginTop: 0 }}>
          <Link className="btn btn-vuoto" href="/partite">Le tue partite</Link>
          {io?.ruolo === 'sindaco' && <button className="btn btn-vuoto" onClick={elimina}>Elimina partita</button>}
        </div>
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

      {io?.ruolo === 'sindaco' && (
        <PannelloCrediti
          contrade={contrade}
          saldoContrada={saldoContrada}
          assegna={async (contrada_id, importo, motivo) => {
            const r = await chiama({ azione: 'crediti', partita_id: id, contrada_id, importo, motivo });
            if (!r.ok) { alert(r.error); return; }
            carica();
          }}
        />
      )}

      {io && io.ruolo !== 'sindaco' && !io.contrada_id && (
        <p className="carta">In attesa: il Sindaco deve ancora assegnarti ruolo e Contrada.</p>
      )}

      {io?.contrada_id && !fantinoScelto && (
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
      )}

      {io?.contrada_id && fantinoScelto && (
        <>
          <button className="btn btn-vuoto" style={{ alignSelf: 'flex-start' }} onClick={() => setFantinoScelto(null)}>← Tutti i fantini</button>
          <FantinoChat
            partitaId={id}
            fantinoId={fantinoScelto.id}
            fantinoNome={fantinoScelto.nome}
            fantinoSoprannome={fantinoScelto.soprannome ?? undefined}
          />
        </>
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
        <option value="capitano">Capitano</option>
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

function PannelloCrediti({
  contrade, saldoContrada, assegna,
}: {
  contrade: Contrada[];
  saldoContrada: (contrada_id: string) => number;
  assegna: (contrada_id: string, importo: number, motivo: string) => void;
}) {
  const [contradaScelta, setContradaScelta] = useState('');
  const [importo, setImporto] = useState('');
  const [motivo, setMotivo] = useState('');

  function invia() {
    const n = Number(importo);
    if (!contradaScelta || !n || n <= 0 || !motivo.trim()) return;
    assegna(contradaScelta, n, motivo.trim());
    setImporto('');
    setMotivo('');
  }

  return (
    <section className="carta">
      <h2>Crediti</h2>
      {contrade.map((c) => (
        <div className="riga" key={c.id}>
          <span>{c.nome}</span>
          <strong>{saldoContrada(c.id)}</strong>
        </div>
      ))}
      <select className="campo" value={contradaScelta} onChange={(e) => setContradaScelta(e.target.value)}>
        <option value="">Contrada</option>
        {contrade.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input className="campo" type="number" min={1} placeholder="Importo" value={importo} onChange={(e) => setImporto(e.target.value)} />
      <input className="campo" placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <button className="btn" onClick={invia}>Assegna crediti</button>
    </section>
  );
}