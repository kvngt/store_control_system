const crypto = require('crypto');
const fs = require('fs');

const uuid = () => crypto.randomUUID();

// Generate deterministic UUIDs for mapping
const sedes = {
  main: uuid(),
  branch: uuid()
};

const users = {
  admin1: uuid(),
  admin2: uuid(),
  mec1: uuid(),
  mec2: uuid(),
  pin1: uuid(),
  pin2: uuid(),
  mec3: uuid()
};

const customers = {
  c1: uuid(),
  c2: uuid(),
  c3: uuid(),
  c4: uuid(),
  c5: uuid(),
  c6: uuid(),
  c7: uuid(),
  c8: uuid()
};

const vehicles = {
  v1: uuid(),
  v2: uuid(),
  v3: uuid(),
  v4: uuid(),
  v5: uuid(),
  v6: uuid(),
  v7: uuid(),
  v8: uuid(),
  v9: uuid(),
  v10: uuid(),
  v11: uuid(),
  v12: uuid()
};

let sql = `-- RESTORIFY SEED DATA\n\n`;

// SEDES
sql += `-- Sedes\n`;
sql += `INSERT INTO sedes (id, nombre, direccion, telefono, fecha_creacion) VALUES\n`;
sql += `('${sedes.main}', 'El Arca Auto Body - Main', '1234 Main Street, Silver Spring, MD 20901', '(301) 555-0100', '2023-01-15'),\n`;
sql += `('${sedes.branch}', 'El Arca Auto Body - Branch', '5678 Georgia Ave, Wheaton, MD 20902', '(301) 555-0200', '2024-06-01');\n\n`;

// PERFILES (We need to insert into auth.users first if there's a FK constraint)
// Wait! `perfiles.id` REFERENCES `auth.users(id)`. 
// If we insert into `perfiles`, we MUST have corresponding `auth.users`. 
// For seeding purposes, we can bypass or we can insert into auth.users first.
sql += `-- Users (Auth)\n`;
sql += `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES\n`;
sql += `('${users.admin1}', 'admin@restorify.com', '{"name": "Carlos Mendoza"}', '2023-01-15', '2023-01-15'),\n`;
sql += `('${users.admin2}', 'roberto@restorify.com', '{"name": "Roberto García"}', '2023-02-01', '2023-02-01'),\n`;
sql += `('${users.mec1}', 'miguel@restorify.com', '{"name": "Miguel Ángel Torres"}', '2023-03-10', '2023-03-10'),\n`;
sql += `('${users.mec2}', 'jose@restorify.com', '{"name": "José Luis Ramírez"}', '2023-04-20', '2023-04-20'),\n`;
sql += `('${users.pin1}', 'david@restorify.com', '{"name": "David Hernández"}', '2023-05-15', '2023-05-15'),\n`;
sql += `('${users.pin2}', 'fernando@restorify.com', '{"name": "Fernando López"}', '2023-06-01', '2023-06-01'),\n`;
sql += `('${users.mec3}', 'pedro@restorify.com', '{"name": "Pedro Sánchez"}', '2024-01-10', '2024-01-10');\n\n`;

sql += `-- Perfiles\n`;
sql += `INSERT INTO perfiles (id, nombre_completo, rol, sede_id, telefono, email, creado_en) VALUES\n`;
sql += `('${users.admin1}', 'Carlos Mendoza', 'admin', '${sedes.main}', '(301) 555-0101', 'admin@restorify.com', '2023-01-15'),\n`;
sql += `('${users.admin2}', 'Roberto García', 'admin', '${sedes.branch}', '(301) 555-0201', 'roberto@restorify.com', '2023-02-01'),\n`;
sql += `('${users.mec1}', 'Miguel Ángel Torres', 'mecanico', '${sedes.main}', '(301) 555-0301', 'miguel@restorify.com', '2023-03-10'),\n`;
sql += `('${users.mec2}', 'José Luis Ramírez', 'mecanico', '${sedes.main}', '(301) 555-0302', 'jose@restorify.com', '2023-04-20'),\n`;
sql += `('${users.pin1}', 'David Hernández', 'pintor', '${sedes.main}', '(301) 555-0303', 'david@restorify.com', '2023-05-15'),\n`;
sql += `('${users.pin2}', 'Fernando López', 'pintor', '${sedes.branch}', '(301) 555-0304', 'fernando@restorify.com', '2023-06-01'),\n`;
sql += `('${users.mec3}', 'Pedro Sánchez', 'mecanico', '${sedes.branch}', '(301) 555-0305', 'pedro@restorify.com', '2024-01-10');\n\n`;

sql += `-- Clientes\n`;
sql += `INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, notas_crm, creado_en) VALUES\n`;
sql += `('${customers.c1}', '${sedes.main}', 'María Elena Rodríguez', '(301) 555-1001', 'maria@email.com', '789 Oak Street', 'VIP', '2023-06-15'),\n`;
sql += `('${customers.c2}', '${sedes.main}', 'James Thompson', '(240) 555-2002', 'james@email.com', '456 Pine Ave', 'Referido', '2023-08-20'),\n`;
sql += `('${customers.c3}', '${sedes.main}', 'Ana Patricia González', '(301) 555-3003', 'ana@email.com', '321 Elm Dr', 'Primera', '2024-01-10'),\n`;
sql += `('${customers.c4}', '${sedes.branch}', 'Robert Williams', '(240) 555-4004', 'rob@email.com', '654 Maple Ct', 'Empresarial', '2024-03-05');\n\n`;

sql += `-- Vehiculos\n`;
sql += `INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color, creado_en) VALUES\n`;
sql += `('${vehicles.v1}', '${customers.c1}', 'Toyota', 'Camry', 2021, '4T1B', 'MD-ABC1234', 'Blanco', '2023-06-15'),\n`;
sql += `('${vehicles.v2}', '${customers.c1}', 'Honda', 'CR-V', 2019, '5J6R', 'MD-DEF5678', 'Gris', '2023-06-15'),\n`;
sql += `('${vehicles.v3}', '${customers.c2}', 'Ford', 'F-150', 2022, '1FTF', 'MD-GHI9012', 'Azul', '2023-08-20'),\n`;
sql += `('${vehicles.v4}', '${customers.c3}', 'Chevrolet', 'Malibu', 2020, '1G1Z', 'MD-JKL3456', 'Rojo', '2024-01-10'),\n`;
sql += `('${vehicles.v5}', '${customers.c4}', 'RAM', '1500', 2023, '1C6S', 'MD-MNO7890', 'Negro', '2024-03-05');\n\n`;

// Insert the script into a file
fs.writeFileSync('supabase/seed.sql', sql);
console.log('Seed SQL generated successfully.');
