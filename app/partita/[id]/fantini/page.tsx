'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase, chiama } from '../../../../lib/supabase';
import { FASI_CHAT_LIBERA, INFO_FASI } from '../../../../lib/fasi';
import { TIPI_ACCORDO, etichettaRapporto } from '../../../../lib/accordi';
import { useFase } from '../../../../lib/contesto-fase';
import FantinoChat from '../../../../components/FantinoChat';
import FotoFantino from '../../../../components/FotoFantino';

const SOGLIA_CONTINUITA = 60;

type Fantino = {
  id: string; nome: string; soprannome: string | null; eta: number | null; overall: number | null;
  palii_corsi: number; vittorie: number; etichetta: string | null; stato: string; fascia: string | null;
  mossa: number; sanmartino_curva1: number; sanmartino_curva2: number; sanmartino_curva3: number;
  casato_curva1: number; casato_curva2: number; casato_curva3: number;
  nerbate_disponibili: number; parate_disponibili: number; livello_base: number;
  foto: string | null;
};
type TipoAttivita = { id: string; nome: string; costo_minimo: number; costo_massimo: number; variazione_massima: number };

function accordoPiuForte(tipi: string[] | undefined): string | null {
  if (!tipi || tipi.length === 0) return null;
  const migliore = [...TIPI_ACCORDO].reverse().find((t) => tipi.includes(t.chiave));
  return migliore ? migliore.nome : null;
}

