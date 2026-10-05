import { describe, it, expect, vi, beforeEach } from 'vitest';

// Un DELETE o un UPDATE que RLS no permite no devuelve error: devuelve cero filas. `deleted`
// es lo que responde la base a la escritura.
const mocks = vi.hoisted(() => ({
  deleted: [] as { id: string }[],
  tables: [] as string[],
  // Lo que se le manda a la base: el payload de cada insert y update.
  writes: [] as { table: string; method: string; payload: unknown }[],
  // El canal de Realtime: qué tablas escucha, con qué evento, y el aviso de estado.
  channelNames: [] as string[],
  bindings: [] as { event: string; table: string; handler: (payload: unknown) => void }[],
  onStatus: null as ((status: string) => void) | null,
  removed: 0,
  // Las RPC que se llaman, con sus argumentos.
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  // Los filtros de cada consulta (`eq`, `neq`) y lo que pide (`select`).
  filters: [] as unknown[][],
}));

vi.mock('../lib/supabase', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['delete', 'single', 'order', 'range', 'overrideTypes']) chain[method] = () => chain;
    for (const method of ['eq', 'neq', 'select']) {
      chain[method] = (...args: unknown[]) => {
        mocks.filters.push([method, ...args]);
        return chain;
      };
    }
    for (const method of ['insert', 'update']) {
      chain[method] = (payload: unknown) => {
        mocks.writes.push({ table, method, payload });
        return chain;
      };
    }
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: mocks.deleted, error: null }).then(resolve);
    return chain;
  };
  const channel = {
    on: (_type: string, filter: { event: string; table: string }, handler: (payload: unknown) => void) => {
      mocks.bindings.push({ event: filter.event, table: filter.table, handler });
      return channel;
    },
    subscribe: (onStatus: (status: string) => void) => {
      mocks.onStatus = onStatus;
      return channel;
    },
  };
  return {
    supabase: {
      from: (table: string) => {
        mocks.tables.push(table);
        return builder(table);
      },
      channel: (name: string) => {
        mocks.channelNames.push(name);
        return channel;
      },
      removeChannel: async () => {
        mocks.removed += 1;
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        mocks.rpcs.push({ fn, args });
        return { data: { id: 'o1', numero_orden: 'OT-1' }, error: null };
      },
    },
  };
});

vi.mock('./media.service', () => ({
  mediaService: { uploadSmallFile: vi.fn().mockResolvedValue(undefined) },
}));

const { workOrdersService } = await import('./workOrders.service');

const removers = [
  ['removeLaborItem', 'orden_labor'],
  ['removePart', 'orden_repuestos'],
  ['removeAssignment', 'orden_asignaciones'],
] as const;

describe('workOrdersService: borrar líneas y asignaciones', () => {
  beforeEach(() => {
    mocks.tables = [];
  });

  it.each(removers)('%s termina bien cuando la base borra la fila', async (method, table) => {
    mocks.deleted = [{ id: 'x' }];
    await expect(workOrdersService[method]('x')).resolves.toBeUndefined();
    expect(mocks.tables).toEqual([table]);
  });

  it.each(removers)('%s falla si la base no borró nada (RLS), en vez de fingir éxito', async (method) => {
    mocks.deleted = [];
    await expect(workOrdersService[method]('x')).rejects.toThrow(/No se pudo eliminar/);
  });
});

// Un UPDATE tiene el mismo agujero que un DELETE, y con peores consecuencias: la pantalla
// dibuja el estado nuevo, o dice "firmada", sobre una orden que la base no cambió.
const escritores: [string, () => Promise<unknown>, string][] = [
  ['updateWorkOrderStatus', () => workOrdersService.updateWorkOrderStatus('o1', 'en_proceso'), 'ordenes_trabajo'],
  ['updateWorkOrderProgress', () => workOrdersService.updateWorkOrderProgress('o1', 50), 'ordenes_trabajo'],
  ['updateAssignmentStatus', () => workOrdersService.updateAssignmentStatus('a1', 'en_curso'), 'orden_asignaciones'],
  ['setProgressVisibility', () => workOrdersService.setProgressVisibility('v1', true), 'orden_avances'],
];

describe('workOrdersService: escrituras que RLS puede rechazar en silencio', () => {
  beforeEach(() => {
    mocks.tables = [];
  });

  it.each(escritores)('%s termina bien cuando la base escribió la fila', async (_nombre, llamar, tabla) => {
    mocks.deleted = [{ id: 'o1' }];
    await expect(llamar()).resolves.not.toThrow();
    expect(mocks.tables).toEqual([tabla]);
  });

  it.each(escritores)('%s falla si la base no escribió nada, en vez de fingir éxito', async (_nombre, llamar) => {
    mocks.deleted = [];
    await expect(llamar()).rejects.toThrow(/No se pudo guardar/);
  });
});

