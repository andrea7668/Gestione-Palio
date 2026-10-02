'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return;
      const { data: p } = await supabase.from('profiles').select('nome, cognome').eq('id', s.session.user.id).single();
      if (p) setNome(`${p.nome ?? ''} ${p.cognome ?? ''}`.trim());
    })();
  }, []);

  async function esci() {
    await supabase.auth.signOut();
    router.push('/');
  }

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
        <button className="bs-icona" aria-label="Notifiche">🔔</button>
        {nome && <span className="bs-utente">👤 {nome}</span>}
        <button className="bs-link bs-esci" onClick={esci}>⇥ Esci</button>
      </div>
    </header>
  );
}