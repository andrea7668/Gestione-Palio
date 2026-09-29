'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, chiama } from '../../../lib/supabase';
import FantinoChat from '../../../components/FantinoChat';

type Membro = { utente_id: string; ruolo: string | null; contrada_id: string | null; profiles: { nome: string; cognome: string; username: string } | null };
type Contrada = { id: string; nome: string };
type Fantino = { id: string; nome: string; soprannome: string | null };
type Movimento = { contrada_id: string; importo: number };
type MioProfilo = { nome: string; cognome: string; username: string } | null;

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
  const [mioProfilo, setMioProfilo] = useState<MioProfilo>(null);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const uid = s.session.user.id;

    const [mRes, pRes, cRes, moRes, profRes] = await Promise.all([
      supabase.from('membri').select('ruolo, contrada_id').eq('partita_id', id).eq('utente_id', uid).single(),
      supabase.from('partite').select('nome, anno, codice').eq('id', id).single(),
      supabase.from('contrade').select('id, nome').order('nome'),
      supabase.from('movimenti_crediti').select('contrada_id, importo').eq('partita_id', id),
      supabase.from('profiles').select('nome, cognome, username').eq('id', uid).single(),
    ]);

    if (!mRes.data) return router.replace('/partite');
    setIo(mRes.data);
    setPartita(pRes.data);
    setContrade(cRes.data ?? []);
    setMovimenti(moRes.data ?? []);
    setMioProfilo(profRes.data ?? null);

    const attese: PromiseLike<void>[] = [];
    if (mRes.data.ruolo === 'sindaco') {
      attese.push(chiama({ azione: 'membri', partita_id: id }).then((r) => setMembri(r.membri ?? [])));
    }
    if (mRes.data.contrada_id) {
      attese.push(
        supabase.from('fantini').select('id, nome, soprannome').order('nome').then(({ data: f }) => setFantini(f ?? []))
      );
    }
    await Promise.all(attese);
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

  async function assegnaCrediti(contrada_id: string, importo: number) {
    setMovimenti((prev) => [...prev, { contrada_id, importo }]); // aggiornamento immediato
    const r = await chiama({ azione: 'crediti', partita_id: id, contrada_id, importo });
    if (!r.ok) {
      setMovimenti((prev) => prev.slice(0, -1)); // annulla se il server rifiuta
      alert(r.error);
    }
  }

  const nomeContrada = (contrada_id: string | null) => contrade.find((c) => c.id === contrada_id)?.nome;

  return (
    <main className="pagina">
      <header className="intesta">
        <div>
          <p className="sopra">Anno {partita?.anno}</p>
          <h1>{partita?.nome ?? '...'}</h1>
          {io?.ruolo === 'sindaco' && <p className="aiuto">Codice per invitare i giocatori: <strong className="codice">{partita?.codice}</strong></p>}
        </div>
        <div className="azioni" style={{ marginTop: 0 }}>
          <Link className="btn btn-vuoto" href="/partite">Le tue partite</Link>
          {io?.ruolo === 'sindaco' && <button className="btn btn-vuoto" onClick={elimina}>Elimina partita</button>}
        </div>
      </header>

      {io && io.ruolo !== 'sindaco' && (
        <section className="carta carta-io">
          <p className="sopra">Bentornato, {mioProfilo?.nome} {mioProfilo?.cognome} · {mioProfilo?.username}</p>
          <div className="mio-riepilogo">
            <span className="tag-ruolo">{io.ruolo === 'mangino' ? 'Mangino' : 'Capitano'}</span>
            {io.contrada_id ? (
              <>
                <span className="tag-contrada">{nomeContrada(io.contrada_id) ?? '...'}</span>
                <span className="saldo-pill grande">{saldoContrada(io.contrada_id)} crediti</span>
              </>
            ) : (
              <span className="aiuto">In attesa che il Sindaco ti assegni una Contrada</span>
            )}
          </div>
        </section>
      )}

      {io?.ruolo === 'sindaco' && (
        <section className="carta">
          <h2>Giocatori</h2>
          {membri.filter((m) => m.ruolo !== 'sindaco').length === 0 && <p className="aiuto">Nessun giocatore ancora. Condividi il codice della partita.</p>}
          {membri.filter((m) => m.ruolo !== 'sindaco').map((m) => (
            <RigaGiocatore key={m.utente_id} m={m} contrade={contrade} salva={assegna} saldoContrada={saldoContrada} assegnaCrediti={assegnaCrediti} />
          ))}
        </section>
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

function RigaGiocatore({
  m, contrade, salva, saldoContrada, assegnaCrediti,
}: {
  m: Membro;
  contrade: Contrada[];
  salva: (u: string, r: string, c: string) => void;
  saldoContrada: (contrada_id: string) => number;
  assegnaCrediti: (contrada_id: string, importo: number) => void;
}) {
  const [ruolo, setRuolo] = useState(m.ruolo ?? '');
  const [contrada, setContrada] = useState(m.contrada_id ?? '');
  const [importo, setImporto] = useState('');

  function inviaCrediti() {
    const n = Number(importo);
    if (!m.contrada_id || !n || n <= 0) return;
    assegnaCrediti(m.contrada_id, n);
    setImporto('');
  }

  return (
    <div className="riga-giocatore">
      <span className="riga-nome">{m.profiles?.nome} {m.profiles?.cognome} <em>({m.profiles?.username})</em></span>
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

      {m.contrada_id && (
        <div className="riga-crediti">
          <span className="saldo-pill">{saldoContrada(m.contrada_id)} crediti</span>
          <input className="campo campo-piccolo" type="number" min={1} placeholder="+" value={importo} onChange={(e) => setImporto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && inviaCrediti()} />
          <button className="btn btn-vuoto" onClick={inviaCrediti}>Assegna</button>
        </div>
      )}
    </div>
  );
}