-- ====================================================================================
-- RESTORIFY — Initial Database Schema
-- ====================================================================================

-- 1. Create Enums
CREATE TYPE user_role AS ENUM ('admin', 'mecanico', 'pintor');
CREATE TYPE work_type AS ENUM ('mecanica', 'pintura', 'combinado');
CREATE TYPE order_status AS ENUM ('recepcion', 'en_proceso', 'espera_repuestos', 'finalizado', 'entregado');
CREATE TYPE task_status AS ENUM ('pendiente', 'en_curso', 'completada');
CREATE TYPE transaction_type AS ENUM ('ingreso', 'egreso');
CREATE TYPE transaction_category AS ENUM ('pago_cliente', 'compra_repuesto', 'planilla', 'gasto_operativo');

-- 2. Create Core Tables

-- Sedes
CREATE TABLE sedes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  direccion TEXT NOT NULL,
  telefono TEXT NOT NULL,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Profiles (Extends Supabase auth.users)
CREATE TABLE perfiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  rol user_role NOT NULL,
  sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT NOT NULL,
  telefono TEXT,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Customers
CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  direccion TEXT NOT NULL,
  notas_crm TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Vehicles
CREATE TABLE vehiculos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio INTEGER NOT NULL,
  vin TEXT NOT NULL,
  placa TEXT NOT NULL,
  color TEXT NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Work Orders
CREATE TABLE ordenes_trabajo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_orden TEXT UNIQUE NOT NULL,
  sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT NOT NULL,
  vehiculo_id UUID REFERENCES vehiculos(id) ON DELETE RESTRICT NOT NULL,
  tipo_trabajo work_type NOT NULL,
  estatus order_status DEFAULT 'recepcion' NOT NULL,
  millas_ingreso INTEGER NOT NULL,
  nivel_gasolina TEXT NOT NULL,
  deposito_inicial NUMERIC(10,2) DEFAULT 0 NOT NULL,
  inspeccion_360_notas TEXT,
  inspeccion_360_fotos TEXT[] DEFAULT '{}',
  fecha_ingreso TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  fecha_estimada_entrega DATE NOT NULL,
  fecha_finalizacion TIMESTAMP WITH TIME ZONE,
  porcentaje_avance INTEGER DEFAULT 0 NOT NULL,
  total_labor NUMERIC(10,2) DEFAULT 0 NOT NULL,
  total_repuestos NUMERIC(10,2) DEFAULT 0 NOT NULL,
  total_general NUMERIC(10,2) DEFAULT 0 NOT NULL,
  creado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Labor Items
CREATE TABLE orden_labor (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes_trabajo(id) ON DELETE CASCADE NOT NULL,
  descripcion TEXT NOT NULL,
  costo NUMERIC(10,2) NOT NULL
);

-- Work Order Parts
CREATE TABLE orden_repuestos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes_trabajo(id) ON DELETE CASCADE NOT NULL,
  descripcion TEXT NOT NULL,
  numero_parte TEXT,
  cantidad INTEGER NOT NULL DEFAULT 1,
  costo_unitario NUMERIC(10,2) NOT NULL,
  precio_venta_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

-- Order Assignments
CREATE TABLE orden_asignaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes_trabajo(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES perfiles(id) ON DELETE CASCADE NOT NULL,
  tipo_tarea TEXT NOT NULL, -- 'mecanica' | 'pintura'
  estatus_tarea task_status DEFAULT 'pendiente' NOT NULL,
  fecha_asignacion TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Financial Transactions
CREATE TABLE finanzas_movimientos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT NOT NULL,
  tipo transaction_type NOT NULL,
  categoria transaction_category NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  descripcion TEXT NOT NULL,
  fecha DATE NOT NULL,
  referencia_orden_id UUID REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
  registrado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Payroll
CREATE TABLE nomina_pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES perfiles(id) ON DELETE RESTRICT NOT NULL,
  sede_id UUID REFERENCES sedes(id) ON DELETE RESTRICT NOT NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  salario_base NUMERIC(10,2) NOT NULL,
  bonos NUMERIC(10,2) DEFAULT 0 NOT NULL,
  deducciones NUMERIC(10,2) DEFAULT 0 NOT NULL,
  total_pagado NUMERIC(10,2) NOT NULL,
  fecha_pago DATE NOT NULL,
  procesado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ====================================================================================
-- RLS (Row Level Security) Policies
-- ====================================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_repuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomina_pagos ENABLE ROW LEVEL SECURITY;

-- Políticas temporales para la fase de desarrollo (Permitir todo a usuarios autenticados)
-- En producción, esto debería refinarse por `sede_id` y `rol`
CREATE POLICY "Allow all actions for authenticated users" ON sedes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON perfiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON clientes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON vehiculos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON ordenes_trabajo FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON orden_labor FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON orden_repuestos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON orden_asignaciones FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON finanzas_movimientos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all actions for authenticated users" ON nomina_pagos FOR ALL USING (auth.role() = 'authenticated');
