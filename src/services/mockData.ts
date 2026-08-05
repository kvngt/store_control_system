// ===================================================
// RESTORIFY — Mock Data Service
// Realistic demo data for development without Supabase
// ===================================================

import type {
  Sede,
  UserProfile,
  Customer,
  Vehicle,
  WorkOrder,
  LaborItem,
  OrderAssignment,
  WorkOrderPart,
  FinancialTransaction,
  PayrollEntry,
  DashboardStats,
} from '../types/database';


// ===== Sedes =====
export const mockSedes: Sede[] = [
  {
    id: 'sede-001',
    nombre: 'El Arca Auto Body - Main',
    direccion: '1234 Main Street, Silver Spring, MD 20901',
    telefono: '(301) 555-0100',
    fecha_creacion: '2023-01-15',
  },
  {
    id: 'sede-002',
    nombre: 'El Arca Auto Body - Branch',
    direccion: '5678 Georgia Ave, Wheaton, MD 20902',
    telefono: '(301) 555-0200',
    fecha_creacion: '2024-06-01',
  },
];

// ===== Users =====
export const mockUsers: UserProfile[] = [
  {
    id: 'user-001',
    nombre_completo: 'Carlos Mendoza',
    rol: 'admin',
    sede_id: 'sede-001',
    telefono: '(301) 555-0101',
    email: 'admin@restorify.com',
    creado_en: '2023-01-15',
  },
  {
    id: 'user-002',
    nombre_completo: 'Roberto García',
    rol: 'admin',
    sede_id: 'sede-002',
    telefono: '(301) 555-0201',
    email: 'roberto@restorify.com',
    creado_en: '2023-02-01',
  },
  {
    id: 'user-003',
    nombre_completo: 'Miguel Ángel Torres',
    rol: 'mecanico',
    sede_id: 'sede-001',
    telefono: '(301) 555-0301',
    email: 'miguel@restorify.com',
    creado_en: '2023-03-10',
  },
  {
    id: 'user-004',
    nombre_completo: 'José Luis Ramírez',
    rol: 'mecanico',
    sede_id: 'sede-001',
    telefono: '(301) 555-0302',
    email: 'jose@restorify.com',
    creado_en: '2023-04-20',
  },
  {
    id: 'user-005',
    nombre_completo: 'David Hernández',
    rol: 'pintor',
    sede_id: 'sede-001',
    telefono: '(301) 555-0303',
    email: 'david@restorify.com',
    creado_en: '2023-05-15',
  },
  {
    id: 'user-006',
    nombre_completo: 'Fernando López',
    rol: 'pintor',
    sede_id: 'sede-002',
    telefono: '(301) 555-0304',
    email: 'fernando@restorify.com',
    creado_en: '2023-06-01',
  },
  {
    id: 'user-007',
    nombre_completo: 'Pedro Sánchez',
    rol: 'mecanico',
    sede_id: 'sede-002',
    telefono: '(301) 555-0305',
    email: 'pedro@restorify.com',
    creado_en: '2024-01-10',
  },
];

