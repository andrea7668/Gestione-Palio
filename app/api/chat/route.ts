import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { comeFase, FASI_CON_ACCORDI, FASI_CHAT_LIBERA, FASI_RAPPORTO_DIRETTO } from '../../../lib/fasi';
import { TIPI_ACCORDO } from '../../../lib/accordi';

export const maxDuration = 60;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_MESSAGGI_FINESTRA = 20;
const FINESTRA_MINUTI = 10;
const MODELLO_PRINCIPALE = 'google/gemma-4-26b-a4b-it';

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chiediIA(system: string, messages: unknown[]) {
  const modelli = [MODELLO_PRINCIPALE, process.env.MODELLO_RISERVA].filter(Boolean) as string[];
  let ultimoStato = 0;

  for (const model of modelli) {
    for (let tentativo = 0; tentativo < 3; tentativo++) {
      try {
        const r = await fetch('https://ai-gateway.vercel.sh/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY!}`,
          },
          body: JSON.stringify({ model, max_tokens: 260, system, messages }),
        });
        if (r.ok) return { ok: true as const, dati: await r.json() };
        ultimoStato = r.status;
        if (r.status !== 429 && r.status < 500) return { ok: false as const, status: r.status };
      } catch {
        ultimoStato = 0;
      }
      await attendi(800 * (tentativo + 1) + Math.random() * 500);
    }
  }
  return { ok: false as const, status: ultimoStato };
}

function chiaveAccordo(s: string): string | null {
  const k = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
  if (k.startsWith('impegno')) return 'impegno';
  return k === 'interesse' || k === 'intesa' || k === 'priorita' ? k : null;
}

