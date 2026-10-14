'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, chiama } from '../../../lib/supabase';
import { FASI, INFO_FASI } from '../../../lib/fasi';
import { useFase } from '../../../lib/contesto-fase';
import ChatContrada from '../../../components/ChatContrada';
import FotoContrada from '../../../components/FotoContrada';
import { useAggiorna } from '../../../lib/useAggiorna';

type Membro = { utente_id: string; ruolo: string | null; contrada_id: string | null; profiles: { nome: string; cognome: string; username: string } | null };
type Contrada = { id: string; nome: string; rivale?: string | null };
type Movimento = { id: number; contrada_id: string; importo: number; motivo: string; creato_il: string };
type Evento = { id: number; tipo: string; titolo: string; testo: string | null; creato_il: string };

const ETICHETTE_EVENTI: Record<string, string> = {
    fase: 'Fase', ruolo: 'Ruoli', crediti: 'Crediti', iniziativa: 'Iniziativa', continuita: 'Continuità', promessa: 'Promessa', accordo: 'Accordo',
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
const formatoData = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Partita() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { fase, ricarica } = useFase();
  const [mioId, setMioId] = useState('');
  const [partita, setPartita] = useState<{ nome: string; anno: number; codice: string } | null>(null);
  const [io, setIo] = useState<{ ruolo: string | null; contrada_id: string | null } | null>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [movimenti, setMovimenti] = useState<Movimento[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const uid = s.session.user.id;
    setMioId(uid);

    const [mRes, pRes, cRes, moRes, evRes, memRes] = await Promise.all([
      supabase.from('membri').select('ruolo, contrada_id').eq('partita_id', id).eq('utente_id', uid).single(),
      supabase.from('partite').select('nome, anno, codice').eq('id', id).single(),
      supabase.from('contrade').select('*').order('nome'),
      supabase.from('movimenti_crediti').select('id, contrada_id, importo, motivo, creato_il').eq('partita_id', id),
      supabase.from('eventi').select('id, tipo, titolo, testo, creato_il').eq('partita_id', id).order('creato_il', { ascending: false }).limit(30),
      supabase.from('membri').select('utente_id, ruolo, contrada_id, profiles(nome, cognome, username)').eq('partita_id', id),
    ]);

    if (!mRes.data) return router.replace('/partite');
    setIo(mRes.data);
    setPartita(pRes.data);
    setContrade((cRes.data ?? []) as Contrada[]);
    setMovimenti(((moRes.data ?? []) as Movimento[]).map((m) => ({ ...m, importo: Number(m.importo) })));
    setEventi((evRes.data ?? []) as Evento[]);
    if (mRes.data.ruolo === 'sindaco') setMembri((memRes.data as unknown as Membro[]) ?? []);
  }, [id, router]);

  useEffect(() => { carica(); }, [carica]);
  useAggiorna(carica, 8000);

  useEffect(() => {
    const canale = supabase
      .channel(`partita-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membri', filter: `partita_id=eq.${id}` }, () => carica())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventi', filter: `partita_id=eq.${id}` }, () => carica())
      .subscribe();
    return () => { supabase.removeChannel(canale); };
  }, [id, carica]);

  async function assegna(utente_id: string, ruolo: string, contrada_id: string) {
    await chiama({ azione: 'assegna', partita_id: id, utente_id, ruolo, contrada_id });
  }

  async function elimina() {
    if (window.confirm('Eliminare definitivamente questa partita? Non si può annullare.') === false) return;
    const r = await chiama({ azione: 'elimina', partita_id: id });
    if (r.ok) router.push('/partite');
    else alert(r.error);
  }

  const indiceFase = fase ? FASI.indexOf(fase) : -1;
  const eUltimaFase = indiceFase === FASI.length - 1;

  async function avanzaFase() {
    if (!fase || indiceFase < 0) return;
    const prossima = FASI[(indiceFase + 1) % FASI.length];
    const domanda = eUltimaFase
      ? "Tornare all'Inverno? La partita riparte dall'inizio e tutti i giocatori vedranno il cambio subito."
      : `Passare a ${INFO_FASI[prossima].nome}? Tutti i giocatori vedranno il cambio subito.`;
    if (window.confirm(domanda) === false) return;
    const r = await chiama({ azione: 'cambia_fase', partita_id: id });
    if (!r.ok) { alert(r.error); return; }
    ricarica();
  }

  const saldoContrada = (contrada_id: string) =>
    Math.round(movimenti.filter((m) => m.contrada_id === contrada_id).reduce((tot, m) => tot + Number(m.importo), 0) * 100) / 100;

  async function assegnaCrediti(contrada_id: string, importo: number) {
    const provvisorio: Movimento = { id: -Date.now(), contrada_id, importo, motivo: `Aggiunta di ${importo} crediti`, creato_il: new Date().toISOString() };
    setMovimenti((prev) => [...prev, provvisorio]);
    const r = await chiama({ azione: 'crediti', partita_id: id, contrada_id, importo });
    if (!r.ok) {
      setMovimenti((prev) => prev.filter((m) => m.id !== provvisorio.id));
      alert(r.error);
    }
  }

  if (!io || !partita) return null;

  const eSindaco = io.ruolo === 'sindaco';
  const contradaId = io.contrada_id;
  const contradaCorrente = contrade.find((c) => c.id === contradaId);
  const nomeContrada = contradaCorrente?.nome ?? '';
  const nomeFase = fase ? INFO_FASI[fase].nome : '';

  const righeMov = (() => {
    if (!contradaId) return [];
    let corrente = 0;
    return movimenti
      .filter((m) => m.contrada_id === contradaId)
      .sort((a, b) => a.creato_il.localeCompare(b.creato_il))
      .map((m) => {
        const prima = corrente;
        corrente = Math.round((corrente + m.importo) * 100) / 100;
        return { ...m, prima, dopo: corrente };
      })
      .reverse();
  })();
  const saldo = righeMov.length > 0 ? righeMov[0].dopo : 0;

  const timeline = (
    <section className="carta">
      <h3 className="dash-titolo">Timeline degli eventi</h3>
      {eventi.length === 0 && <p className="aiuto">Nessun evento ancora.</p>}
      <div className="tl-lista">
        {eventi.map((e) => (
          <div key={e.id}>
            <p className="tl-tipo">{ETICHETTE_EVENTI[e.tipo] ?? e.tipo}</p>
            <p className="tl-titolo">{e.titolo}</p>
            {e.testo && <p className="tl-testo">{e.testo}</p>}
            <p className="tl-data">{formatoData(e.creato_il)}</p>
          </div>
        ))}
      </div>
    </section>
  );

  if (!eSindaco) {
    if (!contradaId) {
      return (
        <main className="pagina">
          <section className="carta">
            <h3 className="dash-titolo">In attesa</h3>
            <p className="aiuto">Il Sindaco deve ancora assegnarti ruolo e Contrada.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="pagina">
        <header className="dash-intesta">
          <h1>Contrada {nomeContrada}</h1>
          <p className="aiuto">{partita.nome} · Anno {partita.anno}{nomeFase ? ` · Fase: ${nomeFase}` : ''}</p>
        </header>

        <div className="dash-tre">
          <section className="carta">
            <div className="dash-contrada">
              <FotoContrada nome={nomeContrada || null} />
              <div>
                <h3>{nomeContrada}</h3>
                {contradaCorrente?.rivale && <p className="aiuto">Rivale: {contradaCorrente.rivale}</p>}
              </div>
            </div>
            <p className="dash-riga">Saldo: <strong>{fmt(saldo)} crediti</strong></p>
            <p className="dash-riga">Il tuo ruolo: <strong>{io.ruolo === 'mangino' ? 'Mangino' : 'Capitano'}</strong></p>
          </section>

          <section className="carta">
            <h3 className="dash-titolo">Fantino e cavallo</h3>
            <p className="dash-riga">Fantino: Non ingaggiato</p>
            <p className="dash-riga">Cavallo: Non assegnato</p>
          </section>

          <section className="carta">
            <h3 className="dash-titolo">Trattative</h3>
            <p className="aiuto">Nessuna trattativa aperta.</p>
          </section>
        </div>

        <section className="carta">
          <div className="mov-testa">
            <div>
              <h3 className="dash-titolo">Movimenti economici</h3>
              <p className="aiuto">Assegnazioni del Sindaco e spese per le iniziative.</p>
            </div>
            <p className="dash-riga">Saldo attuale: <strong>{fmt(saldo)} crediti</strong></p>
          </div>
          {righeMov.length === 0 && <p className="aiuto">Nessun movimento ancora.</p>}
          {righeMov.slice(0, 20).map((m) => (
            <div key={m.id} className="mov-riga">
              <div>
                <p className="mov-titolo">{m.motivo}</p>
                <p className="mov-data">{formatoData(m.creato_il)}</p>
              </div>
              <div className="mov-importo">
                <strong className={m.importo >= 0 ? 'mov-pos' : 'mov-neg'}>{m.importo >= 0 ? '+' : ''}{fmt(m.importo)} crediti</strong>
                <span className="mov-saldo">{fmt(m.prima)} → {fmt(m.dopo)}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="dash-due">
          <ChatContrada partitaId={id} contradaId={contradaId} mioId={mioId} />
          {timeline}
        </div>
      </main>
    );
  }

  return (
    <main className="pagina">
      <header className="intesta">
        <div>
          <p className="sopra">Anno {partita.anno}</p>
          <h1>{partita.nome}</h1>
          <p className="aiuto">Codice per invitare i giocatori: <strong className="codice">{partita.codice}</strong></p>
        </div>
        <div className="azioni" style={{ marginTop: 0 }}>
          <Link className="btn btn-vuoto" href="/partite">Le tue partite</Link>
          <button className="btn btn-vuoto" onClick={elimina}>Elimina partita</button>
        </div>
      </header>

      <section className="carta">
        <h2>Giocatori</h2>
        {membri.filter((m) => m.ruolo !== 'sindaco').length === 0 && <p className="aiuto">Nessun giocatore ancora. Condividi il codice della partita.</p>}
        {membri.filter((m) => m.ruolo !== 'sindaco').map((m) => (
          <RigaGiocatore key={m.utente_id} m={m} contrade={contrade} salva={assegna} saldoContrada={saldoContrada} assegnaCrediti={assegnaCrediti} />
        ))}
      </section>

      {timeline}

      {fase && (
        <section className="carta">
          <h2>Fasi di gioco</h2>
          <div className="fasi-lista">
            {FASI.map((f, i) => {
              const stato = i < indiceFase ? 'fatta' : i === indiceFase ? 'attiva' : 'futura';
              return (
                <div key={f} className={`fase-riga ${stato}`}>
                  <span className="fase-icona">{stato === 'fatta' ? '✓' : stato === 'attiva' ? '●' : '○'}</span>
                  <div>
                    <p className="fase-nome">{INFO_FASI[f].nome}</p>
                    <p className="fase-sotto">{INFO_FASI[f].sotto}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn" onClick={avanzaFase}>
            {eUltimaFase ? `Torna a ${INFO_FASI[FASI[0]].nome} ↺` : `Passa a ${INFO_FASI[FASI[indiceFase + 1]].nome} →`}
          </button>
        </section>
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

  function salvaAssegnazione() {
    if (!ruolo || !contrada) {
      alert('Scegli sia il ruolo che la Contrada prima di salvare.');
      return;
    }
    salva(m.utente_id, ruolo, contrada);
  }

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
      <button className="btn" onClick={salvaAssegnazione}>Salva</button>

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