// ===== Customers =====
export const mockCustomers: Customer[] = [
  {
    id: 'cust-001',
    sede_id: 'sede-001',
    nombre: 'María Elena Rodríguez',
    telefono: '(301) 555-1001',
    email: 'maria.rodriguez@email.com',
    direccion: '789 Oak Street, Silver Spring, MD 20901',
    notas_crm: 'Cliente frecuente, prefiere comunicación por WhatsApp. Tiene 2 vehículos.',
    creado_en: '2023-06-15',
    vehiculos_count: 2,
    ordenes_count: 5,
  },
  {
    id: 'cust-002',
    sede_id: 'sede-001',
    nombre: 'James Thompson',
    telefono: '(240) 555-2002',
    email: 'james.t@email.com',
    direccion: '456 Pine Ave, Bethesda, MD 20814',
    notas_crm: 'Referido por María Rodríguez. Interesado en servicio de pintura completa.',
    creado_en: '2023-08-20',
    vehiculos_count: 1,
    ordenes_count: 2,
  },
  {
    id: 'cust-003',
    sede_id: 'sede-001',
    nombre: 'Ana Patricia González',
    telefono: '(301) 555-3003',
    email: 'ana.gonzalez@email.com',
    direccion: '321 Elm Drive, Rockville, MD 20850',
    notas_crm: 'Primera visita. Necesita reparación de colisión frontal.',
    creado_en: '2024-01-10',
    vehiculos_count: 1,
    ordenes_count: 1,
  },
  {
    id: 'cust-004',
    sede_id: 'sede-002',
    nombre: 'Robert Williams',
    telefono: '(240) 555-4004',
    email: 'r.williams@email.com',
    direccion: '654 Maple Court, Wheaton, MD 20902',
    notas_crm: 'Cliente empresarial - tiene flota de 3 vehículos de trabajo.',
    creado_en: '2024-03-05',
    vehiculos_count: 3,
    ordenes_count: 4,
  },
  {
    id: 'cust-005',
    sede_id: 'sede-001',
    nombre: 'Luis Fernando Pérez',
    telefono: '(301) 555-5005',
    email: 'luis.perez@email.com',
    direccion: '987 Cedar Lane, Takoma Park, MD 20912',
    notas_crm: 'Mecánica regular cada 6 meses. Próximo servicio: Agosto 2026.',
    creado_en: '2024-05-18',
    vehiculos_count: 1,
    ordenes_count: 3,
  },
  {
    id: 'cust-006',
    sede_id: 'sede-002',
    nombre: 'Sarah Mitchell',
    telefono: '(240) 555-6006',
    email: 'sarah.m@email.com',
    direccion: '123 Birch Road, Kensington, MD 20895',
    notas_crm: 'Requiere detailing completo cada trimestre.',
    creado_en: '2024-07-22',
    vehiculos_count: 2,
    ordenes_count: 2,
  },
  {
    id: 'cust-007',
    sede_id: 'sede-001',
    nombre: 'Ricardo Alfredo Morales',
    telefono: '(301) 555-7007',
    email: 'ricardo.morales@email.com',
    direccion: '246 Walnut Street, College Park, MD 20740',
    notas_crm: 'Restauración de vehículo clásico en progreso.',
    creado_en: '2024-09-30',
    vehiculos_count: 1,
    ordenes_count: 1,
  },
  {
    id: 'cust-008',
    sede_id: 'sede-001',
    nombre: 'Jennifer Davis',
    telefono: '(240) 555-8008',
    email: 'jen.davis@email.com',
    direccion: '890 Spruce Blvd, Gaithersburg, MD 20877',
    notas_crm: 'Accidente menor en estacionamiento. Seguro State Farm.',
    creado_en: '2025-01-14',
    vehiculos_count: 1,
    ordenes_count: 1,
  },
];