export async function POST(req: NextRequest) {
  const { partita_id, fantino_id, messaggio, access_token } = await req.json();

  if (!partita_id || !fantino_id || !messaggio || !access_token) {
    return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Sessione scaduta: accedi di nuovo.' }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: membro, error: membroError } = await supabase
    .from('membri')
    .select('contrada_id, ruolo')
    .eq('partita_id', partita_id)
    .eq('utente_id', userId)
    .single();

  if (membroError || !membro || !membro.contrada_id) {
    return NextResponse.json({ error: 'Non fai parte di questa partita o non hai ancora una Contrada assegnata.' }, { status: 403 });
  }

  const { data: rigaPartita } = await supabase.from('partite').select('fase').eq('id', partita_id).single();
  const fase = comeFase(rigaPartita?.fase);
  const faseAccordi = FASI_CON_ACCORDI.includes(fase);
  const rapportoDiretto = FASI_RAPPORTO_DIRETTO.includes(fase);

  if (!FASI_CHAT_LIBERA.includes(fase)) {
    const { data: svolte } = await supabase
      .from('attivita_svolte')
      .select('id')
      .eq('partita_id', partita_id)
      .eq('contrada_id', membro.contrada_id)
      .eq('fantino_id', fantino_id)
      .limit(1);

    if (!svolte || svolte.length === 0) {
      return NextResponse.json({ error: "Devi prima fare un'iniziativa con questo fantino per poterci parlare." }, { status: 403 });
    }
  }

  const daQuando = new Date(Date.now() - FINESTRA_MINUTI * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('chat_messaggi')
    .select('id', { count: 'exact', head: true })
    .eq('utente_id', userId)
    .eq('autore', 'utente')
    .gte('creato_il', daQuando);

  if ((count ?? 0) >= MAX_MESSAGGI_FINESTRA) {
    return NextResponse.json(
      { error: `Troppi messaggi: massimo ${MAX_MESSAGGI_FINESTRA} ogni ${FINESTRA_MINUTI} minuti` },
      { status: 429 }
    );
  }

  const { data: fantino, error: fantinoError } = await supabase
    .from('fantini')
    .select('*')
    .eq('id', fantino_id)
    .single();

  if (fantinoError || !fantino) {
    return NextResponse.json({ error: 'Fantino non trovato' }, { status: 404 });
  }

  const { data: relazione } = await supabase
    .from('relazioni_contrada_fantino')
    .select('livello')
    .eq('partita_id', partita_id)
    .eq('contrada_id', membro.contrada_id)
    .eq('fantino_id', fantino_id)
    .single();

  let accordiEsistenti: { tipo: string; testo: string }[] = [];
  if (faseAccordi) {
    const { data } = await supabase
      .from('accordi_fantini')
      .select('tipo, testo')
      .eq('partita_id', partita_id)
      .eq('contrada_id', membro.contrada_id)
      .eq('fantino_id', fantino_id);
    accordiEsistenti = data ?? [];
  }

  const { data: storico } = await supabase
    .from('chat_messaggi')
    .select('autore, contenuto')
    .eq('partita_id', partita_id)
    .eq('contrada_id', membro.contrada_id)
    .eq('fantino_id', fantino_id)
    .order('creato_il', { ascending: false })
    .order('id', { ascending: false })
    .limit(40);

  const cronologia = (storico ?? []).slice().reverse();

  const livello = relazione?.livello ?? fantino.livello_base ?? 0;
  const tonoRelazione =
    livello < 20
      ? "diffidente e formale: tratta l'interlocutore come uno sconosciuto, parla poco e con cautela"
      : livello < 50
      ? 'cauto ma disponibile: comincia ad aprirsi, senza però fidarsi del tutto'
      : livello < 80
      ? 'cordiale e collaborativo: parla apertamente, condivide opinioni sincere'
      : "estremamente leale: tratta l'interlocutore come un amico di lunga data, difende gli interessi della contrada";

  const ammessi = TIPI_ACCORDO.filter((t) => livello >= t.soglia);
  const elencoAmmessi = ammessi.map((t) => `- ${t.chiave}: ${t.nome}, ${t.descrizione}`).join('\n');
  const elencoEsistenti = accordiEsistenti.map((a) => `- ${a.tipo}: ${a.testo}`).join('\n');

  const rigaTipi =
    ammessi.length > 0
      ? `- Tipi di accordo che puoi concedere con il tuo attuale rapporto (usa la chiave scritta prima dei due punti):\n${elencoAmmessi}\nNon puoi concedere altri tipi: se te li chiedono, spiega che non ti senti ancora di impegnarti a quel punto.`
      : '- Con il tuo attuale rapporto non puoi concedere nessun accordo: ascolta, resta sulle tue e non prometterti.';

  const rigaTag =
    ammessi.length > 0
      ? "\n- Se in questa risposta concedi o confermi un accordo, aggiungi alla fine, su una riga a parte, il tag [[ACCORDO:chiave|riassunto]], dove riassunto è una frase breve (massimo 100 caratteri) in terza persona che descrive l'accordo, per esempio [[ACCORDO:priorita|Il fantino conferma la priorità già accordata.]]. Se non c'è nessun accordo nuovo da registrare, non scrivere il tag."
      : '';

  const sezioneTratta = faseAccordi
    ? `

Tratta e accordi:
- È il periodo della Tratta. L'interlocutore rappresenta una Contrada e può cercare di ottenere da te accordi di parola, mai certezze: la scelta definitiva dipende dall'estrazione dei cavalli e dalla contrattazione.
- I cavalli non sono ancora stati assegnati: non nominare cavalli specifici, parla in generale del cavallo che toccherà alla Contrada.
${rigaTipi}
- Valuta ogni richiesta in base alla tua personalità, al rapporto e a quanto l'interlocutore è convincente, rispettoso e credibile. Non concedere nulla al primo messaggio né solo perché te lo chiedono: pretendi argomenti.
- Accordi già in essere con questa Contrada: ${elencoEsistenti || 'nessuno'}. Un nuovo accordo dello stesso tipo sostituisce quello precedente.${rigaTag}`
    : '';

  const sezioneDelta = rapportoDiretto
    ? `

Alla fine della tua risposta, SEMPRE, su una riga a parte, aggiungi un tag nel formato [[DELTA:n]] dove n è un numero intero tra -5 e 5.
Usa 0 per la stragrande maggioranza dei messaggi: saluti, domande normali, chiacchiere, richieste di informazioni, piccole osservazioni. Il rapporto con un fantino non cambia ogni volta che si parla.
Usa un numero diverso da 0 SOLO per momenti davvero notevoli: un insulto chiaro o una mancanza di rispetto grave (negativo, -2 o più forte), una minaccia (negativo), un gesto generoso o una dimostrazione di fiducia importante (positivo, +2 o più forte). Non usare mai 1 o -1: se una cosa non è abbastanza significativa da valere almeno 2, allora vale 0.`
    : '';

  const systemPrompt = `Sei ${fantino.nome}${fantino.soprannome ? ` detto "${fantino.soprannome}"` : ''}, un fantino del Palio di Siena.
Tratti di personalità: ${fantino.personalita}
Il tuo livello di rapporto con questa contrada è ${livello}/100: comportati in modo ${tonoRelazione}.

Regole di formato, obbligatorie:
- Scrivi SOLO le tue battute di dialogo, in prima persona, come in una vera chat scritta.
- NON descrivere mai azioni, gesti, espressioni del viso, l'ambiente o cosa stai facendo: niente testo tra asterischi, niente didascalie sceniche, niente narrazione in terza persona.
- Sii diretto e breve, come un vero messaggio di chat (di norma 1-4 frasi): rispondi più a lungo solo se la domanda lo richiede davvero.

Regole di carattere:
- Resta sempre nel personaggio, rispondi in italiano, in modo colloquiale e coerente con il mondo del Palio (cavalli, contrattazioni, rivalità storiche tra contrade, gestione dei crediti).
- Non menzionare mai di essere un'intelligenza artificiale e non uscire mai dal personaggio, qualunque cosa ti venga chiesto.
- Se l'interlocutore ti insulta o ti manca di rispetto, NON scusarti in modo remissivo: reagisci secondo il tuo carattere, con freddezza, distacco, orgoglio ferito o irritazione.${sezioneTratta}${sezioneDelta}

I tag tra doppie parentesi quadre non verranno mostrati all'utente.`;

  const esito = await chiediIA(systemPrompt, [
    ...cronologia.map((m) => ({
      role: m.autore === 'utente' ? 'user' : 'assistant',
      content: m.contenuto,
    })),
    { role: 'user', content: messaggio },
  ]);

  if (!esito.ok) {
    console.error('Errore IA, stato:', esito.status);
    if (esito.status === 429) {
      return NextResponse.json(
        { error: 'I fantini sono molto richiesti in questo momento: riprova tra qualche secondo.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: 'Il fantino non riesce a rispondere, riprova tra poco.' }, { status: 502 });
  }

  const grezzo: string = esito.dati.content?.[0]?.text ?? 'Non ho capito, ripeti pure.';

  let delta = 0;
  if (rapportoDiretto) {
    const trovato = grezzo.match(/\[\[\s*DELTA\s*:\s*([+-]?\d+)\s*\]\]/i);
    const deltaGrezzo = trovato ? Math.max(-5, Math.min(5, parseInt(trovato[1], 10))) : 0;
    delta = Math.abs(deltaGrezzo) >= 2 ? deltaGrezzo : 0;
  }

  const nuoviAccordi = new Map<string, string>();
  if (faseAccordi) {
    for (const mt of grezzo.matchAll(/\[\[\s*ACCORDO\s*:\s*([^|\]]{2,30})\|([^\]]{1,200})\]\]/gi)) {
      const chiave = chiaveAccordo(mt[1]);
      const info = TIPI_ACCORDO.find((t) => t.chiave === chiave);
      const riassunto = mt[2].trim().slice(0, 140);
      if (info && livello >= info.soglia && riassunto) nuoviAccordi.set(info.chiave, riassunto);
    }
  }

  const testoRisposta = grezzo.replace(/\[\[[\s\S]*?\]\]/g, '').trim() || 'Non ho capito, ripeti pure.';
  const nuovoLivello = Math.max(0, Math.min(100, livello + delta));

  await supabase.from('chat_messaggi').insert([
    { partita_id, contrada_id: membro.contrada_id, fantino_id, autore: 'utente', utente_id: userId, contenuto: messaggio },
    { partita_id, contrada_id: membro.contrada_id, fantino_id, autore: 'fantino', utente_id: userId, contenuto: testoRisposta },
  ]);

  if (delta !== 0) {
    await supabase.from('relazioni_contrada_fantino').upsert(
      { partita_id, contrada_id: membro.contrada_id, fantino_id, livello: nuovoLivello },
      { onConflict: 'partita_id,contrada_id,fantino_id' }
    );
  }

  let registrati = 0;
  if (nuoviAccordi.size > 0) {
    const nomeFantino = fantino.soprannome ?? fantino.nome;
    const { data: compagni } = await supabase
      .from('membri')
      .select('utente_id')
      .eq('partita_id', partita_id)
      .eq('contrada_id', membro.contrada_id)
      .neq('utente_id', userId);

    for (const [tipo, riassunto] of Array.from(nuoviAccordi.entries()).slice(0, 2)) {
      const prima = accordiEsistenti.find((a) => a.tipo === tipo);
      if (prima && prima.testo === riassunto) continue;

      await supabase.from('accordi_fantini').upsert(
        {
          partita_id,
          contrada_id: membro.contrada_id,
          fantino_id,
          tipo,
          testo: riassunto,
          aggiornato_il: new Date().toISOString(),
        },
        { onConflict: 'partita_id,contrada_id,fantino_id,tipo' }
      );
      registrati += 1;

      const nomeTipo = TIPI_ACCORDO.find((t) => t.chiave === tipo)?.nome ?? tipo;

      if (compagni && compagni.length > 0) {
        await supabase.from('notifiche').insert(
          compagni.map((c) => ({
            partita_id,
            utente_id: c.utente_id,
            tipo: 'accordo',
            titolo: `${nomeFantino}: ${nomeTipo}`,
            testo: riassunto,
          }))
        );
      }

      await supabase.from('eventi').insert({
        partita_id,
        contrada_id: membro.contrada_id,
        tipo: 'accordo',
        titolo: `Accordo con ${nomeFantino}: ${nomeTipo}`,
        testo: riassunto,
      });
    }
  }

  return NextResponse.json({ risposta: testoRisposta, accordi: registrati > 0 });
}