// La firma aparte porque sube un archivo antes de escribir la fila, y ese orden es justo el
// problema: la imagen ya está en Storage cuando el UPDATE se queda en cero filas.
describe('uploadSignature', () => {
  beforeEach(() => {
    mocks.tables = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'])) }));
  });

  const orden = { id: 'o1', sede_id: 's1' };

  it('devuelve la ruta cuando la base guardó la firma', async () => {
    mocks.deleted = [{ id: 'o1' }];
    await expect(workOrdersService.uploadSignature(orden, 'data:image/png;base64,AA')).resolves.toMatchObject({
      ruta: expect.stringContaining('firma-'),
    });
  });

  // Sin esto decía "firmada", la orden quedaba sin firma y, como la primera firma autoriza
  // lo cotizado, el total se quedaba en cero.
  it('falla si la base no guardó la firma, en vez de devolver la ruta', async () => {
    mocks.deleted = [];
    await expect(workOrdersService.uploadSignature(orden, 'data:image/png;base64,AA')).rejects.toThrow(
      /No se pudo guardar/
    );
  });
});

// Reporte del taller (octubre 2026): el admin no veía una orden finalizada hasta recargar.
describe('workOrdersService: cambios de las órdenes en tiempo real', () => {
  beforeEach(() => {
    mocks.channelNames = [];
    mocks.bindings = [];
    mocks.onStatus = null;
    mocks.removed = 0;
  });

  const emitir = (table: string, payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) =>
    mocks.bindings.find((b) => b.table === table)!.handler({ new: {}, old: {}, ...payload });

  it('escucha la orden y sus hijas, con las tablas que publica la migración', () => {
    workOrdersService.subscribeToChanges(vi.fn(), vi.fn());
    expect(mocks.bindings.map((b) => b.table).sort()).toEqual([
      'orden_asignaciones', 'orden_avances', 'orden_hallazgos', 'orden_labor', 'orden_media',
      'orden_repuestos', 'ordenes_trabajo', 'presupuestos',
    ]);
  });

  it('dice qué orden cambió: el id de la orden, o el orden_id de una hija', () => {
    const onChange = vi.fn();
    workOrdersService.subscribeToChanges(onChange, vi.fn());

    emitir('ordenes_trabajo', { new: { id: 'ord-1', estatus: 'finalizado' } });
    emitir('orden_avances', { new: { id: 'av-1', orden_id: 'ord-2' } });

    expect(onChange.mock.calls).toEqual([['ord-1'], ['ord-2']]);
  });

  it('una orden borrada llega con su id; una hija borrada no dice de qué orden era y se ignora', () => {
    const onChange = vi.fn();
    workOrdersService.subscribeToChanges(onChange, vi.fn());

    // Realtime no puede aplicar la RLS a una fila borrada y manda solo la llave primaria.
    emitir('ordenes_trabajo', { old: { id: 'ord-3' } });
    emitir('orden_labor', { old: { id: 'lab-1' } });

    expect(onChange.mock.calls).toEqual([['ord-3']]);
  });

  it('avisa de una reconexión, no de la primera conexión', () => {
    const onReconnect = vi.fn();
    workOrdersService.subscribeToChanges(vi.fn(), onReconnect);

    mocks.onStatus!('SUBSCRIBED');
    expect(onReconnect).not.toHaveBeenCalled();
    mocks.onStatus!('CHANNEL_ERROR');
    mocks.onStatus!('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('cada suscripción usa su propio canal y se puede cerrar', () => {
    const cerrar = workOrdersService.subscribeToChanges(vi.fn(), vi.fn());
    workOrdersService.subscribeToChanges(vi.fn(), vi.fn());

    expect(new Set(mocks.channelNames).size).toBe(2);
    cerrar();
    expect(mocks.removed).toBe(1);
  });
});

// La comisión por tarea depende de dos datos que manda la pantalla (20261010000006). La columna
// `reparto_heredado` nace con default true para la app que estaba publicada: si el alta dejara de
// mandar `false`, cada tarea nueva sin técnico se repartiría por especialidad en vez de quedar
// "Sin técnico", y nada en la pantalla lo diría.
describe('workOrdersService: tareas con técnico', () => {
  beforeEach(() => {
    mocks.tables = [];
    mocks.writes = [];
    mocks.deleted = [{ id: 'l1' }];
  });

  it('addLaborItem manda reparto_heredado: false y el técnico (nulo por omisión)', async () => {
    await workOrdersService.addLaborItem('o1', { descripcion: 'Frenos', costo: 200, especialidad: 'mecanica' });
    expect(mocks.writes).toEqual([
      {
        table: 'orden_labor',
        method: 'insert',
        payload: { descripcion: 'Frenos', costo: 200, especialidad: 'mecanica', asignado_a: null, reparto_heredado: false, orden_id: 'o1' },
      },
    ]);
  });

  it('addLaborItem manda false aunque la tarea lleve técnico', async () => {
    await workOrdersService.addLaborItem('o1', { descripcion: 'Puerta', costo: 500, especialidad: 'pintura', asignado_a: 'u1' });
    expect(mocks.writes[0].payload).toMatchObject({ asignado_a: 'u1', reparto_heredado: false });
  });

  it('setLaborTechnician con técnico saca la línea del reparto heredado', async () => {
    await workOrdersService.setLaborTechnician('l1', 'u1');
    expect(mocks.writes).toEqual([{ table: 'orden_labor', method: 'update', payload: { asignado_a: 'u1', reparto_heredado: false } }]);
  });

  it('setLaborTechnician sin técnico solo quita el técnico', async () => {
    await workOrdersService.setLaborTechnician('l1', null);
    expect(mocks.writes).toEqual([{ table: 'orden_labor', method: 'update', payload: { asignado_a: null } }]);
  });

  it('setLaborSpecialty solo cambia el tipo', async () => {
    await workOrdersService.setLaborSpecialty('l1', 'pintura');
    expect(mocks.writes).toEqual([{ table: 'orden_labor', method: 'update', payload: { especialidad: 'pintura' } }]);
  });

  it('setAssignmentOrigin solo cambia el origen', async () => {
    await workOrdersService.setAssignmentOrigin('a1', 'tarea');
    expect(mocks.writes).toEqual([{ table: 'orden_asignaciones', method: 'update', payload: { origen: 'tarea' } }]);
  });

  it.each([
    ['setLaborTechnician', () => workOrdersService.setLaborTechnician('l1', 'u1')],
    ['setLaborSpecialty', () => workOrdersService.setLaborSpecialty('l1', 'pintura')],
    ['setAssignmentOrigin', () => workOrdersService.setAssignmentOrigin('a1', 'manual')],
  ])('%s falla si la base no escribió nada (RLS), en vez de fingir éxito', async (_nombre, llamar) => {
    mocks.deleted = [];
    await expect(llamar()).rejects.toThrow(/No se pudo guardar/);
  });
});

// El alta manda el depósito dentro de `p_order`, con los nombres que lee `create_work_order`
// (20261010000007). Con otro nombre la base lo ignora sin error: hasta el 04/10/2026 el número
// de cheque y el comprobante del alta se perdían así.
describe('workOrdersService: createWorkOrder', () => {
  beforeEach(() => {
    mocks.rpcs = [];
  });

  it('manda el método, el número de cheque y el comprobante con los nombres de la base', async () => {
    await workOrdersService.createWorkOrder({
      sede_id: 's1',
      cliente_id: 'c1',
      vehiculo_id: 'v1',
      tipo_trabajo: 'mecanica',
      millas_ingreso: 1000,
      nivel_gasolina: '1/2',
      deposito_inicial: 200,
      deposito_metodo: 'cheque',
      deposito_cheque: '1042',
      deposito_comprobante: 's1/comprobante-alta-1.jpg',
      inspeccion_360_notas: '',
      fecha_estimada_entrega: '2026-10-09',
      labor_items: [{ descripcion: 'Puerta', costo: 500, especialidad: 'pintura', asignado_a: 'u1', reparto_heredado: false }],
      repuestos: [],
      asignaciones: [],
      creado_por: 'a1',
    });

    expect(mocks.rpcs).toHaveLength(1);
    const { fn, args } = mocks.rpcs[0];
    expect(fn).toBe('create_work_order');
    expect(args.p_order).toMatchObject({
      deposito_inicial: 200,
      deposito_metodo: 'cheque',
      deposito_numero_cheque: '1042',
      deposito_comprobante_ruta: 's1/comprobante-alta-1.jpg',
    });
    expect(args.p_order).not.toHaveProperty('deposito_cheque');
    expect(args.p_order).not.toHaveProperty('deposito_comprobante');
    expect(args.p_labor).toEqual([
      { descripcion: 'Puerta', costo: 500, especialidad: 'pintura', asignado_a: 'u1', reparto_heredado: false },
    ]);
  });
});

// "Mis tareas" del panel del técnico (F7): solo las suyas, sin las rechazadas ni las de órdenes
// entregadas, y con la orden embebida como un objeto.
describe('workOrdersService: getMyTasks', () => {
  beforeEach(() => {
    mocks.filters = [];
  });

  it('filtra por técnico, estado y orden sin entregar, y entrega la orden como `orden`', async () => {
    const orden = { id: 'o1', numero_orden: 'OT-1', estatus: 'en_proceso', fecha_estimada_entrega: null, vehiculo: null };
    mocks.deleted = [{ id: 'l1', orden_id: 'o1', descripcion: 'Frenos', ordenes_trabajo: orden }] as never;

    const tasks = await workOrdersService.getMyTasks('u1');

    expect(tasks).toEqual([{ id: 'l1', orden_id: 'o1', descripcion: 'Frenos', orden }]);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'asignado_a', 'u1'],
        ['neq', 'estado', 'rechazado'],
        ['neq', 'ordenes_trabajo.estatus', 'entregado'],
      ])
    );
    const select = mocks.filters.find(([method]) => method === 'select')?.[1] as string;
    expect(select).toContain('ordenes_trabajo!inner(');
  });
});

