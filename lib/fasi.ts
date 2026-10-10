export const FASI = ['inverno', 'tratta1', 'estrazione', 'tratta2'] as const;
export type Fase = (typeof FASI)[number];

export const INFO_FASI: Record<Fase, { nome: string; sotto: string; disponibile: string }> = {
  inverno: { nome: 'Inverno', sotto: 'Rapporti con i fantini', disponibile: 'Disponibile: fantini e attività' },
  tratta1: { nome: 'Tratta, fase 1', sotto: 'Discussione sui cavalli', disponibile: 'Disponibile: cavalli e discussione' },
  estrazione: { nome: 'Estrazione', sotto: 'Sorteggio dei cavalli', disponibile: 'Sorteggio dei cavalli in corso' },
  tratta2: { nome: 'Tratta, fase 2', sotto: 'Contrattazione dei fantini', disponibile: 'Disponibile: centro trattative' },
};

export function comeFase(valore: string | null | undefined): Fase {
  return (FASI as readonly string[]).includes(valore ?? '') ? (valore as Fase) : 'inverno';
}