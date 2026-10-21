export const FASI = ['inverno', 'tratta1', 'estrazione', 'tratta2'] as const;
export type Fase = (typeof FASI)[number];

export const INFO_FASI: Record<Fase, { nome: string; sotto: string; disponibile: string }> = {
  inverno: { nome: 'Inverno', sotto: 'Rapporti con i fantini', disponibile: 'Disponibile: fantini e attività' },
  tratta1: { nome: 'Tratta, fase 1', sotto: 'Discussione sui cavalli', disponibile: 'Disponibile: centro trattative e colloqui con i fantini' },
  estrazione: { nome: 'Estrazione', sotto: 'Sorteggio dei cavalli', disponibile: 'Sorteggio dei cavalli in corso' },
  tratta2: { nome: 'Tratta, fase 2', sotto: 'Contrattazione dei fantini', disponibile: 'Disponibile: centro trattative' },
};

// Cosa si apre in ogni fase: cambia questi elenchi per cambiare le regole
export const FASI_CON_TRATTATIVE: readonly Fase[] = ['tratta1', 'tratta2'];  // Centro trattative attivo
export const FASI_CON_ACCORDI: readonly Fase[] = ['tratta1'];                // i fantini possono concedere accordi
export const FASI_RAPPORTO_DIRETTO: readonly Fase[] = ['inverno'];           // la chat può cambiare il rapporto
export const SOGLIA_RAPPORTO_RIVALE_INVERNO = 70;
export const SOGLIA_CONTINUITA = 35;

export function comeFase(valore: string | null | undefined): Fase {
  return (FASI as readonly string[]).includes(valore ?? '') ? (valore as Fase) : 'inverno';
}