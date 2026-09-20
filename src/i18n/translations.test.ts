// Paridad entre los dos idiomas.
//
// `Translations` es una firma de índice (`[key: string]: string | Translations`), así que
// TypeScript no compara los dos árboles: una clave que existe en español y no en inglés
// compila sin una queja. Y `getTranslation` devuelve **la clave** cuando no encuentra nada,
// así que el fallo no se ve como texto en otro idioma sino como `workOrders.archivedSearch`
// escrito en la pantalla. Nadie lo nota hasta que un cliente cambia el idioma.
//
// Estas cuatro pruebas son la red: mismas claves, ningún texto vacío, mismos marcadores
// `{dato}` y nada que sobre en la lista de omisiones a propósito.

import { describe, it, expect } from 'vitest';
import { translations, type Translations } from './translations';

/**
 * Claves que existen en un solo idioma **a propósito**.
 *
 * `notifications.types.*` es el único sitio donde una ausencia es deliberada: cuando la base
 * redacta un título mejor que cualquier plantilla genérica, `renderNotification` usa el de la
 * base si la clave no existe. Cualquier otra diferencia es un olvido.
 */
const OMISIONES_A_PROPOSITO: Record<'es' | 'en', string[]> = {
  // Su título en la base ya dice qué se autorizó: "Trabajos autorizados · ORD-…".
  es: ['notifications.types.presupuesto_respondido.title'],
  en: [],
};

function hojas(obj: Translations, prefijo = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (typeof v === 'string') out.set(ruta, v);
    else for (const [rk, rv] of hojas(v, ruta)) out.set(rk, rv);
  }
  return out;
}

const es = hojas(translations.es);
const en = hojas(translations.en);
const marcadores = (texto: string) => (texto.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('translations', () => {
  it('toda clave española tiene su inglesa', () => {
    const faltan = [...es.keys()].filter((k) => !en.has(k) && !OMISIONES_A_PROPOSITO.en.includes(k));
    expect(faltan).toEqual([]);
  });

  it('toda clave inglesa tiene su española', () => {
    const faltan = [...en.keys()].filter((k) => !es.has(k) && !OMISIONES_A_PROPOSITO.es.includes(k));
    expect(faltan).toEqual([]);
  });

  // Un texto vacío no se distingue de una clave que falta: la pantalla queda en blanco.
  it('ningún texto está vacío', () => {
    const vacias = [...es, ...en].filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(vacias).toEqual([]);
  });

  // Traducir "{dias} día(s) de retraso" como "overdue" pierde el dato sin avisar.
  it('las dos redacciones usan los mismos marcadores', () => {
    const desalineadas = [...es]
      .filter(([k, v]) => en.has(k) && marcadores(v) !== marcadores(en.get(k)!))
      .map(([k, v]) => `${k}: es=[${marcadores(v)}] en=[${marcadores(en.get(k)!)}]`);
    expect(desalineadas).toEqual([]);
  });

  // Una omisión que ya se arregló tiene que salir de la lista, o tapa el próximo olvido.
  it('la lista de omisiones a propósito no tiene sobras', () => {
    expect(OMISIONES_A_PROPOSITO.es.filter((k) => es.has(k))).toEqual([]);
    expect(OMISIONES_A_PROPOSITO.en.filter((k) => en.has(k))).toEqual([]);
    expect(OMISIONES_A_PROPOSITO.es.filter((k) => !en.has(k))).toEqual([]);
    expect(OMISIONES_A_PROPOSITO.en.filter((k) => !es.has(k))).toEqual([]);
  });
});
