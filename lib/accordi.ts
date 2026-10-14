export const TIPI_ACCORDO = [
  { chiave: 'interesse', nome: 'Interesse', descrizione: 'disponibilità a risentirsi.', soglia: 20 },
  { chiave: 'intesa', nome: 'Intesa', descrizione: 'condizioni più favorevoli nel pre-Palio.', soglia: 40 },
  { chiave: 'priorita', nome: 'Priorità', descrizione: 'corsia preferenziale e maggiore pazienza.', soglia: 60 },
  { chiave: 'impegno', nome: 'Impegno verbale', descrizione: 'il fantino ti cercherà per primo se scatta la condizione.', soglia: 80 },
] as const;

export type TipoAccordo = (typeof TIPI_ACCORDO)[number]['chiave'];

export const nomeAccordo = (chiave: string) => TIPI_ACCORDO.find((t) => t.chiave === chiave)?.nome ?? chiave;
export const ordineAccordo = (chiave: string) => TIPI_ACCORDO.findIndex((t) => t.chiave === chiave);

export function etichettaRapporto(l: number) {
  if (l < 20) return 'Diffidente';
  if (l < 50) return 'Cauto';
  if (l < 80) return 'Cordiale';
  return 'Fedele';
}