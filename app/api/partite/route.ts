import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

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

  const { data: me } = await db.from('membri').select('ruolo').eq('partita_id', b.partita_id).eq('utente_id', uid).single();
  if (me?.ruolo !== 'sindaco') return err('Solo il Sindaco può farlo.', 403);

  if (b.azione === 'membri') {
    const { data } = await db.from('membri')
      .select('utente_id, ruolo, contrada_id, profiles(nome, cognome, username)')
      .eq('partita_id', b.partita_id);
    return NextResponse.json({ membri: data ?? [] });
  }

  if (b.azione === 'assegna') {
    await db.from('membri').update({ ruolo: b.ruolo || null, contrada_id: b.contrada_id || null })
      .eq('partita_id', b.partita_id).eq('utente_id', b.utente_id);
    await db.from('profiles').update({ contrada_id: b.contrada_id || null, ruolo: b.ruolo || 'contradaiolo' }).eq('id', b.utente_id);
    return NextResponse.json({ ok: true });
  }

  if (b.azione === 'elimina') { await db.from('partite').delete().eq('id', b.partita_id); return NextResponse.json({ ok: true }); }
  return err('Azione sconosciuta.');
}
