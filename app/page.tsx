'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import FantinoChat from '../components/FantinoChat';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Fantino = { id: string; nome: string; soprannome: string | null };

export default function Home() {
  const [loggato, setLoggato] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [fantino, setFantino] = useState<Fantino | null>(null);

  async function caricaFantino() {
    const { data } = await supabase.from('fantini').select('id, nome, soprannome').limit(1).single();
    if (data) setFantino(data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setLoggato(true);
        caricaFantino();
      }
    });
  }, []);

  async function login() {
    setErrore(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrore('Email o password non corrette. Controlla e riprova.');
      return;
    }
    setLoggato(true);
    caricaFantino();
  }

  async function logout() {
    await supabase.auth.signOut();
    setLoggato(false);
    setFantino(null);
  }

  return (
    <main className="scena">
      <h1 className="titolo">Palio Sim</h1>
      <p className="sottotitolo">Entra nella tua contrada e tratta con i fantini.</p>

      {!loggato ? (
        <div className="carta">
          <input className="campo" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="campo"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
          />
          <button className="bottone" onClick={login}>Entra in contrada</button>
          {errore && <p className="errore">{errore}</p>}
        </div>
      ) : (
        <>
          <button className="bottone-tenue" onClick={logout}>Esci</button>
          {fantino ? (
            <FantinoChat fantinoId={fantino.id} fantinoNome={fantino.nome} fantinoSoprannome={fantino.soprannome ?? undefined} />
          ) : (
            <p className="sottotitolo">Nessun fantino disponibile al momento.</p>
          )}
        </>
      )}
    </main>
  );
}
