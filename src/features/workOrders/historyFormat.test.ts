import { describe, it, expect } from 'vitest';
import { getTranslation } from '../../i18n/translations';
import type { OrderHistoryEntry } from '../../types/database';
import { describeHistoryEntry } from './historyFormat';

// Cómo se lee el historial de la orden. Lo pidió el taller (03/10/2026) para poder contestar
// "¿quién dejó esta orden Finalizada en 0 %?": cada fila tiene que decir quién, qué hizo y el
// antes → después con las mismas palabras que usa la pantalla.

const t = (key: string) => getTranslation('es', key);
const statusLabels = { recepcion: 'Recepción', en_proceso: 'En Proceso', finalizado: 'Finalizado' };
const ctx = { t, statusLabels, language: 'es' };

function entry(over: Partial<OrderHistoryEntry>): OrderHistoryEntry {
  return {
    id: 1,
    ocurrido_en: '2026-10-03T19:23:00Z',
    actor_nombre: 'Rosa Mecánica',
    origen: 'app',
    entidad: 'orden',
    entidad_id: 'o1',
    accion: 'cambiar',
    resumen: 'ORD-2026-002',
    cambios: {},
    ...over,
  };
}

describe('describeHistoryEntry', () => {
  it('un cambio de estado y de avance, con quién lo hizo', () => {
    const item = describeHistoryEntry(
      entry({ cambios: { estatus: { antes: 'en_proceso', despues: 'finalizado' }, porcentaje_avance: { antes: 80, despues: 0 } } }),
      ctx
    );
    expect(item.actor).toBe('Rosa Mecánica');
    expect(item.action).toBe('cambió la orden');
    expect(item.details).toEqual(['Estado: En Proceso → Finalizado', 'Avance: 80 % → 0 %']);
  });

  it('una mano de obra nueva dice qué es y cuánto cuesta, sin repetir la descripción', () => {
    const item = describeHistoryEntry(
      entry({
        entidad: 'mano_obra',
        accion: 'crear',
        resumen: 'Cambio de luces',
        actor_nombre: 'Ana Admin',
        cambios: { descripcion: { despues: 'Cambio de luces' }, costo: { despues: 100 }, estado: { despues: 'borrador' }, especialidad: { despues: 'pintura' } },
      }),
      ctx
    );
    expect(item.action).toBe('agregó mano de obra «Cambio de luces»');
    expect(item.details).toEqual(['Precio: $100.00', 'Especialidad: Pintura']);
  });

  it('marcar hecha o reabrir se dice con palabras, no con fechas', () => {
    const hecha = describeHistoryEntry(
      entry({ entidad: 'mano_obra', resumen: 'Cambio de aceite', cambios: { completado_en: { antes: null, despues: '2026-10-03T19:00:00Z' } } }),
      ctx
    );
    const reabierta = describeHistoryEntry(
      entry({ entidad: 'mano_obra', resumen: 'Cambio de aceite', cambios: { completado_en: { antes: '2026-10-03T19:00:00Z', despues: null } } }),
      ctx
    );
    expect(hecha.details).toEqual(['Marcada como hecha']);
    expect(reabierta.details).toEqual(['Reabierta']);
  });

  it('el estado de una línea con las palabras del presupuesto', () => {
    const item = describeHistoryEntry(
      entry({ entidad: 'mano_obra', resumen: 'Alineación', cambios: { estado: { antes: 'borrador', despues: 'pendiente' } } }),
      ctx
    );
    expect(item.details).toEqual(['Estado: Sin autorizar → Esperando al cliente']);
  });

  it('el cliente que responde desde su enlace y el sistema no tienen nombre de empleado', () => {
    expect(describeHistoryEntry(entry({ origen: 'portal', actor_nombre: null }), ctx).actor).toBe('El cliente (desde su enlace)');
    expect(describeHistoryEntry(entry({ origen: 'sistema', actor_nombre: null }), ctx).actor).toBe('El sistema');
  });

  it('el depósito en dinero y la firma como frase', () => {
    expect(
      describeHistoryEntry(entry({ entidad: 'deposito', resumen: null, cambios: { deposito_inicial: { antes: 0, despues: 200 } } }), ctx).details
    ).toEqual(['Depósito: $0.00 → $200.00']);
    expect(
      describeHistoryEntry(entry({ cambios: { firma_fecha: { antes: null, despues: '2026-10-02T15:00:00Z' } } }), ctx).details
    ).toEqual(['Firmó la recepción']);
  });

  it('un archivo se nombra por tipo, origen y zona', () => {
    const item = describeHistoryEntry(
      entry({ entidad: 'archivo', accion: 'crear', resumen: 'foto · recepcion · front', cambios: { tipo: { despues: 'foto' } } }),
      ctx
    );
    expect(item.action).toBe('subió un archivo: Foto (recepción, Frontal)');
    expect(item.details).toEqual([]);
  });

  it('crear la orden y borrar algo no listan campos', () => {
    expect(
      describeHistoryEntry(entry({ accion: 'crear', cambios: { estatus: { despues: 'recepcion' }, millas_ingreso: { despues: 0 } } }), ctx).details
    ).toEqual([]);
    expect(
      describeHistoryEntry(entry({ entidad: 'repuesto', accion: 'borrar', resumen: 'Foco', cambios: { cantidad: { antes: 1 } } }), ctx)
    ).toMatchObject({ action: 'quitó el repuesto «Foco»', details: [] });
  });

  it('la fecha estimada como día local, sin correrse un día', () => {
    const item = describeHistoryEntry(
      entry({ cambios: { fecha_estimada_entrega: { antes: '2026-10-10', despues: '2026-10-12' } } }),
      ctx
    );
    expect(item.details[0]).toMatch(/10.*oct.*→.*12.*oct/i);
  });

  // El técnico de una tarea se guarda por nombre (20261010000006). Vacío es "sin técnico".
  it('el técnico de una tarea, antes y después, por nombre', () => {
    const asignar = describeHistoryEntry(
      entry({ entidad: 'mano_obra', resumen: 'Pintar defensa', cambios: { tecnico: { antes: null, despues: 'Paula Pintora' } } }),
      ctx
    );
    expect(asignar.action).toBe('cambió la mano de obra «Pintar defensa»');
    expect(asignar.details).toEqual(['Técnico: Sin técnico → Paula Pintora']);

    const reasignar = describeHistoryEntry(
      entry({ entidad: 'mano_obra', resumen: 'Pintar defensa', cambios: { tecnico: { antes: 'Paula Pintora', despues: 'Rosa Mecánica' } } }),
      ctx
    );
    expect(reasignar.details).toEqual(['Técnico: Paula Pintora → Rosa Mecánica']);

    const crear = describeHistoryEntry(
      entry({ entidad: 'mano_obra', accion: 'crear', resumen: 'Pulido', cambios: { costo: { despues: 80 }, tecnico: { despues: 'Paula Pintora' } } }),
      ctx
    );
    expect(crear.details).toEqual(['Precio: $80.00', 'Técnico: Paula Pintora']);
  });

  // Quién entra al reparto por especialidad lo decide administración (origen de la asignación).
  it('entrar y salir del reparto se dice con palabras; asignar a mano no lo repite', () => {
    const sale = describeHistoryEntry(
      entry({ entidad: 'asignacion', resumen: 'Mario Mecánico', cambios: { reparto: { antes: true, despues: false } } }),
      ctx
    );
    expect(sale.details).toEqual(['Salió del reparto por especialidad: cobra solo sus tareas']);

    const entra = describeHistoryEntry(
      entry({ entidad: 'asignacion', resumen: 'Mario Mecánico', cambios: { reparto: { antes: false, despues: true } } }),
      ctx
    );
    expect(entra.details).toEqual(['Entró al reparto por especialidad']);

    const aMano = describeHistoryEntry(
      entry({ entidad: 'asignacion', accion: 'crear', resumen: 'Mario Mecánico', cambios: { tipo_tarea: { despues: 'mecanica' }, reparto: { despues: true } } }),
      ctx
    );
    expect(aMano.details).toEqual(['Especialidad: Mecánica']);

    const porTarea = describeHistoryEntry(
      entry({ entidad: 'asignacion', accion: 'crear', resumen: 'Paula Pintora', cambios: { tipo_tarea: { despues: 'pintura' }, reparto: { despues: false } } }),
      ctx
    );
    expect(porTarea.details).toEqual(['Especialidad: Pintura', 'Por una tarea: cobra solo sus tareas']);
  });
});
