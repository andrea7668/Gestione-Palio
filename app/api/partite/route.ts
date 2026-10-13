import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FASI, INFO_FASI, comeFase } from '../../../lib/fasi';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const SOGLIA_CONTINUITA = 60;

async function notifica(partitaId: string, destinatari: string[], tipo: string, titolo: string, testo?: string) {
  const unici = Array.from(new Set(destinatari.filter(Boolean)));
  if (unici.length === 0) return;
  await db.from('notifiche').insert(
    unici.map((utente_id) => ({ partita_id: partitaId, utente_id, tipo, titolo, testo: testo ?? null }))
  );
}

async function evento(partitaId: string, contradaId: string | null, tipo: string, titolo: string, testo?: string) {
  await db.from('eventi').insert({ partita_id: partitaId, contrada_id: contradaId, tipo, titolo, testo: testo ?? null });
}

async function nomeUtente(id: string) {
  const { data } = await db.from('profiles').select('nome, cognome').eq('id', id).single();
  const nome = `${data?.nome ?? ''} ${data?.cognome ?? ''}`.trim();
  return nome || 'Un giocatore';
}

const etichettaRuolo = (r: string | null) =>
  r === 'mangino' ? 'Mangino' : r === 'capitano' ? 'Capitano' : r === 'sindaco' ? 'Sindaco' : 'In attesa';

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

    const { data: gia } = await db.from('membri').select('utente_id').eq('partita_id', p.id).eq('utente_id', uid).maybeSingle();
    if (!gia) {
      await db.from('membri').insert({ partita_id: p.id, utente_id: uid });
      const { data: sindaci } = await db.from('membri').select('utente_id').eq('partita_id', p.id).eq('ruolo', 'sindaco');
      const nome = await nomeUtente(uid);
      await notifica(p.id, (sindaci ?? []).map((s) => s.utente_id), 'nuovo_giocatore', `${nome} è entrato nella partita`, 'In attesa di ruolo e Contrada.');
    }
    return NextResponse.json({ id: p.id });
  }

  const { data: me } = await db.from('membri').select('ruolo, contrada_id').eq('partita_id', b.partita_id).eq('utente_id', uid).single();
  if (!me) return err('Non fai parte di questa partita.', 403);

  if (b.azione === 'chat_contrada') {
    if (!me.contrada_id) return err('Non hai ancora una Contrada assegnata.', 403);
    const testo = String(b.testo ?? '').trim().slice(0, 500);
    if (!testo) return err('Scrivi un messaggio.');

    const { count } = await db.from('chat_contrada')
      .select('id', { count: 'exact', head: true })
      .eq('utente_id', uid)
      .gte('creato_il', new Date(Date.now() - 60000).toISOString());
    if ((count ?? 0) >= 20) return err('Stai scrivendo troppo in fretta: aspetta un momento.', 429);

    const nome = await nomeUtente(uid);
    const { error } = await db.from('chat_contrada').insert({
      partita_id: b.partita_id, contrada_id: me.contrada_id, utente_id: uid, autore_nome: nome, contenuto: testo,
    });
    if (error) return err('Messaggio non inviato.', 500);
    return NextResponse.json({ ok: true });
  }

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

    const { data: fantino } = await db.from('fantini').select('livello_base, nome, soprannome').eq('id', b.fantino_id).single();
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

    const { data: compagni } = await db.from('membri').select('utente_id').eq('partita_id', b.partita_id).eq('contrada_id', me.contrada_id).neq('utente_id', uid);
    const nome = await nomeUtente(uid);
    const nomeFantino = fantino?.soprannome ?? fantino?.nome ?? 'un fantino';
    const esito = successo ? `rapporto +${delta}` : 'nessun cambiamento';
    await notifica(
      b.partita_id,
      (compagni ?? []).map((c) => c.utente_id),
      'iniziativa',
      `${nome} ha fatto un'iniziativa`,
      `${tipo.nome} con ${nomeFantino}, ${costo} crediti: ${esito}.`
    );
    await evento(b.partita_id, me.contrada_id, 'iniziativa', `${nome}: ${tipo.nome} con ${nomeFantino}`, `${costo} crediti · ${esito}`);

    return NextResponse.json({ ok: true, successo, delta });
  }

  if (b.azione === 'colloquio_continuita') {
    if (!me.contrada_id) return err('Non hai ancora una Contrada assegnata.', 403);
    const { data: fantino } = await db.from('fantini').select('livello_base, nome, soprannome').eq('id', b.fantino_id).single();
    const { data: rel } = await db.from('relazioni_contrada_fantino').select('livello').eq('partita_id', b.partita_id).eq('contrada_id', me.contrada_id).eq('fantino_id', b.fantino_id).single();
    const livelloAttuale = rel?.livello ?? fantino?.livello_base ?? 0;
    if (livelloAttuale < SOGLIA_CONTINUITA) return err('Il rapporto non ha ancora raggiunto la soglia per la continuità.');

    await db.from('colloqui_continuita').insert({ partita_id: b.partita_id, contrada_id: me.contrada_id, fantino_id: b.fantino_id });

    const { data: compagni } = await db.from('membri').select('utente_id').eq('partita_id', b.partita_id).eq('contrada_id', me.contrada_id).neq('utente_id', uid);
    const nome = await nomeUtente(uid);
    const nomeFantino = fantino?.soprannome ?? fantino?.nome ?? 'un fantino';
    await notifica(b.partita_id, (compagni ?? []).map((c) => c.utente_id), 'continuita', `${nome} ha fatto un colloquio di continuità`, `Con ${nomeFantino}.`);
    await evento(b.partita_id, me.contrada_id, 'continuita', `${nome}: colloquio di continuità`, `Con ${nomeFantino}.`);

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
    const nuovoRuolo: string | null = b.ruolo || null;
    const nuovaContrada: string | null = b.contrada_id || null;
    const { data: prima } = await db.from('membri').select('ruolo, contrada_id').eq('partita_id', b.partita_id).eq('utente_id', b.utente_id).maybeSingle();

    await db.from('membri').update({ ruolo: nuovoRuolo, contrada_id: nuovaContrada })
      .eq('partita_id', b.partita_id).eq('utente_id', b.utente_id);
    await db.from('profiles').update({ contrada_id: nuovaContrada, ruolo: nuovoRuolo || 'capitano' }).eq('id', b.utente_id);

    if ((prima?.ruolo ?? null) !== nuovoRuolo || (prima?.contrada_id ?? null) !== nuovaContrada) {
      let nomeContrada = '';
      if (nuovaContrada) {
        const { data: c } = await db.from('contrade').select('nome').eq('id', nuovaContrada).single();
        nomeContrada = c?.nome ?? '';
      }
      await notifica(b.partita_id, [b.utente_id], 'ruolo', 'Il Sindaco ti ha assegnato un ruolo', `${etichettaRuolo(nuovoRuolo)}${nomeContrada ? ` · ${nomeContrada}` : ''}.`);
      if (nuovaContrada) {
        const nomeGiocatore = await nomeUtente(b.utente_id);
        await evento(b.partita_id, nuovaContrada, 'ruolo', `${nomeGiocatore}: ${etichettaRuolo(nuovoRuolo)}`, nomeContrada ? `Contrada ${nomeContrada}.` : undefined);
      }
    }
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

    const { data: giocatori } = await db.from('membri').select('utente_id').eq('partita_id', b.partita_id).eq('contrada_id', b.contrada_id);
    await notifica(b.partita_id, (giocatori ?? []).map((g) => g.utente_id), 'crediti', 'La tua Contrada ha ricevuto crediti', `Il Sindaco ha assegnato ${importo} crediti.`);
    await evento(b.partita_id, b.contrada_id, 'crediti', `${importo} crediti assegnati`, 'Assegnazione del Sindaco.');

    return NextResponse.json({ ok: true });
  }

  if (b.azione === 'cambia_fase') {
    const { data: p } = await db.from('partite').select('fase').eq('id', b.partita_id).single();
    const elenco = FASI as readonly string[];
    const i = Math.max(0, elenco.indexOf(p?.fase ?? 'inverno'));
    const prossima = elenco[(i + 1) % elenco.length];
    const { error } = await db.from('partite').update({ fase: prossima }).eq('id', b.partita_id);
    if (error) return err('Cambio fase non riuscito.', 500);

    const { data: altri } = await db.from('membri').select('utente_id').eq('partita_id', b.partita_id).neq('utente_id', uid);
    const info = INFO_FASI[comeFase(prossima)];
    await notifica(b.partita_id, (altri ?? []).map((m) => m.utente_id), 'fase', `Nuova fase: ${info.nome}`, info.disponibile);
    await evento(b.partita_id, null, 'fase', `Nuova fase: ${info.nome}`, info.disponibile);

    return NextResponse.json({ ok: true, fase: prossima });
  }

  return err('Azione sconosciuta.');
}