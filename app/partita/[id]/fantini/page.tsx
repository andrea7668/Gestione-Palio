'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase, chiama } from '../../../../lib/supabase';
import { INFO_FASI, SOGLIA_CONTINUITA, SOGLIA_RAPPORTO_RIVALE_INVERNO } from '../../../../lib/fasi';
import { TIPI_ACCORDO, etichettaRapporto } from '../../../../lib/accordi';
import { useFase } from '../../../../lib/contesto-fase';
import FantinoChat from '../../../../components/FantinoChat';
import FotoFantino from '../../../../components/FotoFantino';

type Fantino = {
  id: string; nome: string; soprannome: string | null; eta: number | null; overall: number | null;
  palii_corsi: number; vittorie: number; etichetta: string | null; stato: string; fascia: string | null;
  mossa: number; sanmartino_curva1: number; sanmartino_curva2: number; sanmartino_curva3: number;
  casato_curva1: number; casato_curva2: number; casato_curva3: number;
  nerbate_disponibili: number; parate_disponibili: number; livello_base: number;
  foto: string | null;
};
type TipoAttivita = { id: string; nome: string; costo_minimo: number; costo_massimo: number; variazione_massima: number };

const COLONNE_FANTINO =
  'id, nome, soprannome, eta, overall, palii_corsi, vittorie, etichetta, stato, fascia, mossa, sanmartino_curva1, sanmartino_curva2, sanmartino_curva3, casato_curva1, casato_curva2, casato_curva3, nerbate_disponibili, parate_disponibili, livello_base, foto';
const COLONNE_ATTIVITA = 'id, nome, costo_minimo, costo_massimo, variazione_massima';

function accordoPiuForte(tipi: string[] | undefined): string | null {
  if (!tipi || tipi.length === 0) return null;
  const migliore = [...TIPI_ACCORDO].reverse().find((t) => tipi.includes(t.chiave));
  return migliore ? migliore.nome : null;
}

function faseInvernoConRivaleDebole(rapportoRivale: number | null): boolean {
  return rapportoRivale !== null && rapportoRivale < SOGLIA_RAPPORTO_RIVALE_INVERNO;
}