// ===== Vehicles =====
export const mockVehicles: Vehicle[] = [
  { id: 'veh-001', cliente_id: 'cust-001', marca: 'Toyota', modelo: 'Camry', anio: 2021, vin: '4T1BF1FK5CU512345', placa: 'MD-ABC1234', color: 'Blanco Perla', creado_en: '2023-06-15', cliente_nombre: 'María Elena Rodríguez' },
  { id: 'veh-002', cliente_id: 'cust-001', marca: 'Honda', modelo: 'CR-V', anio: 2019, vin: '5J6RW1H85KA123456', placa: 'MD-DEF5678', color: 'Gris Oscuro', creado_en: '2023-06-15', cliente_nombre: 'María Elena Rodríguez' },
  { id: 'veh-003', cliente_id: 'cust-002', marca: 'Ford', modelo: 'F-150', anio: 2022, vin: '1FTFW1E85NF654321', placa: 'MD-GHI9012', color: 'Azul Metálico', creado_en: '2023-08-20', cliente_nombre: 'James Thompson' },
  { id: 'veh-004', cliente_id: 'cust-003', marca: 'Chevrolet', modelo: 'Malibu', anio: 2020, vin: '1G1ZD5ST7LF234567', placa: 'MD-JKL3456', color: 'Rojo', creado_en: '2024-01-10', cliente_nombre: 'Ana Patricia González' },
  { id: 'veh-005', cliente_id: 'cust-004', marca: 'RAM', modelo: '1500', anio: 2023, vin: '1C6SRFFT5PN789012', placa: 'MD-MNO7890', color: 'Negro', creado_en: '2024-03-05', cliente_nombre: 'Robert Williams' },
  { id: 'veh-006', cliente_id: 'cust-004', marca: 'Chevrolet', modelo: 'Silverado', anio: 2021, vin: '3GCUYED73MG345678', placa: 'MD-PQR1234', color: 'Blanco', creado_en: '2024-03-05', cliente_nombre: 'Robert Williams' },
  { id: 'veh-007', cliente_id: 'cust-004', marca: 'Ford', modelo: 'Transit', anio: 2022, vin: '1FTBW2CM7NK901234', placa: 'MD-STU5678', color: 'Blanco', creado_en: '2024-03-05', cliente_nombre: 'Robert Williams' },
  { id: 'veh-008', cliente_id: 'cust-005', marca: 'Nissan', modelo: 'Altima', anio: 2020, vin: '1N4BL4BV0LC567890', placa: 'MD-VWX9012', color: 'Plata', creado_en: '2024-05-18', cliente_nombre: 'Luis Fernando Pérez' },
  { id: 'veh-009', cliente_id: 'cust-006', marca: 'BMW', modelo: 'X3', anio: 2022, vin: '5UXTY5C0XN9876543', placa: 'MD-YZA3456', color: 'Azul Mineral', creado_en: '2024-07-22', cliente_nombre: 'Sarah Mitchell' },
  { id: 'veh-010', cliente_id: 'cust-006', marca: 'Mercedes-Benz', modelo: 'GLC 300', anio: 2023, vin: 'W1N0J8DB5PF210987', placa: 'MD-BCD7890', color: 'Negro Obsidiana', creado_en: '2024-07-22', cliente_nombre: 'Sarah Mitchell' },
  { id: 'veh-011', cliente_id: 'cust-007', marca: 'Ford', modelo: 'Mustang', anio: 1969, vin: '9F02Z123456789012', placa: 'MD-EFG1234', color: 'Verde Highland', creado_en: '2024-09-30', cliente_nombre: 'Ricardo Alfredo Morales' },
  { id: 'veh-012', cliente_id: 'cust-008', marca: 'Hyundai', modelo: 'Tucson', anio: 2024, vin: '5NMJFDAF2RH654321', placa: 'MD-HIJ5678', color: 'Gris Amazon', creado_en: '2025-01-14', cliente_nombre: 'Jennifer Davis' },
];

// ===== Work Orders =====
export const mockLaborItems: LaborItem[] = [
  { id: 'lab-001', orden_id: 'wo-001', descripcion: 'Alineación y balanceo', costo: 150.00 },
  { id: 'lab-002', orden_id: 'wo-001', descripcion: 'Cambio de aceite y filtro', costo: 85.00 },
  { id: 'lab-003', orden_id: 'wo-001', descripcion: 'Revisión de frenos', costo: 120.00 },
  { id: 'lab-004', orden_id: 'wo-002', descripcion: 'Pintura completa bumper delantero', costo: 450.00 },
  { id: 'lab-005', orden_id: 'wo-002', descripcion: 'Reparación de abolladura puerta izquierda', costo: 280.00 },
  { id: 'lab-006', orden_id: 'wo-003', descripcion: 'Reparación colisión frontal', costo: 1200.00 },
  { id: 'lab-007', orden_id: 'wo-003', descripcion: 'Pintura capó y guardabarros', costo: 800.00 },
  { id: 'lab-008', orden_id: 'wo-004', descripcion: 'Diagnóstico electrónico', costo: 95.00 },
  { id: 'lab-009', orden_id: 'wo-004', descripcion: 'Cambio de alternador', costo: 350.00 },
  { id: 'lab-010', orden_id: 'wo-005', descripcion: 'Restauración de carrocería', costo: 3500.00 },
  { id: 'lab-011', orden_id: 'wo-005', descripcion: 'Pintura completa clásica', costo: 4200.00 },
  { id: 'lab-012', orden_id: 'wo-006', descripcion: 'Reparación bumper trasero', costo: 350.00 },
  { id: 'lab-013', orden_id: 'wo-006', descripcion: 'Pintura parcial', costo: 280.00 },
];