export default function PaginaFantini() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { fase } = useFase();
  const [ruolo, setRuolo] = useState<string | null>(null);
  const [contradaId, setContradaId] = useState<string | null>(null);
  const [nomeContrada, setNomeContrada] = useState('');
  const [saldo, setSaldo] = useState(0);
  const [fantini, setFantini] = useState<Fantino[]>([]);
  const [livelli, setLivelli] = useState<Record<string, number>>({});
  const [sbloccati, setSbloccati] = useState<Set<string>>(new Set());
  const [accordiPer, setAccordiPer] = useState<Record<string, string[]>>({});
  const [tipiAttivita, setTipiAttivita] = useState<TipoAttivita[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [chatAperta, setChatAperta] = useState(false);
  const [fantinoChat, setFantinoChat] = useState<Fantino | null>(null);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const { data: m } = await supabase
      .from('membri')
      .select('ruolo, contrada_id, contrade(nome)')
      .eq('partita_id', id)
      .eq('utente_id', s.session.user.id)
      .single();
    if (!m) return router.replace('/partite');
    setRuolo(m.ruolo);
    setContradaId(m.contrada_id);
    setNomeContrada((m.contrade as unknown as { nome: string } | null)?.nome ?? '');

    if (m.contrada_id) {
      const [{ data: f }, { data: rel }, { data: tipi }, { data: svolte }, { data: movs }, { data: acc }] = await Promise.all([
        supabase.from('fantini').select('*').order('nome'),
        supabase.from('relazioni_contrada_fantino').select('fantino_id, livello').eq('partita_id', id).eq('contrada_id', m.contrada_id),
        supabase.from('tipi_attivita').select('*').order('nome'),
        supabase.from('attivita_svolte').select('fantino_id').eq('partita_id', id).eq('contrada_id', m.contrada_id),
        supabase.from('movimenti_crediti').select('importo').eq('partita_id', id).eq('contrada_id', m.contrada_id),
        supabase.from('accordi_fantini').select('fantino_id, tipo').eq('partita_id', id).eq('contrada_id', m.contrada_id),
      ]);
      setFantini((f as Fantino[]) ?? []);
      const mappa: Record<string, number> = {};
      (rel ?? []).forEach((r) => { mappa[r.fantino_id] = r.livello; });
      setLivelli(mappa);
      setTipiAttivita(((tipi ?? []) as unknown[]).map((t) => {
        const x = t as Record<string, unknown>;
        return { id: x.id as string, nome: x.nome as string, costo_minimo: Number(x.costo_minimo), costo_massimo: Number(x.costo_massimo), variazione_massima: Number(x.variazione_massima) };
      }));
      setSbloccati(new Set((svolte ?? []).map((x) => x.fantino_id)));
      const perFantino: Record<string, string[]> = {};
      (acc ?? []).forEach((a) => { (perFantino[a.fantino_id] ??= []).push(a.tipo); });
      setAccordiPer(perFantino);
      setSaldo((movs ?? []).reduce((t, x) => t + Number(x.importo), 0));
    } else if (m.ruolo === 'sindaco') {
      const { data: f } = await supabase.from('fantini').select('*').order('nome');
      setFantini((f as Fantino[]) ?? []);
    }
    setCaricato(true);
  }, [id, router]);

  useEffect(() => { carica(); }, [carica]);

  async function faiAttivita(fantinoId: string, tipoId: string, costo: number) {
    const r = await chiama({ azione: 'fai_attivita', partita_id: id, fantino_id: fantinoId, tipo_attivita_id: tipoId, costo });
    if (!r.ok) { alert(r.error); return; }
    await carica();
    return { successo: r.successo as boolean, delta: r.delta as number };
  }

  async function faiContinuita(fantinoId: string) {
    const r = await chiama({ azione: 'colloquio_continuita', partita_id: id, fantino_id: fantinoId });
    if (!r.ok) { alert(r.error); return; }
    alert('Colloquio di continuità concluso.');
    carica();
  }

  function chiudiChat() {
    setChatAperta(false);
    setFantinoChat(null);
    carica();
  }

  if (!caricato) return null;

  const eSindaco = ruolo === 'sindaco';
  if (!contradaId && !eSindaco) return <p className="carta">In attesa: il Sindaco deve ancora assegnarti ruolo e Contrada.</p>;
  const soloLettura = !contradaId;

  // Dal rapporto più alto al più basso; a parità, in ordine alfabetico. Il Sindaco li vede in ordine alfabetico.
  const rapportoDi = (f: Fantino) => livelli[f.id] ?? f.livello_base;
  const ordinati = soloLettura
    ? fantini
    : [...fantini].sort((a, b) => rapportoDi(b) - rapportoDi(a) || a.nome.localeCompare(b.nome, 'it'));

  const chatLibera = !!fase && FASI_CHAT_LIBERA.includes(fase);
  const conChat = chatLibera ? ordinati : ordinati.filter((f) => sbloccati.has(f.id));

  return (
    <div className="pagina-fantini">
      {soloLettura ? (
        <p className="aiuto" style={{ marginBottom: 14 }}>Vista del Sindaco: schede in sola lettura.</p>
      ) : (
        <p className="aiuto" style={{ marginBottom: 14 }}>Crediti disponibili: <strong>{saldo}</strong></p>
      )}

      <div className="griglia-fantini">
        {ordinati.map((f) => {
          const livello = rapportoDi(f);
          const perc = f.palii_corsi > 0 ? Math.round((f.vittorie / f.palii_corsi) * 100) : null;
          return (
            <SchedaFantino
              key={f.id}
              f={f}
              livello={livello}
              perc={perc}
              nomeContrada={nomeContrada}
              soloLettura={soloLettura}
              accordo={accordoPiuForte(accordiPer[f.id])}
              tipiAttivita={tipiAttivita}
              onFaiAttivita={(tipoId, costo) => faiAttivita(f.id, tipoId, costo)}
              onContinuita={() => faiContinuita(f.id)}
            />
          );
        })}
      </div>

      {!soloLettura && (
        <button className="chat-fantini-fab" onClick={() => setChatAperta(true)}>💬 Chat fantini</button>
      )}

      {chatAperta && contradaId && (
        <div className="chat-overlay" onClick={chiudiChat}>
          <div className="chat-overlay-pannello" onClick={(e) => e.stopPropagation()}>
            <button className="chat-overlay-chiudi" onClick={chiudiChat} aria-label="Chiudi">×</button>
            {fantinoChat ? (
              <>
                <button className="chat-overlay-indietro" onClick={() => { setFantinoChat(null); carica(); }}>← Fantini</button>
                <FantinoChat
                  partitaId={id}
                  contradaId={contradaId}
                  fantinoId={fantinoChat.id}
                  fantinoNome={fantinoChat.nome}
                  fantinoSoprannome={fantinoChat.soprannome ?? undefined}
                  fantinoFoto={fantinoChat.foto}
                  livelloIniziale={rapportoDi(fantinoChat)}
                />
              </>
            ) : (
              <div className="chat-overlay-lista">
                <h3>Con chi vuoi parlare?</h3>
                {fase && (
                  <p className="aiuto">
                    Fase: {INFO_FASI[fase].nome}.{' '}
                    {chatLibera ? 'Puoi parlare con tutti i fantini.' : "Puoi parlare solo con i fantini con cui hai fatto un'iniziativa."}
                  </p>
                )}
                {conChat.length === 0 && (
                  <p className="aiuto">Non puoi ancora scrivere a nessuno: fai prima un&apos;iniziativa con un fantino.</p>
                )}
                {conChat.map((f) => {
                  const acc = accordoPiuForte(accordiPer[f.id]);
                  return (
                    <button key={f.id} className="btn btn-vuoto" style={{ textAlign: 'left' }} onClick={() => setFantinoChat(f)}>
                      {f.nome}{f.soprannome ? ` — «${f.soprannome}»` : ''}{acc ? ` · ${acc}` : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SchedaFantino({
  f, livello, perc, nomeContrada, soloLettura, accordo, tipiAttivita, onFaiAttivita, onContinuita,
}: {
  f: Fantino; livello: number; perc: number | null; nomeContrada: string; soloLettura: boolean; accordo: string | null;
  tipiAttivita: TipoAttivita[];
  onFaiAttivita: (tipoId: string, costo: number) => Promise<{ successo: boolean; delta: number } | undefined>;
  onContinuita: () => void;
}) {
  const [pannelloAperto, setPannelloAperto] = useState(false);
  const [tipoScelto, setTipoScelto] = useState('');
  const [costo, setCosto] = useState('');
  const [risultato, setRisultato] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const tipo = tipiAttivita.find((t) => t.id === tipoScelto);

  function sceglieTipo(id: string) {
    setTipoScelto(id);
    const t = tipiAttivita.find((x) => x.id === id);
    setCosto(t ? String(t.costo_minimo) : '');
  }

  async function conferma() {
    if (!tipo) return;
    const c = Number(costo);
    if (Number.isNaN(c) || c < tipo.costo_minimo || c > tipo.costo_massimo) {
      alert(`Scegli un importo tra ${tipo.costo_minimo} e ${tipo.costo_massimo}.`);
      return;
    }
    setInvio(true);
    const esito = await onFaiAttivita(tipoScelto, c);
    setInvio(false);
    if (esito) {
      setRisultato(esito.successo ? `Il fantino ha gradito: rapporto +${esito.delta}.` : 'Questa volta non è cambiato nulla.');
    }
    setPannelloAperto(false);
    setTipoScelto('');
    setCosto('');
  }

  return (
    <article className="scheda-fantino">
      <header className="scheda-fantino-testa">
        <div className="scheda-fantino-id">
          <FotoFantino nome={f.nome} foto={f.foto} />
        <div className="scheda-fantino-id">
          <FotoFantino nome={f.nome} foto={f.foto} />
          <h3>{f.nome} {f.soprannome && <em>«{f.soprannome}»</em>}</h3>
        </div>
        </div>
        <div className="scheda-fantino-tag">
          {accordo && <span className="badge-accordo">{accordo}</span>}
          {f.etichetta && <span className="badge-etichetta">{f.etichetta}</span>}
        </div>
      </header>
      <p className="scheda-fantino-sotto">{f.stato}{f.fascia ? ` · ${f.fascia}` : ''}</p>

      <div className="righe-stat">
        <span>Età</span><strong>{f.eta ?? '—'}</strong>
        <span>Overall</span><strong>{f.overall ?? '—'}</strong>
        <span>Palii corsi</span><strong>{f.palii_corsi}</strong>
        <span>Vittorie</span><strong>{f.vittorie}</strong>
        <span>Percentuale vittorie</span><strong>{perc === null ? '—' : `${perc}%`}</strong>
      </div>

      <div className="box-mossa"><span>Mossa</span><strong>{f.mossa}</strong></div>

      <div className="due-box">
        <div className="box-curve">
          <p className="box-curve-titolo">San Martino</p>
          <div><span>1ª curva</span><strong>{f.sanmartino_curva1}</strong></div>
          <div><span>2ª curva</span><strong>{f.sanmartino_curva2}</strong></div>
          <div><span>3ª curva</span><strong>{f.sanmartino_curva3}</strong></div>
        </div>
        <div className="box-curve">
          <p className="box-curve-titolo">Casato</p>
          <div><span>1ª curva</span><strong>{f.casato_curva1}</strong></div>
          <div><span>2ª curva</span><strong>{f.casato_curva2}</strong></div>
          <div><span>3ª curva</span><strong>{f.casato_curva3}</strong></div>
        </div>
      </div>

      <div className="due-box">
        <div className="box-azione"><p>Nerbata</p><strong>{f.nerbate_disponibili}</strong><span>azioni disponibili</span></div>
        <div className="box-azione"><p>Parata</p><strong>{f.parate_disponibili}</strong><span>azioni disponibili</span></div>
      </div>

      {!soloLettura && (
        <>
          <div className={`box-rapporto${livello >= 50 ? ' positivo' : livello < 20 ? ' negativo' : ''}`}>
            <span>Rapporto con {nomeContrada}</span>
            <div><strong>{livello}</strong><em>{etichettaRapporto(livello)}</em></div>
          </div>

          {risultato && <p className="aiuto">{risultato}</p>}

          {livello >= SOGLIA_CONTINUITA && (
            <button className="btn btn-vuoto" onClick={onContinuita}>Colloquio di continuità</button>
          )}

          {pannelloAperto ? (
            <div className="pannello-iniziativa">
              <select className="campo" value={tipoScelto} onChange={(e) => sceglieTipo(e.target.value)}>
                <option value="">Scegli un&apos;attività</option>
                {tipiAttivita.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome} · {t.costo_minimo}-{t.costo_massimo} crediti</option>
                ))}
              </select>
              {tipo && (
                <label>
                  Quanto vuoi spendere? ({tipo.costo_minimo}-{tipo.costo_massimo})
                  <input className="campo" type="number" min={tipo.costo_minimo} max={tipo.costo_massimo} step={0.5} value={costo} onChange={(e) => setCosto(e.target.value)} />
                </label>
              )}
              <div className="pannello-iniziativa-bottoni">
                <button className="btn" onClick={conferma} disabled={!tipo || invio}>Conferma</button>
                <button className="btn btn-vuoto" onClick={() => setPannelloAperto(false)}>Annulla</button>
              </div>
            </div>
          ) : (
            <button className="btn" onClick={() => { setPannelloAperto(true); setRisultato(null); }}>+ Fai un&apos;iniziativa</button>
          )}
        </>
      )}
    </article>
  );
}