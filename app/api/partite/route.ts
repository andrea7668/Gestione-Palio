import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FASI } from '../../../lib/fasi';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const SOGLIA_CONTINUITA = 60;

export async function POST(req: NextRequest) {
  const b = await req.json();
  const { data: u } = await db.auth.getUser(b.access_token);
  if (!u.user) return err('Sessione scaduta: accedi di nuovo.', 401);
  const uid = u.user.id;

  if (b.azione === 'crea') {
    if (!process.env.ADMIN_CODE || b.codice_admin !== process.env.ADMIN_CODE) return err('Codice amministratore non valido.', 403);
    if (!b.nome?.trim()) return err('Inserisci il nome della partita.');
    const codice = 'PALIO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: p, error } = await db.from('partite')
      .insert({ nome: b.nome.trim(), anno: Number(b.anno), descrizione: b.descrizione || null, codice, sindaco_id: uid })
      .select().single();
    if (error || !p) return err('Creazione non riuscita.', 500);
    await db.from('membri').insert({ partita_id: p.id, utente_id: uid, ruolo: 'sindaco' });
    return NextResponse.json({ id: p.id, codice });
  }

  if (b.azione === 'unisciti') {
    const { data: p } = await db.from('partite').select('id').eq('codice', String(b.codice || '').trim().toUpperCase()).single();
    if (!p) return err('Codice partita non trovato.', 404);
    await db.from('membri').upsert({ partita_id: p.id, utente_id: uid }, { onConflict: 'partita_id,utente_id', ignoreDuplicates: true });
    return NextResponse.json({ id: p.id });
  }

  const { data: me } = await db.from('membri').select('ruolo, contrada_id').eq('partita_id', b.partita_id).eq('utente_id', uid).single();
  if (!me) return err('Non fai parte di questa partita.', 403);

  if (b.azione === 'fai_attivita') {
    if (!me.contrada_id) return err('Non hai ancora una Contrada assegnata.', 403);
    const { data: tipo } = await db.from('tipi_attivita').select('*').eq('id', b.tipo_attivita_id).single();
    if (!tipo) return err('Attività non trovata.', 404);

    const costo = Number(b.costo);
    if (!(costo >= Number(tipo.costo_minimo) && costo <= Number(tipo.costo_massimo))) {
      return err(`Scegli un importo tra ${tipo.costo_minimo} e ${tipo.costo_massimo}.`);
    }

    const { data: movs } = await db.from('movimenti_crediti').select('importo').eq('partita_id', b.partita_id).eq('contrada_id', me.contrada_id);
    const saldo = (movs ?? []).reduce((t, m) => t + Number(m.importo), 0);
    if (saldo < costo) return err('Crediti insufficienti per questa attività.');

    const { data: fantino } = await db.from('fantini').select('livello_base').eq('id', b.fantino_id).single();
    const { data: rel } = await db.from('relazioni_contrada_fantino').select('livello').eq('partita_id', b.partita_id).eq('contrada_id', me.contrada_id).eq('fantino_id', b.fantino_id).single();
    const livelloAttuale = rel?.livello ?? fantino?.livello_base ?? 0;

    const costoMin = Number(tipo.costo_minimo);
    const costoMax = Number(tipo.costo_massimo);
    const ampiezza = costoMax - costoMin;
    const proporzione = ampiezza > 0 ? (costo - costoMin) / ampiezza : 1;
    const probabilita = 0.25 + 0.65 * proporzione;
    const successo = Math.random() < probabilita;
    const delta = successo ? Math.max(1, Math.round(tipo.variazione_massima * proporzione)) : 0;
    const nuovoLivello = Math.max(0, Math.min(100, livelloAttuale + delta));

    await Promise.all([
      db.from('movimenti_crediti').insert({ partita_id: b.partita_id, contrada_id: me.contrada_id, importo: -costo, motivo: tipo.nome, tipo: 'spesa_attivita' }),
      db.from('relazioni_contrada_fantino').upsert(
        { partita_id: b.partita_id, contrada_id: me.contrada_id, fantino_id: b.fantino_id, livello: nuovoLivello },
        { onConflict: 'partita_id,contrada_id,fantino_id' }
      ),
      db.from('attivita_svolte').insert({ partita_id: b.partita_id, contrada_id: me.contrada_id, fantino_id: b.fantino_id, tipo_attivita_id: b.tipo_attivita_id }),
    ]);

    return NextResponse.json({ ok: true, successo, delta });
  }

  if (b.azione === 'colloquio_continuita') {
    if (!me.contrada_id) return err('Non hai ancora una Contrada assegnata.', 403);
    const { data: fantino } = await db.from('fantini').select('livello_base').eq('id', b.fantino_id).single();
    const { data: rel } = await db.from('relazioni_contrada_fantino').select('livello').eq('partita_id', b.partita_id).eq('contrada_id', me.contrada_id).eq('fantino_id', b.fantino_id).single();
    const livelloAttuale = rel?.livello ?? fantino?.livello_base ?? 0;
    if (livelloAttuale < SOGLIA_CONTINUITA) return err('Il rapporto non ha ancora raggiunto la soglia per la continuità.');

    await db.from('colloqui_continuita').insert({ partita_id: b.partita_id, contrada_id: me.contrada_id, fantino_id: b.fantino_id });
    return NextResponse.json({ ok: true });
  }

  if (me.ruolo !== 'sindaco') return err('Solo il Sindaco può farlo.', 403);

  if (b.azione === 'membri') {
    const { data } = await db.from('membri')
      .select('utente_id, ruolo, contrada_id, profiles(nome, cognome, username)')
      .eq('partita_id', b.partita_id);
    return NextResponse.json({ membri: data ?? [] });
  }

  if (b.azione === 'assegna') {
    await db.from('membri').update({ ruolo: b.ruolo || null, contrada_id: b.contrada_id || null })
      .eq('partita_id', b.partita_id).eq('utente_id', b.utente_id);
    await db.from('profiles').update({ contrada_id: b.contrada_id || null, ruolo: b.ruolo || 'capitano' }).eq('id', b.utente_id);
    return NextResponse.json({ ok: true });
  }

  if (b.azione === 'elimina') {
    await db.from('partite').delete().eq('id', b.partita_id);
    return NextResponse.json({ ok: true });
  }

  if (b.azione === 'crediti') {
    const importo = Number(b.importo);
    if (!(importo > 0)) return err("L'importo deve essere maggiore di zero.");

    const { error } = await db.from('movimenti_crediti').insert({
      partita_id: b.partita_id,
      contrada_id: b.contrada_id,
      importo,
      motivo: `Aggiunta di ${importo} crediti`,
      tipo: 'assegnazione',
    });

    if (error) return err('Assegnazione non riuscita.', 500);
    return NextResponse.json({ ok: true });
  }

  if (b.azione === 'cambia_fase') {
    const { data: p } = await db.from('partite').select('fase').eq('id', b.partita_id).single();
    const elenco = FASI as readonly string[];
    const i = elenco.indexOf(p?.fase ?? 'inverno');
    if (i === -1 || i >= elenco.length - 1) return err("Non c'è una fase successiva.");
    const { error } = await db.from('partite').update({ fase: elenco[i + 1] }).eq('id', b.partita_id);
    if (error) return err('Cambio fase non riuscita.', 500);
    return NextResponse.json({ ok: true, fase: elenco[i + 1] });
  }

  return err('Azione sconosciuta.');
}