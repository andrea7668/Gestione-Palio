'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

const mail = (u: string) => u.trim().toLowerCase() + '@giocodelpalio.it';

export default function Accedi() {
  const router = useRouter();
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({ nome: '', cognome: '', username: '', password: '', conferma: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setReg(window.location.search.includes('registrati')); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function invia() {
    setErr(null);
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(f.username.trim())) return setErr('Nome utente: 3-30 caratteri tra lettere, numeri, punto, trattino o underscore.');
    if (f.password.length < 6) return setErr('La password deve avere almeno 6 caratteri.');
    if (reg && f.password !== f.conferma) return setErr('Le password non coincidono.');
    setBusy(true);
    const email = mail(f.username);
    const { error } = reg
      ? await supabase.auth.signUp({ email, password: f.password, options: { data: { nome: f.nome, cognome: f.cognome, username: f.username.trim().toLowerCase() } } })
      : await supabase.auth.signInWithPassword({ email, password: f.password });
    setBusy(false);
    if (error) return setErr(reg ? 'Registrazione non riuscita: forse il nome utente è già in uso.' : 'Nome utente o password non corretti.');
    router.push('/partite');
  }

  return (
    <main className="centro">
      <div className="carta">
        <h2>{reg ? 'Crea il tuo account' : 'Accedi'}</h2>
        <p className="aiuto">{reg ? 'Registrati, poi inserisci il codice PALIO ricevuto dal Sindaco per entrare nella partita.' : 'Entra con il tuo nome utente e la tua password.'}</p>
        {reg && (<>
          <label>Nome<input className="campo" value={f.nome} onChange={set('nome')} /></label>
          <label>Cognome<input className="campo" value={f.cognome} onChange={set('cognome')} /></label>
        </>)}
        <label>Nome utente<input className="campo" value={f.username} onChange={set('username')} /></label>
        <label>Password<input className="campo" type="password" value={f.password} onChange={set('password')} /></label>
        {reg && <label>Conferma password<input className="campo" type="password" value={f.conferma} onChange={set('conferma')} /></label>}
        {err && <p className="errore">{err}</p>}
        <button className="btn" onClick={invia} disabled={busy}>{reg ? 'Registrati' : 'Entra'}</button>
        <p className="aiuto centrato">
          {reg ? 'Hai già un account? ' : 'Non hai un account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setReg(!reg); setErr(null); }}>{reg ? 'Accedi' : 'Registrati'}</a>
        </p>
        <Link href="/" className="aiuto centrato">Torna alla home</Link>
      </div>
    </main>
  );
}
