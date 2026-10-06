import type { PortalLanguageCode, PortalReport } from './portal.types';

/**
 * El reporte con lo que el taller escribió a mano (trabajos, repuestos, avances, notas de
 * recepción y observaciones) en inglés, si el cliente lo pidió y ya hay traducción. Lo que no
 * está traducido todavía se queda como se escribió.
 *
 * Antes del 06/10/2026 solo el PDF usaba las traducciones: el cliente que abría su enlace en
 * inglés veía estos textos en español. El diccionario lo manda `datos_portal` con las claves
 * recortadas, como las guarda la base.
 */
export function translateReport(report: PortalReport, language: PortalLanguageCode): PortalReport {
  const dict = report.traducciones;
  if (language !== 'en' || !dict || Object.keys(dict).length === 0) return report;
  const tr = (text: string) => dict[text.trim()] ?? text;
  const trMaybe = (text: string | null) => (text ? tr(text) : text);

  return {
    ...report,
    orden: { ...report.orden, notas_recepcion: trMaybe(report.orden.notas_recepcion) },
    avances: report.avances?.map((a) => ({ ...a, mensaje: trMaybe(a.mensaje) })),
    observaciones: report.observaciones?.map((o) => ({ ...o, texto: tr(o.texto) })),
    esperando_repuestos: report.esperando_repuestos?.map((p) => ({ ...p, descripcion: tr(p.descripcion) })),
    presupuesto: report.presupuesto
      ? { ...report.presupuesto, lineas: report.presupuesto.lineas.map((l) => ({ ...l, descripcion: tr(l.descripcion) })) }
      : report.presupuesto,
    cuenta: {
      ...report.cuenta,
      mano_obra: report.cuenta.mano_obra.map((l) => ({ ...l, descripcion: tr(l.descripcion) })),
      repuestos: report.cuenta.repuestos.map((l) => ({ ...l, descripcion: tr(l.descripcion) })),
      no_autorizados: report.cuenta.no_autorizados?.map((l) => ({ ...l, descripcion: tr(l.descripcion) })),
    },
  };
}
