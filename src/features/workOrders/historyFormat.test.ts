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

  // 05/10/2026: el descuento, el costo de una pieza, su pedido y la retirada sin reparar.
  it('el descuento se lee como tal, con su monto y su motivo', () => {
    const item = describeHistoryEntry(
      entry({
        entidad: 'descuento',
        resumen: null,
        cambios: { descuento: { antes: 0, despues: 45 }, descuento_motivo: { antes: null, despues: 'Cliente frecuente' } },
      }),
      ctx
    );
    expect(item.action).toBe('cambió el descuento');
    expect(item.details).toEqual(['Descuento: $0.00 → $45.00', 'Motivo: — → «Cliente frecuente»']);
  });

  it('el costo y el pedido de un repuesto', () => {
    const item = describeHistoryEntry(
      entry({
        entidad: 'repuesto',
        resumen: 'Amortiguador',
        cambios: { costo_unitario: { antes: 150, despues: 95 }, estado_pedido: { antes: 'pedido', despues: 'recibido' } },
      }),
      ctx
    );
    expect(item.details).toEqual(['Costo: $150.00 → $95.00', 'Pedido: Pedido → Llegó']);
  });

  it('una retirada sin reparar se dice con una frase', () => {
    const item = describeHistoryEntry(entry({ cambios: { retirada_sin_reparar: { antes: false, despues: true } } }), ctx);
    expect(item.details).toEqual(['Retirada sin reparar']);
  });

  it('el cambio en marcas de daño se muestra como cantidad de marcas', () => {
    const item = describeHistoryEntry(
      entry({
        cambios: {
          marcas_danos: {
            antes: [
              { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe' },
              { vista: 'trasera', x: 0.4, y: 0.4, tipo: 'rayon' },
              { vista: 'superior', x: 0.2, y: 0.3, tipo: 'pintura' },
            ],
            despues: [
              { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe' },
              { vista: 'trasera', x: 0.4, y: 0.4, tipo: 'rayon' },
              { vista: 'superior', x: 0.2, y: 0.3, tipo: 'pintura' },
              { vista: 'izquierda', x: 0.1, y: 0.2, tipo: 'roto' },
            ],
          },
        },
      }),
      ctx
    );
    expect(item.details).toEqual(['Daños marcados: 3 marcas → 4 marcas']);
  });

  // QA 18/10/2026: el historial mostraba la clave cruda («history.field.horas: 1.5»), porque la
  // migración 036 empezó a registrar las horas sin que nadie escribiera su etiqueta. Esta lista es
  // la de los campos que graba trg_historial (supabase/migrations): si la base suma uno, suma aquí.
  const CAMPOS_QUE_GRABA_LA_BASE = [
    'estatus', 'porcentaje_avance', 'tipo_trabajo', 'fecha_estimada_entrega', 'millas_ingreso', 'nivel_gasolina',
    'inspeccion_360_notas', 'motivo_autorizacion', 'descripcion', 'costo', 'horas', 'especialidad', 'estado',
    'cantidad', 'precio_venta_unitario', 'costo_unitario', 'estado_pedido', 'descuento', 'descuento_motivo',
    'tipo_tarea', 'deposito_inicial', 'total_propuesto', 'total_aprobado', 'respondido_por_nombre', 'tecnico',
    'respondido_via', 'tipo', 'origen', 'zona', 'marcas_danos', 'fecha', 'millas', 'nota', 'sugerido_fecha',
    'sugerido_millas', 'sugerido_nota', 'cobrar', 'tarifa_manual', 'inicio_manual', 'dias_exonerados',
  ];

  const ENTIDADES_QUE_GRABA_LA_BASE = [
    'orden', 'mano_obra', 'repuesto', 'asignacion', 'deposito', 'descuento', 'presupuesto', 'archivo', 'avance',
    'proximo_servicio', 'parqueo',
  ];

  it.each(['es', 'en'])('toda entidad que graba la base dice qué pasó en %s', (lang) => {
    const faltan = ENTIDADES_QUE_GRABA_LA_BASE.flatMap((entidad) =>
      ['crear', 'cambiar', 'borrar'].map((accion) => `history.action.${entidad}.${accion}`)
    ).filter((key) => getTranslation(lang as 'es' | 'en', key) === key);
    expect(faltan).toEqual([]);
  });

  it.each(['es', 'en'])('todo campo que graba la base tiene su etiqueta en %s', (lang) => {
    const faltan = CAMPOS_QUE_GRABA_LA_BASE.filter((campo) => {
      const key = `history.field.${campo}`;
      return getTranslation(lang as 'es' | 'en', key) === key;
    });
    expect(faltan).toEqual([]);
  });

  it('un cambio de horas y uno del cobro de parqueo se leen con palabras', () => {
    const horas = describeHistoryEntry(
      entry({ entidad: 'mano_obra', cambios: { horas: { antes: 1.5, despues: 2 } } }),
      ctx
    );
    expect(horas.details).toEqual(['Horas: 1.5 h → 2 h']);

    const parqueo = describeHistoryEntry(
      entry({ entidad: 'parqueo', cambios: { cobrar: { antes: true, despues: false }, tarifa_manual: { antes: null, despues: 5 } } }),
      ctx
    );
    expect(parqueo.details).toEqual(['Cobrar parqueo: Sí → No', 'Tarifa manual: — → $5.00']);
  });
});