export const mockWorkOrderParts: WorkOrderPart[] = [
  { id: 'part-001', orden_id: 'wo-001', descripcion: 'Filtro de aceite sintético', cantidad: 1, costo_unitario: 12.00, precio_venta_unitario: 18.00, subtotal: 18.00 },
  { id: 'part-002', orden_id: 'wo-001', descripcion: 'Aceite motor 5W-30 (5Qt)', cantidad: 1, costo_unitario: 28.00, precio_venta_unitario: 42.00, subtotal: 42.00 },
  { id: 'part-003', orden_id: 'wo-002', descripcion: 'Pintura automotriz OEM', cantidad: 2, costo_unitario: 85.00, precio_venta_unitario: 120.00, subtotal: 240.00 },
  { id: 'part-004', orden_id: 'wo-003', descripcion: 'Bumper delantero', cantidad: 1, costo_unitario: 380.00, precio_venta_unitario: 520.00, subtotal: 520.00 },
  { id: 'part-005', orden_id: 'wo-003', descripcion: 'Faro izquierdo', cantidad: 1, costo_unitario: 210.00, precio_venta_unitario: 290.00, subtotal: 290.00 },
  { id: 'part-006', orden_id: 'wo-003', descripcion: 'Pintura y clear coat', cantidad: 3, costo_unitario: 75.00, precio_venta_unitario: 110.00, subtotal: 330.00 },
  { id: 'part-007', orden_id: 'wo-004', descripcion: 'Alternador reconstruido', cantidad: 1, costo_unitario: 180.00, precio_venta_unitario: 265.00, subtotal: 265.00 },
  { id: 'part-008', orden_id: 'wo-004', descripcion: 'Correa del alternador', cantidad: 1, costo_unitario: 22.00, precio_venta_unitario: 35.00, subtotal: 35.00 },
  { id: 'part-009', orden_id: 'wo-005', descripcion: 'Kit de restauración de carrocería', cantidad: 1, costo_unitario: 850.00, precio_venta_unitario: 1200.00, subtotal: 1200.00 },
  { id: 'part-010', orden_id: 'wo-005', descripcion: 'Pintura personalizada clásica', cantidad: 5, costo_unitario: 120.00, precio_venta_unitario: 180.00, subtotal: 900.00 },
  { id: 'part-011', orden_id: 'wo-006', descripcion: 'Bumper trasero', cantidad: 1, costo_unitario: 290.00, precio_venta_unitario: 420.00, subtotal: 420.00 },
];

export const mockAssignments: OrderAssignment[] = [
  { id: 'asgn-001', orden_id: 'wo-001', usuario_id: 'user-003', tipo_tarea: 'mecanica', estatus_tarea: 'completada' },
  { id: 'asgn-002', orden_id: 'wo-002', usuario_id: 'user-005', tipo_tarea: 'pintura', estatus_tarea: 'en_curso' },
  { id: 'asgn-003', orden_id: 'wo-003', usuario_id: 'user-004', tipo_tarea: 'mecanica', estatus_tarea: 'en_curso' },
  { id: 'asgn-004', orden_id: 'wo-003', usuario_id: 'user-005', tipo_tarea: 'pintura', estatus_tarea: 'pendiente' },
  { id: 'asgn-005', orden_id: 'wo-004', usuario_id: 'user-007', tipo_tarea: 'mecanica', estatus_tarea: 'en_curso' },
  { id: 'asgn-006', orden_id: 'wo-005', usuario_id: 'user-003', tipo_tarea: 'mecanica', estatus_tarea: 'en_curso' },
  { id: 'asgn-007', orden_id: 'wo-005', usuario_id: 'user-006', tipo_tarea: 'pintura', estatus_tarea: 'pendiente' },
  { id: 'asgn-008', orden_id: 'wo-006', usuario_id: 'user-004', tipo_tarea: 'mecanica', estatus_tarea: 'completada' },
  { id: 'asgn-009', orden_id: 'wo-006', usuario_id: 'user-005', tipo_tarea: 'pintura', estatus_tarea: 'completada' },
];

