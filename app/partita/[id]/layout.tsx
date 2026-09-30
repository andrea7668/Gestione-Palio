'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

type Contesto = { nomePartita: string; ruolo: string | null; nomeContrada: string | null } | null;
type RigaMembro = { ruolo: string | null; contrada_id: string | null; contrade: { nome: string } | null };

const voci = [
  { nome: 'Dashboard Contrada', href: '', icona: '⌂', attiva: true },
  { nome: 'Centro trattative', href: 'trattative', icona: '⚖', attiva: false },
  { nome: 'Cavalli', href: 'cavalli', icona: '🏆', attiva: false },
  { nome: 'Fantini', href: 'fantini', icona: '⛑', attiva: false },
  { nome: 'Museo della Contrada', href: 'museo', icona: '🏛', attiva: false },
  { nome: "Archivio e Albo d'Oro", href: 'archivio', icona: '📜', attiva: false },
];

export default function LayoutPartita({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [aperto, setAperto] = useState(true);
  const [ctx, setCtx] = useState<Contesto>(null);

  useEffect(() => {
    (async () => {
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
    })();
  }, [id]);

  const etichettaRuolo = ctx?.ruolo === 'mangino' ? 'Mangino' : ctx?.ruolo === 'sindaco' ? 'Sindaco' : ctx?.ruolo === 'capitano' ? 'Capitano' : 'In attesa';

  return (
    <div className={`layout-partita${aperto ? '' : ' chiuso'}`}>
      <aside className="menu-laterale">
        <div className="menu-intesta">
          <div className="menu-avatar" aria-hidden="true">🐎</div>
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
              <Link key={v.nome} href={href} className={`menu-voce${attiva ? ' attiva' : ''}`}>
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

      <button className="menu-freccia" onClick={() => setAperto((a) => !a)} aria-label={aperto ? 'Comprimi menu' : 'Espandi menu'}>
        {aperto ? '‹' : '›'}
      </button>

      <div className="layout-contenuto">{children}</div>
    </div>
  );
}