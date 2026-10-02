import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
          body: JSON.stringify({ model, max_tokens: 220, system, messages }),
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

  const livello = relazione?.livello ?? 0;
  const tonoRelazione =
    livello < 20
      ? "diffidente e formale: tratta l'interlocutore come uno sconosciuto, parla poco e con cautela"
      : livello < 50
      ? 'cauto ma disponibile: comincia ad aprirsi, senza però fidarsi del tutto'
      : livello < 80
      ? 'cordiale e collaborativo: parla apertamente, condivide opinioni sincere'
      : "estremamente leale: tratta l'interlocutore come un amico di lunga data, difende gli interessi della contrada";

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
- Se l'interlocutore ti insulta o ti manca di rispetto, NON scusarti in modo remissivo: reagisci secondo il tuo carattere, con freddezza, distacco, orgoglio ferito o irritazione.

Alla fine della tua risposta, SEMPRE, su una riga a parte, aggiungi un tag nel formato [[DELTA:n]] dove n è un numero intero tra -5 e 5: quanto l'ULTIMO messaggio dell'utente ha migliorato (positivo) o peggiorato (negativo) il tuo rapporto con la Contrada — un insulto o una mancanza di rispetto deve avere un delta chiaramente negativo. 0 se è stato neutro. Questo tag non verrà mostrato all'utente.`;

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

  const testoRisposta: string = esito.dati.content?.[0]?.text ?? 'Non ho capito, ripeti pure.';

  await supabase.from('chat_messaggi').insert([
    { partita_id, contrada_id: membro.contrada_id, fantino_id, autore: 'utente', utente_id: userId, contenuto: messaggio },
    { partita_id, contrada_id: membro.contrada_id, fantino_id, autore: 'fantino', utente_id: userId, contenuto: testoRisposta },
  ]);

  return NextResponse.json({ risposta: testoRisposta });
}
