'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import BarraSuperiore from '../../../components/BarraSuperiore';

type Contesto = { nomePartita: string; ruolo: string | null; nomeContrada: string | null } | null;
type RigaMembro = { ruolo: string | null; contrada_id: string | null; contrade: { nome: string } | null };

const estensioniFoto = ['PNG', 'png', 'jpg', 'JPG', 'jpeg'] as const;

const voci = [
  { nome: 'Dashboard Contrada', href: '', icona: '⌂', attiva: true },
  { nome: 'Centro trattative', href: 'trattative', icona: '⚖', attiva: false },
  { nome: 'Cavalli', href: 'cavalli', icona: '🏆', attiva: false },
  { nome: 'Fantini', href: 'fantini', icona: '⛑', attiva: true },
  { nome: 'Museo della Contrada', href: 'museo', icona: '🏛', attiva: false },
  { nome: "Archivio e Albo d'Oro", href: 'archivio', icona: '📜', attiva: false },
];

export default function LayoutPartita({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [aperto, setAperto] = useState(false);
  const [ctx, setCtx] = useState<Contesto>(null);

  const carica = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return;
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('partite').select('nome').eq('id', id).single(),
      supabase.from('membri').select('ruolo, contrada_id, contrade(nome)').eq('partita_id', id).eq('utente_id', s.session.user.id).single(),
    ]);
    const membro = m as unknown as RigaMembro | null;
    setCtx({
      nomePartita: p?.nome ?? '',
      ruolo: membro?.ruolo ?? null,
      nomeContrada: membro?.contrade?.nome ?? null,
    });
  }, [id]);

  useEffect(() => { carica(); }, [carica]);

  useEffect(() => {
    const canale = supabase
      .channel(`layout-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membri', filter: `partita_id=eq.${id}` }, () => carica())
      .subscribe();
    return () => { supabase.removeChannel(canale); };
  }, [id, carica]);

  const etichettaRuolo = ctx?.ruolo === 'mangino' ? 'Mangino' : ctx?.ruolo === 'sindaco' ? 'Sindaco' : ctx?.ruolo === 'capitano' ? 'Capitano' : 'In attesa';

  return (
    <>
      <BarraSuperiore mostraCambiaPartita mostraHamburger onHamburger={() => setAperto((a) => !a)} />
      <div className="layout-partita">
        {aperto && <div className="menu-overlay" onClick={() => setAperto(false)} />}

        <aside className={`menu-laterale${aperto ? ' aperto' : ''}`}>
          <div className="menu-intesta">
            <AvatarContrada nomeContrada={ctx?.nomeContrada ?? null} />
            <div className="menu-info">
              <p className="menu-etichetta">Partita attiva</p>
              <p className="menu-nome">{ctx?.nomePartita || '...'}</p>
              <p className="menu-sotto">
                {etichettaRuolo}{ctx?.ruolo !== 'sindaco' && ctx?.nomeContrada ? ` · ${ctx.nomeContrada}` : ''}
              </p>
            </div>
          </div>

          <nav className="menu-voci">
            {voci.map((v) => {
              const href = `/partita/${id}${v.href ? '/' + v.href : ''}`;
              const attiva = v.href === '' ? pathname === `/partita/${id}` : !!pathname?.startsWith(href);
              return v.attiva ? (
                <Link key={v.nome} href={href} className={`menu-voce${attiva ? ' attiva' : ''}`} onClick={() => setAperto(false)}>
                  <span className="menu-icona">{v.icona}</span>{v.nome}
                </Link>
              ) : (
                <span key={v.nome} className="menu-voce disabilitata" title="In arrivo">
                  <span className="menu-icona">{v.icona}</span>{v.nome}
                </span>
              );
            })}
          </nav>
        </aside>

        <div className="layout-contenuto">{children}</div>
      </div>
    </>
  );
}

function AvatarContrada({ nomeContrada }: { nomeContrada: string | null }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => { setIndice(0); }, [nomeContrada]);

  if (!nomeContrada || indice >= estensioniFoto.length) {
    return <div className="menu-avatar" aria-hidden="true">🐎</div>;
  }

  const slug = nomeContrada.toLowerCase();
  return (
    <img
      className="menu-avatar menu-avatar-foto"
      src={`/contrade/${slug}.${estensioniFoto[indice]}`}
      alt={nomeContrada}
      onError={() => setIndice((i) => i + 1)}
    />
  );
}