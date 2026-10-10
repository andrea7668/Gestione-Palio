'use client';

import { createContext, useContext } from 'react';
import type { Fase } from './fasi';

type ContestoFase = { fase: Fase | null; ricarica: () => void };

export const FaseContext = createContext<ContestoFase>({ fase: null, ricarica: () => {} });
export const useFase = () => useContext(FaseContext);