// El costo de un repuesto (decisión del taller, 05/10/2026): por defecto el precio, y el que
// escribe administración se queda. Mandar siempre el precio como costo lo borraba al editar.
describe('workOrdersService: costo y pedido de un repuesto', () => {
  beforeEach(() => {
    mocks.writes = [];
    mocks.rpcs = [];
    mocks.deleted = [{ id: 'p1' }];
  });

  it('addPart manda el precio como costo si no hay costo, y el costo si lo hay', async () => {
    await workOrdersService.addPart('o1', { descripcion: 'Filtro', cantidad: 1, precio_venta_unitario: 20 });
    await workOrdersService.addPart('o1', { descripcion: 'Amortiguador', cantidad: 2, precio_venta_unitario: 150, costo_unitario: 90 });
    expect(mocks.writes.map((w) => (w.payload as { costo_unitario: number }).costo_unitario)).toEqual([20, 90]);
  });

  it('updatePart no manda el costo si administración no lo escribió', async () => {
    await workOrdersService.updatePart('p1', { descripcion: 'Filtro', cantidad: 1, precio_venta_unitario: 25, costo_unitario: null });
    expect(mocks.writes[0].payload).not.toHaveProperty('costo_unitario');
    await workOrdersService.updatePart('p1', { descripcion: 'Filtro', cantidad: 1, precio_venta_unitario: 25, costo_unitario: 12 });
    expect(mocks.writes[1].payload).toMatchObject({ costo_unitario: 12 });
  });

  it('setPartOrderState solo cambia el pedido', async () => {
    await workOrdersService.setPartOrderState('p1', 'recibido');
    expect(mocks.writes).toEqual([{ table: 'orden_repuestos', method: 'update', payload: { estado_pedido: 'recibido' } }]);
  });

  it('el descuento y la retirada sin reparar van por sus RPC, con los nombres de la base', async () => {
    await workOrdersService.applyDiscount('o1', { monto: 45 }, 'Cliente frecuente');
    await workOrdersService.applyDiscount('o1', { porcentaje: 10 }, null);
    await workOrdersService.withdrawWithoutRepair({
      orderId: 'o1', cobro: 50, concepto: 'Diagnóstico', metodo: 'efectivo', conservar: ['l1'],
    });
    await workOrdersService.registerAdvance({ orderId: 'o1', monto: 200, metodo: 'zelle' });
    expect(mocks.rpcs).toEqual([
      { fn: 'aplicar_descuento', args: { p_orden_id: 'o1', p_monto: 45, p_motivo: 'Cliente frecuente', p_porcentaje: null } },
      { fn: 'aplicar_descuento', args: { p_orden_id: 'o1', p_monto: null, p_motivo: null, p_porcentaje: 10 } },
      {
        fn: 'retirar_sin_reparar',
        args: {
          p_orden_id: 'o1', p_cobro: 50, p_concepto: 'Diagnóstico', p_metodo: 'efectivo',
          p_numero_cheque: null, p_comprobante_ruta: null, p_conservar: ['l1'],
        },
      },
      {
        fn: 'registrar_anticipo',
        args: { p_orden_id: 'o1', p_monto: 200, p_metodo: 'zelle', p_numero_cheque: null, p_comprobante_ruta: null },
      },
    ]);
  });
});
