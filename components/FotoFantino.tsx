'use client';

import { useState } from 'react';

export default function FotoFantino({ nome, foto }: { nome: string; foto: string | null }) {
  const [fotoFallita, setFotoFallita] = useState<string | null>(null);
  if (!foto) return <div className="avatar" aria-hidden="true">{nome.charAt(0)}</div>;

  const base = foto.replace(/\.[^.]+$/, '');
  const src = `/fantini/${base}.jpg`;
  if (fotoFallita === src) return <div className="avatar" aria-hidden="true">{nome.charAt(0)}</div>;

  return (
    <img
      className="avatar-foto"
      src={src}
      alt={nome}
      onError={() => setFotoFallita(src)}
    />
  );
}