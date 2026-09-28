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
      setErrore('Email o password non corrette.');
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
    <main style={{ maxWidth: 460, margin: '40px auto', padding: '0 16px', fontFamily: 'Georgia, serif' }}>
      <h1 style={{ marginBottom: 24 }}>Palio Sim</h1>

      {!loggato ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, border: '1px solid #999', borderRadius: 4 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            style={{ padding: 10, border: '1px solid #999', borderRadius: 4 }}
          />
          <button onClick={login} style={{ padding: 10, cursor: 'pointer' }}>Accedi</button>
          {errore && <p style={{ color: '#8a3324' }}>{errore}</p>}
        </div>
      ) : (
        <>
          <button onClick={logout} style={{ marginBottom: 16, cursor: 'pointer' }}>Esci</button>
          {fantino ? (
            <FantinoChat
              fantinoId={fantino.id}
              fantinoNome={fantino.nome}
              fantinoSoprannome={fantino.soprannome ?? undefined}
            />
          ) : (
            <p>Nessun fantino trovato.</p>
          )}
        </>
      )}
    </main>
  );
}
