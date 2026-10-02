import Link from 'next/link';

const schede = [
  ['Gestione della Contrada', 'Crediti, rapporti e scelte: ogni decisione pesa sul Palio.'],
  ['Trattative con i fantini', 'Parla con ogni fantino e conquista la sua fiducia.'],
  ['Rivalità', 'Le rivalità storiche condizionano accordi e strategie.'],
  ['Storia della carriera', 'Le annate di ogni Contrada, Palio dopo Palio.'],
];

export default function Home() {
  return (
    <>
      <header className="barra-alta">
        <span className="marchio">Il Gioco del Palio</span>
        <nav>
          <Link href="/accedi?m=registrati">Nuova partita</Link>
          <Link href="/accedi" className="pillola">Entra</Link>
        </nav>
      </header>
      <main className="eroe">
        <p className="sopra">Siena</p>
        <h1>Il Palio d&apos;Inverno</h1>
        <p className="motto">Strategia. Rivalità. Gloria.</p>
        <p className="testo">
          Guida una delle dieci Contrade che corrono il Palio: parla con i fantini durante l&apos;inverno, tratta alla Tratta,
          affronta l&apos;estrazione dei cavalli e conquista il drappellone.
        </p>
        <div className="azioni">
          <Link href="/accedi?m=registrati" className="btn">Entra nella partita</Link>
          <Link href="/accedi" className="btn btn-vuoto">Carica una partita</Link>
        </div>
      </main>
      <section className="schede">
        {schede.map(([t, d]) => (
          <article key={t} className="scheda"><h3>{t}</h3><p>{d}</p></article>
        ))}
      </section>
    </>
  );
}
