'use client';

import { useEffect, useRef } from 'react';

// Richiama la funzione a intervalli regolari e ogni volta che la pagina torna visibile,
// così il sito si aggiorna anche quando la connessione in tempo reale non funziona.
export function useAggiorna(
  funzione: () => void,
  ogniMs = 15000,
  { realtimeAttivo = false }: { realtimeAttivo?: boolean } = {},
) {
  const rif = useRef(funzione);
  const ultimoAggiornamento = useRef(0);
  const giri = useRef(0);

  useEffect(() => {
    rif.current = funzione;
  });

  useEffect(() => {
    const esegui = (daTimer = false) => {
      if (document.visibilityState !== 'visible') return;
      if (daTimer && realtimeAttivo && ++giri.current % 4 !== 0) return;

      const ora = Date.now();
      if (ora - ultimoAggiornamento.current < 3000) return;
      ultimoAggiornamento.current = ora;
      rif.current();
    };
    const timer = setInterval(() => esegui(true), ogniMs);
    const alRitorno = () => esegui();
    document.addEventListener('visibilitychange', alRitorno);
    window.addEventListener('focus', alRitorno);
    window.addEventListener('online', alRitorno);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alRitorno);
      window.removeEventListener('focus', alRitorno);
      window.removeEventListener('online', alRitorno);
    };
  }, [ogniMs, realtimeAttivo]);
}