export const mockWorkOrders: WorkOrder[] = [
  {
    id: 'wo-001',
    numero_orden: 'ORD-2026-001',
    sede_id: 'sede-001',
    cliente_id: 'cust-001',
    vehiculo_id: 'veh-001',
    tipo_trabajo: 'mecanica',
    estatus: 'finalizado',
    millas_ingreso: 45230,
    nivel_gasolina: '75%',
    deposito_inicial: 200.00,
    inspeccion_360_notas: 'Vehículo en buen estado general. Rayón menor en puerta trasera derecha.',
    fecha_ingreso: '2026-07-15',
    fecha_estimada_entrega: '2026-07-18',
    fecha_finalizacion: '2026-07-17',
    porcentaje_avance: 100,
    total_labor: 355.00,
    total_repuestos: 60.00,
    total_general: 415.00,
    creado_por: 'user-001',
    creado_en: '2026-07-15',
  },
  {
    id: 'wo-002',
    numero_orden: 'ORD-2026-002',
    sede_id: 'sede-001',
    cliente_id: 'cust-002',
    vehiculo_id: 'veh-003',
    tipo_trabajo: 'pintura',
    estatus: 'en_proceso',
    millas_ingreso: 32150,
    nivel_gasolina: '50%',
    deposito_inicial: 300.00,
    inspeccion_360_notas: 'Abolladura en puerta izquierda. Bumper delantero con rayones profundos.',
    fecha_ingreso: '2026-07-28',
    fecha_estimada_entrega: '2026-08-05',
    porcentaje_avance: 65,
    total_labor: 730.00,
    total_repuestos: 240.00,
    total_general: 970.00,
    creado_por: 'user-001',
    creado_en: '2026-07-28',
  },
  {
    id: 'wo-003',
    numero_orden: 'ORD-2026-003',
    sede_id: 'sede-001',
    cliente_id: 'cust-003',
    vehiculo_id: 'veh-004',
    tipo_trabajo: 'combinado',
    estatus: 'en_proceso',
    millas_ingreso: 58720,
    nivel_gasolina: '25%',
    deposito_inicial: 500.00,
    inspeccion_360_notas: 'Colisión frontal. Daño en bumper, faro izquierdo y capó. Airbags no desplegados.',
    fecha_ingreso: '2026-07-30',
    fecha_estimada_entrega: '2026-08-12',
    porcentaje_avance: 35,
    total_labor: 2000.00,
    total_repuestos: 1140.00,
    total_general: 3140.00,
    creado_por: 'user-001',
    creado_en: '2026-07-30',
  },
  {
    id: 'wo-004',
    numero_orden: 'ORD-2026-004',
    sede_id: 'sede-002',
    cliente_id: 'cust-004',
    vehiculo_id: 'veh-005',
    tipo_trabajo: 'mecanica',
    estatus: 'espera_repuestos',
    millas_ingreso: 18500,
    nivel_gasolina: '90%',
    deposito_inicial: 100.00,
    inspeccion_360_notas: 'Problema eléctrico. Batería no carga. Vehículo en buen estado exterior.',
    fecha_ingreso: '2026-08-01',
    fecha_estimada_entrega: '2026-08-06',
    porcentaje_avance: 40,
    total_labor: 445.00,
    total_repuestos: 300.00,
    total_general: 745.00,
    creado_por: 'user-002',
    creado_en: '2026-08-01',
  },
  {
    id: 'wo-005',
    numero_orden: 'ORD-2026-005',
    sede_id: 'sede-001',
    cliente_id: 'cust-007',
    vehiculo_id: 'veh-011',
    tipo_trabajo: 'combinado',
    estatus: 'en_proceso',
    millas_ingreso: 89430,
    nivel_gasolina: '10%',
    deposito_inicial: 2000.00,
    inspeccion_360_notas: 'Restauración completa de Mustang 1969. Carrocería con oxidación moderada. Motor necesita rebuild parcial.',
    fecha_ingreso: '2026-06-15',
    fecha_estimada_entrega: '2026-09-30',
    porcentaje_avance: 22,
    total_labor: 7700.00,
    total_repuestos: 2100.00,
    total_general: 9800.00,
    creado_por: 'user-001',
    creado_en: '2026-06-15',
  },
  {
    id: 'wo-006',
    numero_orden: 'ORD-2026-006',
    sede_id: 'sede-001',
    cliente_id: 'cust-008',
    vehiculo_id: 'veh-012',
    tipo_trabajo: 'combinado',
    estatus: 'entregado',
    millas_ingreso: 5200,
    nivel_gasolina: '60%',
    deposito_inicial: 200.00,
    inspeccion_360_notas: 'Golpe menor en estacionamiento. Bumper trasero dañado.',
    fecha_ingreso: '2026-07-10',
    fecha_estimada_entrega: '2026-07-15',
    fecha_finalizacion: '2026-07-14',
    porcentaje_avance: 100,
    total_labor: 630.00,
    total_repuestos: 420.00,
    total_general: 1050.00,
    creado_por: 'user-001',
    creado_en: '2026-07-10',
  },
  {
    id: 'wo-007',
    numero_orden: 'ORD-2026-007',
    sede_id: 'sede-001',
    cliente_id: 'cust-005',
    vehiculo_id: 'veh-008',
    tipo_trabajo: 'mecanica',
    estatus: 'recepcion',
    millas_ingreso: 67800,
    nivel_gasolina: '45%',
    deposito_inicial: 0,
    inspeccion_360_notas: 'Servicio de mantenimiento regular. Sin daños visibles.',
    fecha_ingreso: '2026-08-04',
    fecha_estimada_entrega: '2026-08-06',
    porcentaje_avance: 0,
    total_labor: 0,
    total_repuestos: 0,
    total_general: 0,
    creado_por: 'user-001',
    creado_en: '2026-08-04',
  },
];

