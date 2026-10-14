'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAggiorna } from '../lib/useAggiorna';

type Notifica = {
  id: number;
  partita_id: string | null;
  tipo: string;
  titolo: string;
  testo: string | null;
  letta: boolean;
  creato_il: string;
  partite: { nome: string } | null;
};

function quandoFa(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'adesso';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min fa`;
  const ore = Math.floor(min / 60);
  if (ore < 24) return `${ore} h fa`;
  const giorni = Math.floor(ore / 24);
  return giorni === 1 ? 'ieri' : `${giorni} giorni fa`;
}

function destinazione(n: Notifica) {
  if (!n.partita_id) return null;
  if (n.tipo === 'iniziativa' || n.tipo === 'continuita') return `/partita/${n.partita_id}/fantini`;
  if (n.tipo === 'promessa' || n.tipo === 'accordo') return `/partita/${n.partita_id}/trattative`;
  return `/partita/${n.partita_id}`;
}

export default function BarraSuperiore({
  mostraCambiaPartita = false,
  mostraHamburger = false,
  onHamburger,
}: {
  mostraCambiaPartita?: boolean;
  mostraHamburger?: boolean;
  onHamburger?: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);
  const [aperto, setAperto] = useState(false);
  const rif = useRef<HTMLDivElement>(null);

  const caricaNotifiche = useCallback(async (utente: string) => {
    const { data } = await supabase
      .from('notifiche')
      .select('id, partita_id, tipo, titolo, testo, letta, creato_il, partite(nome)')
      .eq('utente_id', utente)
      .order('creato_il', { ascending: false })
      .limit(30);
    setNotifiche((data ?? []) as unknown as Notifica[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return;
      const id = s.session.user.id;
      setUid(id);
      const { data: p } = await supabase.from('profiles').select('nome, cognome').eq('id', id).single();
      if (p) setNome(`${p.nome ?? ''} ${p.cognome ?? ''}`.trim());
      caricaNotifiche(id);
    })();
  }, [caricaNotifiche]);

  useAggiorna(() => { if (uid) caricaNotifiche(uid); }, 20000);

  useEffect(() => {
    if (!uid) return;
    const canale = supabase
      .channel(`notifiche-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifiche', filter: `utente_id=eq.${uid}` }, () => caricaNotifiche(uid))
      .subscribe();
    return () => { supabase.removeChannel(canale); };
  }, [uid, caricaNotifiche]);

  useEffect(() => {
    if (!aperto) return;
    function fuori(e: MouseEvent | TouchEvent) {
      if (rif.current && !rif.current.contains(e.target as Node)) setAperto(false);
    }
    function tasto(e: KeyboardEvent) {
      if (e.key === 'Escape') setAperto(false);
    }
    document.addEventListener('mousedown', fuori);
    document.addEventListener('touchstart', fuori);
    document.addEventListener('keydown', tasto);
    return () => {
      document.removeEventListener('mousedown', fuori);
      document.removeEventListener('touchstart', fuori);
      document.removeEventListener('keydown', tasto);
    };
  }, [aperto]);

  async function segnaLette(ids: number[]) {
    if (ids.length === 0) return;
    setNotifiche((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, letta: true } : n)));
    await supabase.from('notifiche').update({ letta: true }).in('id', ids);
  }

  function apri(n: Notifica) {
    if (!n.letta) segnaLette([n.id]);
    const dest = destinazione(n);
    setAperto(false);
    if (dest) router.push(dest);
  }

  async function esci() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const nonLette = notifiche.filter((n) => !n.letta).length;

  return (
    <header className="barra-superiore">
      <div className="barra-superiore-sx">
        {mostraHamburger && (
          <button className="bs-hamburger" onClick={onHamburger} aria-label="Apri/chiudi menu">☰</button>
        )}
        <Link href="/partite" className="bs-logo">Il Gioco del Palio</Link>
      </div>
      <div className="barra-superiore-dx">
        {mostraCambiaPartita && (
          <Link href="/partite" className="bs-link bs-cambia">⇄ Cambia partita</Link>
        )}

        <div className="bs-notifiche" ref={rif}>
          <button
            className="bs-icona"
            aria-label={nonLette > 0 ? `Notifiche, ${nonLette} non lette` : 'Notifiche'}
            aria-expanded={aperto}
            onClick={() => setAperto((a) => !a)}
          >
            🔔
            {nonLette > 0 && <span className="bs-badge">{nonLette > 9 ? '9+' : nonLette}</span>}
          </button>

          {aperto && (
            <div className="bs-pannello" role="dialog" aria-label="Notifiche">
              <div className="bs-pannello-testa">
                <strong>Notifiche</strong>
                {nonLette > 0 && (
                  <button className="bs-segna" onClick={() => segnaLette(notifiche.filter((n) => !n.letta).map((n) => n.id))}>
                    Segna tutte come lette
                  </button>
                )}
              </div>
              <div className="bs-pannello-lista">
                {notifiche.length === 0 && <p className="bs-vuoto">Nessuna notifica.</p>}
                {notifiche.map((n) => (
                  <button key={n.id} className={`bs-notifica${n.letta ? '' : ' nuova'}`} onClick={() => apri(n)}>
                    <span className="bs-notifica-titolo">{n.titolo}</span>
                    {n.testo && <span className="bs-notifica-testo">{n.testo}</span>}
                    <span className="bs-notifica-meta">{n.partite?.nome ? `${n.partite.nome} · ` : ''}{quandoFa(n.creato_il)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {nome && <span className="bs-utente">👤 {nome}</span>}
        <button className="bs-link bs-esci" onClick={esci}>⇥ Esci</button>
      </div>
    </header>
  );
}