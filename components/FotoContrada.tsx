'use client';

import { useState, useEffect } from 'react';

const estensioni = ['PNG', 'png', 'jpg', 'JPG', 'jpeg'] as const;

export default function FotoContrada({ nome }: { nome: string | null }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => { setIndice(0); }, [nome]);

  if (!nome || indice >= estensioni.length) {
    return <div className="foto-contrada foto-contrada-vuota" aria-hidden="true">🐎</div>;
  }

  return (
    <img
      className="foto-contrada"
      src={`/contrade/${nome.toLowerCase()}.${estensioni[indice]}`}
      alt={nome}
      onError={() => setIndice((i) => i + 1)}
    />
  );
}