// ===== Financial Transactions =====
export const mockTransactions: FinancialTransaction[] = [
  { id: 'txn-001', sede_id: 'sede-001', orden_id: 'wo-001', tipo: 'ingreso', categoria: 'pago_cliente', monto: 415.00, descripcion: 'Pago completo - Toyota Camry - María Rodríguez', fecha: '2026-07-17', creado_en: '2026-07-17' },
  { id: 'txn-002', sede_id: 'sede-001', orden_id: 'wo-006', tipo: 'ingreso', categoria: 'pago_cliente', monto: 1050.00, descripcion: 'Pago completo - Hyundai Tucson - Jennifer Davis', fecha: '2026-07-14', creado_en: '2026-07-14' },
  { id: 'txn-003', sede_id: 'sede-001', tipo: 'egreso', categoria: 'compra_repuesto', monto: 1450.00, descripcion: 'Compra de inventario de repuestos - Proveedor AutoZone', fecha: '2026-07-20', creado_en: '2026-07-20' },
  { id: 'txn-004', sede_id: 'sede-001', tipo: 'egreso', categoria: 'planilla', monto: 4500.00, descripcion: 'Planilla quincenal Jul-15 a Jul-31', fecha: '2026-07-31', creado_en: '2026-07-31' },
  { id: 'txn-005', sede_id: 'sede-001', tipo: 'egreso', categoria: 'gasto_operativo', monto: 850.00, descripcion: 'Renta del local - Agosto 2026', fecha: '2026-08-01', creado_en: '2026-08-01' },
  { id: 'txn-006', sede_id: 'sede-002', tipo: 'egreso', categoria: 'gasto_operativo', monto: 650.00, descripcion: 'Renta del local Branch - Agosto 2026', fecha: '2026-08-01', creado_en: '2026-08-01' },
  { id: 'txn-007', sede_id: 'sede-001', orden_id: 'wo-003', tipo: 'ingreso', categoria: 'pago_cliente', monto: 500.00, descripcion: 'Depósito inicial - Chevrolet Malibu - Ana González', fecha: '2026-07-30', creado_en: '2026-07-30' },
  { id: 'txn-008', sede_id: 'sede-001', orden_id: 'wo-005', tipo: 'ingreso', categoria: 'pago_cliente', monto: 2000.00, descripcion: 'Depósito inicial - Ford Mustang 1969 - Ricardo Morales', fecha: '2026-06-15', creado_en: '2026-06-15' },
  { id: 'txn-009', sede_id: 'sede-002', orden_id: 'wo-004', tipo: 'ingreso', categoria: 'pago_cliente', monto: 100.00, descripcion: 'Depósito inicial - RAM 1500 - Robert Williams', fecha: '2026-08-01', creado_en: '2026-08-01' },
  { id: 'txn-010', sede_id: 'sede-001', tipo: 'egreso', categoria: 'compra_repuesto', monto: 850.00, descripcion: 'Kit restauración Mustang - Proveedor ClassicParts.com', fecha: '2026-06-20', creado_en: '2026-06-20' },
];

