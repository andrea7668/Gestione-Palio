'use client';

import { useState } from 'react';

export default function FotoFantino({ nome, foto }: { nome: string; foto: string | null }) {
  const [rotta, setRotta] = useState(false);

  if (!foto || rotta) {
    return <div className="avatar" aria-hidden="true">{nome.charAt(0)}</div>;
  }

  return <img className="avatar-foto" src={`/fantini/${foto}`} alt={nome} onError={() => setRotta(true)} />;
}