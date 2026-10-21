'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

type RigaFantino = { nome: string; vittorie: number; palii: number };
type RigaVittorie = { nome: string; vittorie: number };

const contrade: RigaVittorie[] = [
  { nome: 'Oca', vittorie: 67 },
  { nome: 'Chiocciola', vittorie: 51 },
  { nome: 'Tartuca', vittorie: 50 },
  { nome: 'Torre', vittorie: 45 },
  { nome: 'Valdimontone', vittorie: 45 },
  { nome: 'Nicchio', vittorie: 43 },
  { nome: 'Onda', vittorie: 42 },
  { nome: 'Istrice', vittorie: 41 },
  { nome: 'Selva', vittorie: 40 },
  { nome: 'Drago', vittorie: 39 },
  { nome: 'Lupa', vittorie: 38 },
  { nome: 'Bruco', vittorie: 37 },
  { nome: 'Giraffa', vittorie: 35 },
  { nome: 'Civetta', vittorie: 34 },
  { nome: 'Leocorno', vittorie: 31 },
  { nome: 'Pantera', vittorie: 26 },
  { nome: 'Aquila', vittorie: 25 },
];

const fantini: RigaFantino[] = [
  { nome: 'Tittia', vittorie: 13, palii: 43 },
  { nome: 'Scompiglio', vittorie: 5, palii: 34 },
  { nome: 'Gingillo', vittorie: 4, palii: 36 },
  { nome: 'Brigante', vittorie: 3, palii: 20 },
  { nome: 'Velluto', vittorie: 1, palii: 13 },
  { nome: 'Tempesta', vittorie: 1, palii: 9 },
  { nome: 'Bighino', vittorie: 0, palii: 28 },
  { nome: 'Grandine', vittorie: 0, palii: 16 },
  { nome: 'Girolamo', vittorie: 0, palii: 12 },
  { nome: 'Tremendo', vittorie: 0, palii: 12 },
  { nome: 'Turbine', vittorie: 0, palii: 12 },
  { nome: 'Bellocchio', vittorie: 0, palii: 11 },
  { nome: 'Carburo', vittorie: 0, palii: 9 },
  { nome: 'Amsicora', vittorie: 0, palii: 8 },
  { nome: 'Tamurè', vittorie: 0, palii: 7 },
  { nome: 'Virgola', vittorie: 0, palii: 5 },
  { nome: 'Shardana', vittorie: 0, palii: 2 },
  { nome: 'Spago', vittorie: 0, palii: 2 },
  { nome: 'Tambani', vittorie: 0, palii: 2 },
  { nome: 'Fastidio', vittorie: 0, palii: 1 },
  { nome: 'Granito', vittorie: 0, palii: 1 },
  { nome: 'Lesto', vittorie: 0, palii: 1 },
];

const cavalli: RigaVittorie[] = [
  { nome: 'Zio frac', vittorie: 5 },
  { nome: 'Tale e quale', vittorie: 4 },
  { nome: 'Abbasantesa', vittorie: 3 },
  { nome: 'Ungaros', vittorie: 3 },
  { nome: 'Remorex', vittorie: 2 },
  { nome: 'Schietta', vittorie: 2 },
  { nome: 'Violenta da clodia', vittorie: 2 },
  { nome: 'Viso d’angelo', vittorie: 1 },
  { nome: 'Vitzichesu', vittorie: 1 },
  ...[
    'Akida', 'Anda e bola', 'Antine day', 'Ardeglina', 'Ares elce', 'Arestetulesu', 'Astoriux', 'Baila',
    'Benitos', 'Bolina da clodia', 'Bonitas', 'Brivido sardo', 'Canarinu', 'Cassiox', 'Chiosa vince',
    'Cobalto da clodia', 'Comancio', 'Compilation', 'Criptha', 'Daredevil', 'Dedalo king', 'Demoni',
    'Diamante grigio', 'Diamante sauro', 'Diodoro', 'Diosu de campeda', 'Doctor donald',
    'Dolcecomelanutella', 'Dollaro', 'Don Rodrigo', 'Dorotea dimmonia', 'Eberardo', 'Eccolo', 'Ellenico',
    'Ennalzu', 'Entu de pedra ulpu', 'Erminio baio', 'Eros orotellese', 'Eschilo de aighenta',
    'Esmeralda baia', 'Estrella olianesa', 'Etrinta', 'Euskaldi', 'Fenomenale', 'Gioia pura',
    'Milady bondreamer', 'Reo confesso', 'Solu tue due', 'Tabacco', 'Una per tutti', 'Veranu',
    'Volcan de bonorva', 'Volpino', 'Zenios', 'Zenis', 'Zentile', 'Zentiles', 'Zinias',
  ].map((nome) => ({ nome, vittorie: 0 })),
];

export default function PaginaArchivio() {
  const router = useRouter();
  const [autenticato, setAutenticato] = useState(false);

  useEffect(() => {
    let attivo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!attivo) return;
      if (!data.session) {
        router.replace('/accedi');
        return;
      }
      setAutenticato(true);
    });
    return () => { attivo = false; };
  }, [router]);

  if (!autenticato) return null;

  return (
    <main className="pagina-albo">
      <header className="intesta-albo">
        <p className="albo-sopratitolo">Palmares storico</p>
        <h1>Albo d’Oro della carriera</h1>
        <p>Le vittorie di Contrade, fantini e cavalli.</p>
      </header>

      <div className="griglia-albo">
        <section className="carta-albo" aria-labelledby="albo-contrade">
          <header className="testa-carta-albo">
            <div><span className="albo-numero">01</span><h2 id="albo-contrade">Contrade</h2></div>
            <span className="albo-metrica">Vittorie</span>
          </header>
          <ol className="lista-albo">
            {contrade.map((riga, indice) => (
              <li className={indice < 3 ? 'podio-albo' : ''} key={riga.nome}>
                <span className="posizione-albo">{indice + 1}</span>
                <span className="nome-albo">{riga.nome}</span>
                <strong className="valore-albo">{riga.vittorie}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="carta-albo" aria-labelledby="albo-fantini">
          <header className="testa-carta-albo">
            <div><span className="albo-numero">02</span><h2 id="albo-fantini">Fantini</h2></div>
            <span className="albo-metrica">Vittorie / Palii · %</span>
          </header>
          <ol className="lista-albo">
            {fantini.map((riga, indice) => (
              <li className={indice < 3 ? 'podio-albo' : ''} key={riga.nome}>
                <span className="posizione-albo">{indice + 1}</span>
                <span className="nome-albo">{riga.nome}</span>
                <strong className="valore-albo valore-fantino">
                  {riga.vittorie}/{riga.palii}
                  <small>{riga.palii > 0 ? Math.round((riga.vittorie / riga.palii) * 100) : 0}%</small>
                </strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="carta-albo" aria-labelledby="albo-cavalli">
          <header className="testa-carta-albo">
            <div><span className="albo-numero">03</span><h2 id="albo-cavalli">Cavalli</h2></div>
            <span className="albo-metrica">Vittorie</span>
          </header>
          <ol className="lista-albo">
            {cavalli.map((riga, indice) => (
              <li className={indice < 3 ? 'podio-albo' : ''} key={riga.nome}>
                <span className="posizione-albo">{indice + 1}</span>
                <span className="nome-albo">{riga.nome}</span>
                <strong className="valore-albo">{riga.vittorie}</strong>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