export default function PaginaFantini() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { fase } = useFase();
  const [ruolo, setRuolo] = useState<string | null>(null);
  const [contradaId, setContradaId] = useState<string | null>(null);
  const [nomeContrada, setNomeContrada] = useState('');
  const [nomeRivale, setNomeRivale] = useState<string | null>(null);
  const [rapportiRivali, setRapportiRivali] = useState<Record<string, number>>({});
  const [saldo, setSaldo] = useState<number | null>(null);
  const [erroreSaldo, setErroreSaldo] = useState<string | null>(null);
  const [fantini, setFantini] = useState<Fantino[]>([]);
  const [livelli, setLivelli] = useState<Record<string, number>>({});
  const [sbloccati, setSbloccati] = useState<Set<string>>(new Set());
  const [accordiPer, setAccordiPer] = useState<Record<string, string[]>>({});
  const [tipiAttivita, setTipiAttivita] = useState<TipoAttivita[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [chatAperta, setChatAperta] = useState(false);
  const [fantinoChat, setFantinoChat] = useState<Fantino | null>(null);
  const [messaggioInizialeChat, setMessaggioInizialeChat] = useState<string | null>(null);
  const caricamentoAttuale = useRef(0);

  const carica = useCallback(async () => {
    const numeroCaricamento = ++caricamentoAttuale.current;
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return router.replace('/accedi');
    const { data: m } = await supabase
      .from('membri')
      .select('ruolo, contrada_id, contrade(nome, rivale)')
      .eq('partita_id', id)
      .eq('utente_id', s.session.user.id)
      .single();
    if (!m) return router.replace('/partite');
    setRuolo(m.ruolo);
    setContradaId(m.contrada_id);
    setNomeContrada((m.contrade as unknown as { nome: string } | null)?.nome ?? '');
    const rivale = (m.contrade as unknown as { rivale: string | null } | null)?.rivale ?? null;
    setNomeRivale(rivale);

    if (m.contrada_id) {
      const relazioniInBackground = supabase
        .from('relazioni_contrada_fantino')
        .select('fantino_id, livello')
        .eq('partita_id', id)
        .eq('contrada_id', m.contrada_id)
        .then((risultato) => risultato);

      const [{ data: f }, { data: tipi }, { data: svolte }, { data: sal, error: erroreSaldoQuery }, { data: acc }, regolaRivale] = await Promise.all([
        supabase.from('fantini').select(COLONNE_FANTINO).order('nome'),
        supabase.from('tipi_attivita').select(COLONNE_ATTIVITA).order('nome'),
        supabase.from('attivita_svolte').select('fantino_id').eq('partita_id', id).eq('contrada_id', m.contrada_id),
        supabase.from('saldi_contrade').select('saldo').eq('partita_id', id).eq('contrada_id', m.contrada_id).maybeSingle(),
        supabase.from('accordi_fantini').select('fantino_id, tipo').eq('partita_id', id).eq('contrada_id', m.contrada_id),
        fase === 'inverno' ? chiama({ azione: 'rapporti_rivali', partita_id: id }) : Promise.resolve(null),
      ]);
      if (erroreSaldoQuery) {
        console.error('saldi_contrade:', erroreSaldoQuery.message);
        setErroreSaldo('Saldo non disponibile. Riprova tra poco.');
        setSaldo(null);
      } else {
        setErroreSaldo(null);
        setSaldo(Number(sal?.saldo ?? 0));
      }
      setFantini((f as Fantino[]) ?? []);
      setTipiAttivita(((tipi ?? []) as unknown[]).map((t) => {
        const x = t as Record<string, unknown>;
        return { id: x.id as string, nome: x.nome as string, costo_minimo: Number(x.costo_minimo), costo_massimo: Number(x.costo_massimo), variazione_massima: Number(x.variazione_massima) };
      }));
      setSbloccati(new Set((svolte ?? []).map((x) => x.fantino_id)));
      const perFantino: Record<string, string[]> = {};
      (acc ?? []).forEach((a) => { (perFantino[a.fantino_id] ??= []).push(a.tipo); });
      setAccordiPer(perFantino);
      if (regolaRivale?.ok) {
        setRapportiRivali(regolaRivale.rapporti ?? {});
        setNomeRivale(regolaRivale.rivale ?? rivale);
      } else if (regolaRivale) {
        console.error('rapporti_rivali:', regolaRivale.error ?? 'Risposta non valida');
      }

      void Promise.resolve(relazioniInBackground).then(({ data: rel, error }) => {
        if (error) {
          console.error('relazioni_contrada_fantino:', error.message);
          return;
        }
        if (numeroCaricamento !== caricamentoAttuale.current) return;
        const mappa: Record<string, number> = {};
        (rel ?? []).forEach((r) => { mappa[r.fantino_id] = r.livello; });
        setLivelli(mappa);
      }).catch((error: unknown) => {
        console.error('relazioni_contrada_fantino:', error);
      });
    } else if (m.ruolo === 'sindaco') {
      const { data: f } = await supabase.from('fantini').select(COLONNE_FANTINO).order('nome');
      setFantini((f as Fantino[]) ?? []);
    }
    setCaricato(true);
  }, [fase, id, router]);

  useEffect(() => { carica(); }, [carica]);

  async function faiAttivita(fantinoId: string, tipoId: string, costo: number) {
    const r = await chiama({ azione: 'fai_attivita', partita_id: id, fantino_id: fantinoId, tipo_attivita_id: tipoId, costo });
    if (!r.ok) { alert(r.error); return; }
    await carica();
    return { successo: r.successo as boolean, delta: r.delta as number };
  }

  function apriChatDopoIniziativa(fantinoId: string, conIniziativa = true) {
    const fantino = fantini.find((f) => f.id === fantinoId);
    if (!fantino || !contradaId) return;
    setFantinoChat(fantino);
    setMessaggioInizialeChat(conIniziativa
      ? 'Grazie per l\'iniziativa e per l\'attenzione che mi avete dedicato. Spero che il nostro rapporto possa crescere ancora.'
      : null);
    setChatAperta(true);
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
    setMessaggioInizialeChat(null);
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

  const conChat = fase === 'inverno' ? ordinati : ordinati.filter((f) => sbloccati.has(f.id));

  return (
    <div className="pagina-fantini">
      {soloLettura ? (
        <p className="aiuto" style={{ marginBottom: 14 }}>Vista del Sindaco: schede in sola lettura.</p>
      ) : (
        <p className="aiuto" style={{ marginBottom: 14 }}>Crediti disponibili: <strong>{saldo ?? 'non disponibili'}</strong></p>
      )}
      {erroreSaldo && <p className="errore" role="alert">{erroreSaldo}</p>}

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
              fase={fase}
              soloLettura={soloLettura}
              accordo={accordoPiuForte(accordiPer[f.id])}
              rapportoRivale={rapportiRivali[f.id] ?? null}
              nomeRivale={nomeRivale}
              tipiAttivita={tipiAttivita}
              onFaiAttivita={(tipoId, costo) => faiAttivita(f.id, tipoId, costo)}
              onApriChat={(conIniziativa = true) => apriChatDopoIniziativa(f.id, conIniziativa)}
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
                <button className="chat-overlay-indietro" onClick={() => { setFantinoChat(null); setMessaggioInizialeChat(null); carica(); }}>← Fantini</button>
                <FantinoChat
                  partitaId={id}
                  contradaId={contradaId}
                  fantinoId={fantinoChat.id}
                  fantinoNome={fantinoChat.nome}
                  fantinoSoprannome={fantinoChat.soprannome ?? undefined}
                  fantinoFoto={fantinoChat.foto}
                  livelloIniziale={rapportoDi(fantinoChat)}
                  messaggioIniziale={messaggioInizialeChat}
                  onMessaggioInizialeUsato={() => setMessaggioInizialeChat(null)}
                />
              </>
            ) : (
              <div className="chat-overlay-lista">
                <h3>Con chi vuoi parlare?</h3>
                {fase && (
                  <p className="aiuto">
                    Fase: {INFO_FASI[fase].nome}.{' '}
                    {fase === 'inverno'
                      ? 'In Inverno puoi parlare liberamente con tutti i fantini, anche senza iniziative.'
                      : 'Puoi parlare solo con i fantini con cui hai fatto un&apos;iniziativa.'}
                  </p>
                )}
                {conChat.length === 0 && (
                  <p className="aiuto">Non puoi ancora scrivere a nessuno: fai prima un&apos;iniziativa con un fantino.</p>
                )}
                {conChat.map((f) => {
                  const acc = accordoPiuForte(accordiPer[f.id]);
                  return (
                    <button key={f.id} className="btn btn-vuoto" style={{ textAlign: 'left' }} onClick={() => { setMessaggioInizialeChat(null); setFantinoChat(f); }}>
                      {fase === 'inverno' ? 'Parla liberamente · ' : ''}{f.nome}{f.soprannome ? ` — «${f.soprannome}»` : ''}{acc ? ` · ${acc}` : ''}
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
  f, livello, perc, nomeContrada, nomeRivale, rapportoRivale, fase, soloLettura, accordo, tipiAttivita, onFaiAttivita, onApriChat, onContinuita,
}: {
  f: Fantino; livello: number; perc: number | null; nomeContrada: string; nomeRivale: string | null; rapportoRivale: number | null; fase: string | null; soloLettura: boolean; accordo: string | null;
  tipiAttivita: TipoAttivita[];
  onFaiAttivita: (tipoId: string, costo: number) => Promise<{ successo: boolean; delta: number } | undefined>;
  onApriChat: (conIniziativa?: boolean) => void;
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
      onApriChat();
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
          <h3>{f.nome} {f.soprannome && <em>«{f.soprannome}»</em>}</h3>
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

          {fase === 'inverno' && faseInvernoConRivaleDebole(rapportoRivale) && (
            <div className="banner-rivale" role="status">
              <strong>Attenzione rivale</strong>
              <span>
                {nomeRivale ? `Rapporto con ${nomeRivale}: ${rapportoRivale}/100. ` : ''}
                I bonus positivi delle iniziative valgono il 50%.
              </span>
            </div>
          )}

          {risultato && <p className="aiuto">{risultato}</p>}

          {livello >= SOGLIA_CONTINUITA && (
            <button className="btn btn-vuoto" onClick={onContinuita}>Colloquio di continuità</button>
          )}

          {pannelloAperto ? (
            <div className="pannello-iniziativa">
              <select className="campo" value={tipoScelto} onChange={(e) => sceglieTipo(e.target.value)}>
                <option value="">Scegli un&apos;attività</option>
                {tipiAttivita.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {t.costo_minimo === 0 && t.costo_massimo === 0
                      ? 'gratuita'
                      : t.costo_minimo + '-' + t.costo_massimo + ' crediti'}
                  </option>
                ))}
              </select>
              {tipo && (
                tipo.costo_minimo === 0 && tipo.costo_massimo === 0 ? (
                  <p className="aiuto">Questa iniziativa non costa crediti.</p>
                ) : (
                  <label>
                    Quanto vuoi spendere? ({tipo.costo_minimo}-{tipo.costo_massimo})
                    <input className="campo" type="number" min={tipo.costo_minimo} max={tipo.costo_massimo} step={0.5} value={costo} onChange={(e) => setCosto(e.target.value)} />
                  </label>
                )
              )}
              <div className="pannello-iniziativa-bottoni">
                <button className="btn" onClick={conferma} disabled={!tipo || invio}>Conferma</button>
                <button className="btn btn-vuoto" onClick={() => setPannelloAperto(false)}>Annulla</button>
              </div>
            </div>
          ) : (
            <>
              <button className="btn" onClick={() => { setPannelloAperto(true); setRisultato(null); }}>+ Fai un&apos;iniziativa</button>
              {fase === 'inverno' && (
                <button className="btn btn-vuoto" onClick={() => onApriChat(false)}>Parla liberamente</button>
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}
