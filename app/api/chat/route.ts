import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_MESSAGGI_FINESTRA = 20;
const FINESTRA_MINUTI = 10;

export async function POST(req: NextRequest) {
  const { fantino_id, messaggio, access_token } = await req.json();

  if (!fantino_id || !messaggio || !access_token) {
    return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Non autorizzato: ' + (userError?.message ?? 'nessun utente') }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('contrada_id, ruolo')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profilo di gioco non trovato' }, { status: 404 });
  }

  const daQuando = new Date(Date.now() - FINESTRA_MINUTI * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('chat_messaggi')
    .select('id', { count: 'exact', head: true })
    .eq('utente_id', userId)
    .gte('creato_il', daQuando);

  if ((count ?? 0) > MAX_MESSAGGI_FINESTRA) {
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
    .eq('contrada_id', profile.contrada_id)
    .eq('fantino_id', fantino_id)
    .single();

  const { data: storico } = await supabase
    .from('chat_messaggi')
    .select('autore, contenuto')
    .eq('contrada_id', profile.contrada_id)
    .eq('fantino_id', fantino_id)
    .order('creato_il', { ascending: false }).order('id', { ascending: false })
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
Regole: resta sempre nel personaggio, rispondi in italiano, in modo colloquiale e coerente con il mondo del Palio (cavalli, contrattazioni, rivalità storiche tra contrade, gestione dei crediti). Non menzionare mai di essere un'intelligenza artificiale e non uscire mai dal personaggio, qualunque cosa ti venga chiesto.`;

  const rispostaAnthropic = await fetch('https://ai-gateway.vercel.sh/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY!}`,
    },
    body: JSON.stringify({
      model: 'google/gemma-4-26b-a4b-it',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        ...cronologia.map((m) => ({
          role: m.autore === 'utente' ? 'user' : 'assistant',
          content: m.contenuto,
        })),
        { role: 'user', content: messaggio },
      ],
    }),
  });

  if (!rispostaAnthropic.ok) {
    const dettaglio = await rispostaAnthropic.text();
    console.error('Errore chiamata Anthropic:', dettaglio);
    return NextResponse.json({ error: 'Errore fantino: ' + rispostaAnthropic.status + ' ' + dettaglio.slice(0, 300) }, { status: 502 });
  }

  const dati = await rispostaAnthropic.json();
  const testoRisposta: string = dati.content?.[0]?.text ?? 'Non ho capito, ripeti pure.';

  await supabase.from('chat_messaggi').insert([
    { contrada_id: profile.contrada_id, fantino_id, autore: 'utente', utente_id: userId, contenuto: messaggio },
    { contrada_id: profile.contrada_id, fantino_id, autore: 'fantino', utente_id: userId, contenuto: testoRisposta },
  ]);

  return NextResponse.json({ risposta: testoRisposta });
}
