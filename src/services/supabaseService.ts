import { supabase } from '../lib/supabase';
import type {
  WorkOrder,
  Customer,
  Vehicle,
  UserProfile,
  UserRole,
  Sede,
  CustomerInput,
  VehicleInput,
  WorkOrderInput,
  FinancialTransaction,
  PayrollEntry,
  DashboardStats,
  OrderStatus,
  LaborItem,
  WorkOrderPart,
  BankStatementImport,
  CategorizationRule,
  ParsedStatementTransaction,
} from '../types/database';

const DEFAULT_CAPACITY = 10;

function isSameMonth(dateStr: string, ref: Date) {
  const d = new Date(dateStr);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

export const supabaseService = {
  // ===== Sedes =====
  getSedes: async () => {
    const { data, error } = await supabase.from('sedes').select('*').order('nombre');
    if (error) throw error;
    return data as Sede[];
  },

  createSede: async (input: Omit<Sede, 'id' | 'fecha_creacion'>) => {
    const { data, error } = await supabase.from('sedes').insert(input).select().single();
    if (error) throw error;
    return data as Sede;
  },

  updateSede: async (id: string, input: Partial<Pick<Sede, 'nombre' | 'direccion' | 'telefono' | 'capacidad'>>) => {
    const { data, error } = await supabase.from('sedes').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Sede;
  },

  // ===== Users / Profiles =====
  getUsers: async (sedeId?: string) => {
    let query = supabase.from('perfiles').select('*').order('nombre_completo');
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as UserProfile[];
  },

  createEmployee: async (input: {
    email: string;
    password: string;
    nombre_completo: string;
    rol: UserRole;
    sede_id: string;
    telefono?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('create-employee', { body: input });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.profile as UserProfile;
  },

  getOperators: async (sedeId?: string) => {
    let query = supabase.from('perfiles').select('*').in('rol', ['mecanico', 'pintor']);
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as UserProfile[];
  },

  // ===== Customers =====
  getCustomers: async (sedeId?: string) => {
    let query = supabase.from('clientes').select('*').order('creado_en', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data: clientes, error } = await query;
    if (error) throw error;

    const clienteIds = (clientes || []).map((c) => c.id);
    const [{ data: vehiculos }, { data: ordenes }] = clienteIds.length
      ? await Promise.all([
          supabase.from('vehiculos').select('id, cliente_id').in('cliente_id', clienteIds),
          supabase.from('ordenes_trabajo').select('id, cliente_id').in('cliente_id', clienteIds),
        ])
      : [{ data: [] }, { data: [] }];

    return (clientes || []).map((c) => ({
      ...c,
      vehiculos_count: (vehiculos || []).filter((v) => v.cliente_id === c.id).length,
      ordenes_count: (ordenes || []).filter((o) => o.cliente_id === c.id).length,
    })) as Customer[];
  },

  getCustomerDetail: async (customerId: string) => {
    const [{ data: customer, error }, { data: vehicles }, { data: orders }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', customerId).single(),
      supabase.from('vehiculos').select('*').eq('cliente_id', customerId),
      supabase.from('ordenes_trabajo').select('*').eq('cliente_id', customerId).order('creado_en', { ascending: false }),
    ]);
    if (error) throw error;
    return {
      customer: customer as Customer,
      vehicles: (vehicles || []) as Vehicle[],
      orders: (orders || []) as WorkOrder[],
    };
  },

  createCustomer: async (input: CustomerInput) => {
    const { data, error } = await supabase.from('clientes').insert(input).select().single();
    if (error) throw error;
    return data as Customer;
  },

  updateCustomer: async (id: string, input: Partial<CustomerInput>) => {
    const { data, error } = await supabase.from('clientes').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Customer;
  },

  deleteCustomer: async (id: string) => {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) throw error;
  },

  // ===== Vehicles =====
  getVehicles: async () => {
    const { data, error } = await supabase.from('vehiculos').select(`
      *,
      cliente:clientes(nombre)
    `);
    if (error) throw error;
    return (data || []).map((v) => ({
      ...v,
      cliente_nombre: v.cliente?.nombre,
    })) as Vehicle[];
  },

  getVehiclesByCustomer: async (customerId: string) => {
    const { data, error } = await supabase.from('vehiculos').select('*').eq('cliente_id', customerId);
    if (error) throw error;
    return data as Vehicle[];
  },

  createVehicle: async (input: VehicleInput) => {
    const { data, error } = await supabase.from('vehiculos').insert(input).select().single();
    if (error) throw error;
    return data as Vehicle;
  },

  updateVehicle: async (id: string, input: Partial<VehicleInput>) => {
    const { data, error } = await supabase.from('vehiculos').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Vehicle;
  },

  deleteVehicle: async (id: string) => {
    const { error } = await supabase.from('vehiculos').delete().eq('id', id);
    if (error) throw error;
  },

  // ===== Work Orders =====
  getWorkOrders: async (sedeId?: string) => {
    let query = supabase.from('ordenes_trabajo').select(`
      *,
      cliente:clientes(*),
      vehiculo:vehiculos(*),
      asignaciones:orden_asignaciones(*, usuario:perfiles(*))
    `).order('creado_en', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);

    const { data, error } = await query;
    if (error) throw error;
    return data as WorkOrder[];
  },

  getWorkOrderDetail: async (orderId: string) => {
    const { data, error } = await supabase.from('ordenes_trabajo').select(`
      *,
      cliente:clientes(*),
      vehiculo:vehiculos(*),
      labor_items:orden_labor(*),
      repuestos:orden_repuestos(*),
      asignaciones:orden_asignaciones(*, usuario:perfiles(*))
    `).eq('id', orderId).single();
    if (error) throw error;
    return data as WorkOrder;
  },

  createWorkOrder: async (input: WorkOrderInput & { creado_por: string }) => {
    // numero_orden is generated atomically by a DB trigger (trg_numero_orden) to
    // avoid duplicate order numbers when two orders are created concurrently.
    const totalLabor = input.labor_items.reduce((sum, l) => sum + l.costo, 0);
    const totalParts = input.repuestos.reduce((sum, p) => sum + p.cantidad * p.precio_venta_unitario, 0);

    const { data: order, error } = await supabase.from('ordenes_trabajo').insert({
      sede_id: input.sede_id,
      cliente_id: input.cliente_id,
      vehiculo_id: input.vehiculo_id,
      tipo_trabajo: input.tipo_trabajo,
      estatus: 'recepcion',
      millas_ingreso: input.millas_ingreso,
      nivel_gasolina: input.nivel_gasolina,
      deposito_inicial: input.deposito_inicial,
      inspeccion_360_notas: input.inspeccion_360_notas,
      fecha_estimada_entrega: input.fecha_estimada_entrega,
      porcentaje_avance: 0,
      total_labor: totalLabor,
      total_repuestos: totalParts,
      total_general: totalLabor + totalParts,
      creado_por: input.creado_por,
    }).select().single();
    if (error) throw error;

    if (input.labor_items.length) {
      const { error: laborError } = await supabase
        .from('orden_labor')
        .insert(input.labor_items.map((l) => ({ ...l, orden_id: order.id })));
      if (laborError) throw laborError;
    }

    if (input.repuestos.length) {
      const { error: partsError } = await supabase
        .from('orden_repuestos')
        .insert(input.repuestos.map((p) => ({
          ...p,
          orden_id: order.id,
          subtotal: p.cantidad * p.precio_venta_unitario,
        })));
      if (partsError) throw partsError;
    }

    if (input.asignaciones.length) {
      const { error: assignError } = await supabase
        .from('orden_asignaciones')
        .insert(input.asignaciones.map((a) => ({
          ...a,
          orden_id: order.id,
          estatus_tarea: 'pendiente',
        })));
      if (assignError) throw assignError;
    }

    return order as WorkOrder;
  },

  updateWorkOrderStatus: async (orderId: string, estatus: OrderStatus) => {
    const updates: Record<string, unknown> = { estatus };
    if (estatus === 'finalizado' || estatus === 'entregado') {
      updates.fecha_finalizacion = new Date().toISOString();
    }
    if (estatus === 'entregado') {
      updates.porcentaje_avance = 100;
    }
    const { error } = await supabase.from('ordenes_trabajo').update(updates).eq('id', orderId);
    if (error) throw error;
  },

  updateWorkOrderProgress: async (orderId: string, porcentaje: number) => {
    const { error } = await supabase.from('ordenes_trabajo').update({ porcentaje_avance: porcentaje }).eq('id', orderId);
    if (error) throw error;
  },

  deleteWorkOrder: async (orderId: string) => {
    const { error } = await supabase.from('ordenes_trabajo').delete().eq('id', orderId);
    if (error) throw error;
  },

  // ===== Labor / Parts / Assignments on an existing order =====
  // Totals (total_labor / total_repuestos / total_general) are recomputed
  // automatically by database triggers whenever these rows change.
  addLaborItem: async (orderId: string, item: { descripcion: string; costo: number }) => {
    const { data, error } = await supabase
      .from('orden_labor')
      .insert({ ...item, orden_id: orderId })
      .select()
      .single();
    if (error) throw error;
    return data as LaborItem;
  },

  removeLaborItem: async (id: string) => {
    const { error } = await supabase.from('orden_labor').delete().eq('id', id);
    if (error) throw error;
  },

  addPart: async (orderId: string, item: { descripcion: string; cantidad: number; costo_unitario: number; precio_venta_unitario: number }) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .insert({ ...item, orden_id: orderId, subtotal: item.cantidad * item.precio_venta_unitario })
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  removePart: async (id: string) => {
    const { error } = await supabase.from('orden_repuestos').delete().eq('id', id);
    if (error) throw error;
  },

  addAssignment: async (orderId: string, usuarioId: string, tipoTarea: 'mecanica' | 'pintura') => {
    const { error } = await supabase
      .from('orden_asignaciones')
      .insert({ orden_id: orderId, usuario_id: usuarioId, tipo_tarea: tipoTarea, estatus_tarea: 'pendiente' });
    if (error) throw error;
  },

  removeAssignment: async (id: string) => {
    const { error } = await supabase.from('orden_asignaciones').delete().eq('id', id);
    if (error) throw error;
  },

  updateAssignmentStatus: async (id: string, estatus: 'pendiente' | 'en_curso' | 'completada') => {
    const { error } = await supabase.from('orden_asignaciones').update({ estatus_tarea: estatus }).eq('id', id);
    if (error) throw error;
  },

  // ===== Global search =====
  globalSearch: async (query: string, sedeId?: string) => {
    const q = query.trim();
    if (q.length < 2) return { customers: [], vehicles: [], orders: [] };
    // `,` and `(`/`)` are structural in PostgREST's .or() filter syntax (clause
    // separator and grouping) — strip them so typed search text can't break out
    // of the intended ilike clause into an unrelated column/operator.
    const safeQ = q.replace(/[,()]/g, '');

    let customerQuery = supabase
      .from('clientes')
      .select('id, nombre, telefono')
      .or(`nombre.ilike.%${safeQ}%,telefono.ilike.%${safeQ}%`)
      .limit(5);
    if (sedeId) customerQuery = customerQuery.eq('sede_id', sedeId);

    const vehicleQuery = supabase
      .from('vehiculos')
      .select('id, marca, modelo, placa, vin, cliente:clientes(nombre)')
      .or(`placa.ilike.%${safeQ}%,vin.ilike.%${safeQ}%,marca.ilike.%${safeQ}%,modelo.ilike.%${safeQ}%`)
      .limit(5);

    let orderQuery = supabase
      .from('ordenes_trabajo')
      .select('id, numero_orden, estatus, cliente:clientes(nombre)')
      .ilike('numero_orden', `%${safeQ}%`)
      .limit(5);
    if (sedeId) orderQuery = orderQuery.eq('sede_id', sedeId);

    const [{ data: customers }, { data: vehicles }, { data: orders }] = await Promise.all([
      customerQuery,
      vehicleQuery,
      orderQuery,
    ]);

    return {
      customers: (customers || []) as { id: string; nombre: string; telefono: string }[],
      vehicles: (vehicles || []) as unknown as { id: string; marca: string; modelo: string; placa: string; vin: string; cliente?: { nombre: string } }[],
      orders: (orders || []) as unknown as { id: string; numero_orden: string; estatus: OrderStatus; cliente?: { nombre: string } }[],
    };
  },

  // ===== Storage (360 Photos) =====
  uploadPhoto: async (file: File, path: string) => {
    const { error } = await supabase.storage
      .from('vehiculos_fotos')
      .upload(path, file, { cacheControl: '3600', upsert: true });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('vehiculos_fotos')
      .getPublicUrl(path);

    return publicUrlData.publicUrl;
  },

  uploadOrderPhotos: async (orderId: string, files: { zone: string; file: File }[]) => {
    const urls: string[] = [];
    for (const { zone, file } of files) {
      const path = `${orderId}/${zone}-${Date.now()}-${file.name}`;
      const url = await supabaseService.uploadPhoto(file, path);
      urls.push(url);
    }
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ inspeccion_360_fotos: urls })
      .eq('id', orderId);
    if (error) throw error;
    return urls;
  },

  // ===== Financial Transactions =====
  getTransactions: async (sedeId?: string) => {
    let query = supabase.from('finanzas_movimientos').select('*').order('fecha', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as FinancialTransaction[];
  },

  createTransaction: async (input: Omit<FinancialTransaction, 'id' | 'creado_en'>) => {
    const { data, error } = await supabase.from('finanzas_movimientos').insert(input).select().single();
    if (error) throw error;
    return data as FinancialTransaction;
  },

  deleteTransaction: async (id: string) => {
    const { error } = await supabase.from('finanzas_movimientos').delete().eq('id', id);
    if (error) throw error;
  },

  // ===== Bank statement import =====
  getCategorizationRules: async () => {
    const { data, error } = await supabase
      .from('finanzas_reglas_categorizacion')
      .select('*')
      .eq('activo', true)
      .order('creado_en');
    if (error) throw error;
    return data as CategorizationRule[];
  },

  uploadStatement: async (file: File, sedeId: string) => {
    const path = `${sedeId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('estados_cuenta_bancarios').upload(path, file);
    if (error) throw error;
    return path;
  },

  createImportBatch: async (input: {
    sede_id: string;
    nombre_archivo: string;
    ruta_archivo: string;
    importado_por: string;
    total_transacciones: number;
  }) => {
    const { data, error } = await supabase.from('finanzas_importaciones').insert(input).select().single();
    if (error) throw error;
    return data as BankStatementImport;
  },

  // Flags parsed transactions that likely already exist in finanzas_movimientos
  // (same sede, same amount, date within 2 days) — e.g. a client payment the
  // order-delivery trigger already recorded — so they default to excluded in
  // the review table instead of getting double-counted.
  findPossibleDuplicates: async (sedeId: string, transactions: ParsedStatementTransaction[]) => {
    if (transactions.length === 0) return new Map<number, string>();
    const dates = transactions.map((t) => t.fecha).sort();
    const rangeStart = new Date(dates[0]);
    rangeStart.setDate(rangeStart.getDate() - 2);
    const rangeEnd = new Date(dates[dates.length - 1]);
    rangeEnd.setDate(rangeEnd.getDate() + 2);

    const { data, error } = await supabase
      .from('finanzas_movimientos')
      .select('monto, fecha, descripcion')
      .eq('sede_id', sedeId)
      .gte('fecha', rangeStart.toISOString().split('T')[0])
      .lte('fecha', rangeEnd.toISOString().split('T')[0]);
    if (error) throw error;

    const existing = (data || []) as { monto: number; fecha: string; descripcion: string }[];
    const matches = new Map<number, string>();
    transactions.forEach((tx, idx) => {
      const txDate = new Date(tx.fecha).getTime();
      const match = existing.find((m) => {
        if (Math.abs(Number(m.monto) - tx.monto) > 0.01) return false;
        const diffDays = Math.abs(new Date(m.fecha).getTime() - txDate) / 86400000;
        return diffDays <= 2;
      });
      if (match) matches.set(idx, match.descripcion);
    });
    return matches;
  },

  bulkInsertTransactions: async (rows: Omit<FinancialTransaction, 'id' | 'creado_en'>[]) => {
    if (rows.length === 0) return;
    const { error } = await supabase.from('finanzas_movimientos').insert(rows);
    if (error) throw error;
  },

  // Deletes every finanzas_movimientos row from a batch, then the batch
  // itself — used to fully undo an import if something was miscategorized.
  deleteImportBatch: async (importacionId: string) => {
    const { error: rowsError } = await supabase
      .from('finanzas_movimientos')
      .delete()
      .eq('importacion_id', importacionId);
    if (rowsError) throw rowsError;
    const { error } = await supabase.from('finanzas_importaciones').delete().eq('id', importacionId);
    if (error) throw error;
  },

  // ===== Payroll =====
  getPayroll: async (sedeId?: string) => {
    let query = supabase.from('nomina_pagos').select(`
      *,
      usuario:perfiles!usuario_id(*)
    `).order('fecha_pago', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as PayrollEntry[];
  },

  createPayroll: async (input: Omit<PayrollEntry, 'id' | 'total_pagado' | 'usuario'>) => {
    const total_pagado = input.salario_base + input.bonos - input.deducciones;
    const { data, error } = await supabase
      .from('nomina_pagos')
      .insert({ ...input, total_pagado })
      .select()
      .single();
    if (error) throw error;
    return data as PayrollEntry;
  },

  // ===== Dashboard =====
  getDashboardStats: async (sedeId?: string, capacity: number = DEFAULT_CAPACITY): Promise<DashboardStats> => {
    let ordersQuery = supabase.from('ordenes_trabajo').select('*');
    if (sedeId) ordersQuery = ordersQuery.eq('sede_id', sedeId);
    const { data: ordersData, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;
    const orders = ordersData || [];

    let txnQuery = supabase.from('finanzas_movimientos').select('*');
    if (sedeId) txnQuery = txnQuery.eq('sede_id', sedeId);
    const { data: txnData } = await txnQuery;
    const transactions = txnData || [];

    let customerQuery = supabase.from('clientes').select('id, creado_en');
    if (sedeId) customerQuery = customerQuery.eq('sede_id', sedeId);
    const { data: customerData } = await customerQuery;
    const customers = customerData || [];

    const now = new Date();
    const activeOrders = orders.filter((o) => !['finalizado', 'entregado'].includes(o.estatus));
    const finishedThisMonth = orders.filter(
      (o) => o.estatus === 'finalizado' && o.fecha_finalizacion && isSameMonth(o.fecha_finalizacion, now)
    );

    const incomeMonth = transactions
      .filter((t) => t.tipo === 'ingreso' && isSameMonth(t.fecha, now))
      .reduce((sum, t) => sum + Number(t.monto), 0);
    const expenseMonth = transactions
      .filter((t) => t.tipo === 'egreso' && isSameMonth(t.fecha, now))
      .reduce((sum, t) => sum + Number(t.monto), 0);

    const statusCounts: Record<OrderStatus, number> = {
      recepcion: 0,
      en_proceso: 0,
      espera_repuestos: 0,
      finalizado: 0,
      entregado: 0,
    };
    orders.forEach((o) => {
      statusCounts[o.estatus as OrderStatus] = (statusCounts[o.estatus as OrderStatus] || 0) + 1;
    });

    const ingresos_por_mes: { mes: string; ingresos: number; egresos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ingresos = transactions
        .filter((t) => t.tipo === 'ingreso' && isSameMonth(t.fecha, ref))
        .reduce((sum, t) => sum + Number(t.monto), 0);
      const egresos = transactions
        .filter((t) => t.tipo === 'egreso' && isSameMonth(t.fecha, ref))
        .reduce((sum, t) => sum + Number(t.monto), 0);
      ingresos_por_mes.push({ mes: ref.toLocaleDateString('es', { month: 'short' }), ingresos, egresos });
    }

    return {
      ordenes_activas: activeOrders.length,
      ordenes_finalizadas_mes: finishedThisMonth.length,
      ingresos_mes: incomeMonth,
      egresos_mes: expenseMonth,
      clientes_nuevos_mes: customers.filter((c) => isSameMonth(c.creado_en, now)).length,
      tasa_ocupacion: Math.min(100, Math.round((activeOrders.length / capacity) * 100)),
      ordenes_por_estatus: statusCounts,
      ingresos_por_mes,
    };
  },
};