// ===== Payroll =====
export const mockPayroll: PayrollEntry[] = [
  { id: 'pay-001', sede_id: 'sede-001', usuario_id: 'user-003', periodo_inicio: '2026-07-01', periodo_fin: '2026-07-15', salario_base: 2000.00, bonos: 150.00, deducciones: 320.00, total_pagado: 1830.00, fecha_pago: '2026-07-15' },
  { id: 'pay-002', sede_id: 'sede-001', usuario_id: 'user-004', periodo_inicio: '2026-07-01', periodo_fin: '2026-07-15', salario_base: 1800.00, bonos: 100.00, deducciones: 285.00, total_pagado: 1615.00, fecha_pago: '2026-07-15' },
  { id: 'pay-003', sede_id: 'sede-001', usuario_id: 'user-005', periodo_inicio: '2026-07-01', periodo_fin: '2026-07-15', salario_base: 2200.00, bonos: 200.00, deducciones: 360.00, total_pagado: 2040.00, fecha_pago: '2026-07-15' },
  { id: 'pay-004', sede_id: 'sede-002', usuario_id: 'user-006', periodo_inicio: '2026-07-01', periodo_fin: '2026-07-15', salario_base: 2000.00, bonos: 0, deducciones: 300.00, total_pagado: 1700.00, fecha_pago: '2026-07-15' },
  { id: 'pay-005', sede_id: 'sede-002', usuario_id: 'user-007', periodo_inicio: '2026-07-01', periodo_fin: '2026-07-15', salario_base: 1900.00, bonos: 100.00, deducciones: 300.00, total_pagado: 1700.00, fecha_pago: '2026-07-15' },
];

// ===== Dashboard Stats =====
export const mockDashboardStats: DashboardStats = {
  ordenes_activas: 4,
  ordenes_finalizadas_mes: 2,
  ingresos_mes: 4065.00,
  egresos_mes: 7450.00,
  clientes_nuevos_mes: 1,
  tasa_ocupacion: 67,
  ordenes_por_estatus: {
    recepcion: 1,
    en_proceso: 3,
    espera_repuestos: 1,
    finalizado: 1,
    entregado: 1,
  },
  ingresos_por_mes: [
    { mes: 'Mar', ingresos: 8500, egresos: 6200 },
    { mes: 'Abr', ingresos: 12300, egresos: 8100 },
    { mes: 'May', ingresos: 9800, egresos: 7500 },
    { mes: 'Jun', ingresos: 11200, egresos: 8900 },
    { mes: 'Jul', ingresos: 14500, egresos: 10200 },
    { mes: 'Ago', ingresos: 4065, egresos: 7450 },
  ],
};

// ===== Enrichment Helpers =====
export function getWorkOrderWithDetails(orderId: string): WorkOrder | undefined {
  const order = mockWorkOrders.find(o => o.id === orderId);
  if (!order) return undefined;

  return {
    ...order,
    cliente: mockCustomers.find(c => c.id === order.cliente_id),
    vehiculo: mockVehicles.find(v => v.id === order.vehiculo_id),
    asignaciones: mockAssignments
      .filter(a => a.orden_id === orderId)
      .map(a => ({ ...a, usuario: mockUsers.find(u => u.id === a.usuario_id) })),
    labor_items: mockLaborItems.filter(l => l.orden_id === orderId),
    repuestos: mockWorkOrderParts.filter(p => p.orden_id === orderId),
    fotos: [],
  };
}

export function getCustomerWithVehicles(customerId: string) {
  const customer = mockCustomers.find(c => c.id === customerId);
  if (!customer) return undefined;

  const vehicles = mockVehicles.filter(v => v.cliente_id === customerId);
  const orders = mockWorkOrders.filter(o => o.cliente_id === customerId);

  return { customer, vehicles, orders };
}

export function getStatsBySede(sedeId?: string): DashboardStats {
  if (!sedeId) return mockDashboardStats;

  const filteredOrders = mockWorkOrders.filter(o => o.sede_id === sedeId);
  const activeOrders = filteredOrders.filter(o => !['finalizado', 'entregado'].includes(o.estatus));

  const statusCounts = {
    recepcion: 0,
    en_proceso: 0,
    espera_repuestos: 0,
    finalizado: 0,
    entregado: 0,
  };
  filteredOrders.forEach(o => { statusCounts[o.estatus]++; });

  return {
    ...mockDashboardStats,
    ordenes_activas: activeOrders.length,
    ordenes_por_estatus: statusCounts,
  };
}
