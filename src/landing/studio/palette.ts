// Los colores y acabados del estudio de color. Nombres genéricos a propósito: ninguno es el nombre
// comercial de una marca (el color real se iguala al código de pintura del carro, y eso dice la sección).

import type { LandingLanguage } from '../strings';

export type Finish = 'gloss' | 'metallic' | 'pearl' | 'matte';

export const FINISH_ORDER: Finish[] = ['gloss', 'metallic', 'pearl', 'matte'];

/** Cómo se ve cada acabado bajo el barniz. `flakes` escala el mapa de hojuelas metálicas del modelo. */
export const FINISHES: Record<Finish, { metalness: number; roughness: number; clearcoat: number; flakes: number }> = {
  gloss: { metalness: 0.05, roughness: 0.32, clearcoat: 1, flakes: 0 },
  metallic: { metalness: 0.72, roughness: 0.36, clearcoat: 1, flakes: 1 },
  pearl: { metalness: 0.38, roughness: 0.24, clearcoat: 1, flakes: 0.45 },
  matte: { metalness: 0.12, roughness: 0.7, clearcoat: 0, flakes: 0.15 },
};

export interface PaintColor {
  id: string;
  hex: string;
  name: Record<LandingLanguage, string>;
}

export const PAINT_COLORS: PaintColor[] = [
  { id: 'gold', hex: '#ffcf1f', name: { en: 'Restorify gold', es: 'Oro Restorify' } },
  { id: 'black', hex: '#0b0c0e', name: { en: 'Jet black', es: 'Negro azabache' } },
  { id: 'white', hex: '#ecebe6', name: { en: 'Pearl white', es: 'Blanco perla' } },
  { id: 'silver', hex: '#aeb2b8', name: { en: 'Liquid silver', es: 'Plata líquida' } },
  { id: 'cement', hex: '#7c8085', name: { en: 'Cement gray', es: 'Gris cemento' } },
  { id: 'red', hex: '#b5121b', name: { en: 'Race red', es: 'Rojo carrera' } },
  { id: 'blue', hex: '#14295a', name: { en: 'Midnight blue', es: 'Azul medianoche' } },
  { id: 'green', hex: '#0f3d2b', name: { en: 'Racing green', es: 'Verde carreras' } },
  { id: 'orange', hex: '#e25a1c', name: { en: 'Sunset orange', es: 'Naranja atardecer' } },
  { id: 'purple', hex: '#4a2a7a', name: { en: 'Royal purple', es: 'Morado real' } },
];
