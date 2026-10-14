'use client';

import { useEffect, useRef } from 'react';

// Richiama la funzione a intervalli regolari e ogni volta che la pagina torna visibile,
// così il sito si aggiorna anche quando la connessione in tempo reale non funziona.
export function useAggiorna(funzione: () => void, ogniMs = 15000) {
  const rif = useRef(funzione);

  useEffect(() => {
    rif.current = funzione;
  });

  useEffect(() => {
    const esegui = () => {
      if (document.visibilityState === 'visible') rif.current();
    };
    const timer = setInterval(esegui, ogniMs);
    document.addEventListener('visibilitychange', esegui);
    window.addEventListener('focus', esegui);
    window.addEventListener('online', esegui);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', esegui);
      window.removeEventListener('focus', esegui);
      window.removeEventListener('online', esegui);
    };
  }, [ogniMs]);
}