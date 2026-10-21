import Link from 'next/link';

const schede = [
  { titolo: 'Gestione della Contrada', testo: 'Budget, dirigenza, cavallo e fantino: ogni scelta pesa sul Palio.', icona: 'contrada' },
  { titolo: 'Trattative con i fantini', testo: 'Offerte, rilanci e contratti riservati con un motore di regole deterministico.', icona: 'trattative' },
  { titolo: 'Rivalità', testo: 'Le rivalità storiche condizionano accordi, partiti e strategie di piazza.', icona: 'rivalita' },
  { titolo: 'Storia della carriera', testo: 'Archivio dei Palii, Albo d’Oro e statistiche di Contrade, fantini e cavalli.', icona: 'storia' },
];

export default function Home() {
  return (
    <>
      <header className="barra-alta">
        <span className="marchio">Il Gioco del Palio</span>
        <nav>
          <Link href="/accedi" className="pillola">Entra</Link>
        </nav>
      </header>
      <main className="eroe">
        <p className="sopra">Siena</p>
        <h1>Il Palio d&apos;Inverno</h1>
        <p className="motto">Strategia. Rivalità. Gloria.</p>
        <p className="testo">
          Una carriera senza fine nel Palio di Siena: guida una delle diciassette Contrade, tratta con i fantini, gestisci l&apos;economia, scegli il momento giusto per il partito e conquista il drappellone. Ogni Palio è una partita autonoma, ogni annata scrive la tua storia.
        </p>
        <div className="azioni">
          <Link href="/accedi?m=registrati" className="btn">Entra nella partita</Link>
          <Link href="/accedi" className="btn btn-vuoto">Carica una partita</Link>
        </div>
      </main>
      <section className="schede">
        {schede.map((scheda) => (
          <article key={scheda.titolo} className="scheda">
            <svg className="scheda-icona" viewBox="0 0 24 24" aria-hidden="true">
              {scheda.icona === 'contrada' && <path d="M12 3 20 6v5c0 5-3.5 8.2-8 10-4.5-1.8-8-5-8-10V6l8-3Z" />}
              {scheda.icona === 'trattative' && <path d="M4 7h16M6 7l-2 6a3 3 0 0 0 6 0L8 7m8 0-2 6a3 3 0 0 0 6 0l-2-6M12 7v12m-4 0h8M9 4h6" />}
              {scheda.icona === 'rivalita' && <path d="m7 3 14 14M17 3 3 17m8-8 2 2m-8 8 2-2m8-8 2 2M5 5l2-2m12 12 2-2" />}
              {scheda.icona === 'storia' && <path d="M7 3h10v4a5 5 0 0 1-10 0V3Zm5 9v4m-4 5h8m-4-5a5 5 0 0 0-5 5m5-5a5 5 0 0 1 5 5M7 5H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4" />}
            </svg>
            <h3>{scheda.titolo}</h3>
            <p>{scheda.testo}</p>
          </article>
        ))}
      </section>
      <footer className="pie-pagina">Il Gioco del Palio — progetto ludico non ufficiale. © 2026</footer>
    </>
  );
}
