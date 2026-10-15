'use client';

import { useState, useEffect } from 'react';

const estensioni = ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG'] as const;

export default function FotoFantino({ nome, foto }: { nome: string; foto: string | null }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => { setIndice(0); }, [foto]);

  if (!foto) return <div className="avatar" aria-hidden="true">{nome.charAt(0)}</div>;

  const conEstensione = foto.includes('.');
  if (conEstensione ? indice > 0 : indice >= estensioni.length) {
    return <div className="avatar" aria-hidden="true">{nome.charAt(0)}</div>;
  }

  const file = conEstensione ? foto : `${foto}.${estensioni[indice]}`;
  return <img className="avatar-foto" src={`/fantini/${file}`} alt={nome} onError={() => setIndice((i) => i + 1)} />;
}