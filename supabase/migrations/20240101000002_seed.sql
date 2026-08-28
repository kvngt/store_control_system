-- RESTORIFY SEED DATA

-- Sedes
INSERT INTO sedes (id, nombre, direccion, telefono, fecha_creacion) VALUES
('b87f11ea-011f-4726-b160-10d8ebd60337', 'El Arca Auto Body - Main', '1234 Main Street, Silver Spring, MD 20901', '(301) 555-0100', '2023-01-15'),
('b2530f41-0f27-4ad5-8b61-aad9d5b98810', 'El Arca Auto Body - Branch', '5678 Georgia Ave, Wheaton, MD 20902', '(301) 555-0200', '2024-06-01');

-- Users (Auth)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES
('04f98d2a-1c85-447c-8141-207fd69ad52e', 'admin@restorify.com', '{"name": "Carlos Mendoza"}', '2023-01-15', '2023-01-15'),
('77338b7c-1aa0-49d7-8f2f-7d013af33cea', 'roberto@restorify.com', '{"name": "Roberto García"}', '2023-02-01', '2023-02-01'),
('388f9040-c4e7-4df5-990c-a7d7365a1cf1', 'miguel@restorify.com', '{"name": "Miguel Ángel Torres"}', '2023-03-10', '2023-03-10'),
('7e308fc8-1afa-4156-ac98-5eea92141cdf', 'jose@restorify.com', '{"name": "José Luis Ramírez"}', '2023-04-20', '2023-04-20'),
('fecc7434-567d-42ce-8bfe-b6311e432707', 'david@restorify.com', '{"name": "David Hernández"}', '2023-05-15', '2023-05-15'),
('92c330e9-6601-41d9-8947-411d928ec4a3', 'fernando@restorify.com', '{"name": "Fernando López"}', '2023-06-01', '2023-06-01'),
('b188608a-53dc-43df-b214-3d7a14307027', 'pedro@restorify.com', '{"name": "Pedro Sánchez"}', '2024-01-10', '2024-01-10');

-- Perfiles
INSERT INTO perfiles (id, nombre_completo, rol, sede_id, telefono, email, creado_en) VALUES
('04f98d2a-1c85-447c-8141-207fd69ad52e', 'Carlos Mendoza', 'admin', 'b87f11ea-011f-4726-b160-10d8ebd60337', '(301) 555-0101', 'admin@restorify.com', '2023-01-15'),
('77338b7c-1aa0-49d7-8f2f-7d013af33cea', 'Roberto García', 'admin', 'b2530f41-0f27-4ad5-8b61-aad9d5b98810', '(301) 555-0201', 'roberto@restorify.com', '2023-02-01'),
('388f9040-c4e7-4df5-990c-a7d7365a1cf1', 'Miguel Ángel Torres', 'mecanico', 'b87f11ea-011f-4726-b160-10d8ebd60337', '(301) 555-0301', 'miguel@restorify.com', '2023-03-10'),
('7e308fc8-1afa-4156-ac98-5eea92141cdf', 'José Luis Ramírez', 'mecanico', 'b87f11ea-011f-4726-b160-10d8ebd60337', '(301) 555-0302', 'jose@restorify.com', '2023-04-20'),
('fecc7434-567d-42ce-8bfe-b6311e432707', 'David Hernández', 'pintor', 'b87f11ea-011f-4726-b160-10d8ebd60337', '(301) 555-0303', 'david@restorify.com', '2023-05-15'),
('92c330e9-6601-41d9-8947-411d928ec4a3', 'Fernando López', 'pintor', 'b2530f41-0f27-4ad5-8b61-aad9d5b98810', '(301) 555-0304', 'fernando@restorify.com', '2023-06-01'),
('b188608a-53dc-43df-b214-3d7a14307027', 'Pedro Sánchez', 'mecanico', 'b2530f41-0f27-4ad5-8b61-aad9d5b98810', '(301) 555-0305', 'pedro@restorify.com', '2024-01-10');

-- Clientes
INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, notas_crm, creado_en) VALUES
('889b31b9-9f00-4180-9c26-c986a4392c7d', 'b87f11ea-011f-4726-b160-10d8ebd60337', 'María Elena Rodríguez', '(301) 555-1001', 'maria@email.com', '789 Oak Street', 'VIP', '2023-06-15'),
('d8bf74c8-d6f4-40a5-adf4-35a6a3320c9f', 'b87f11ea-011f-4726-b160-10d8ebd60337', 'James Thompson', '(240) 555-2002', 'james@email.com', '456 Pine Ave', 'Referido', '2023-08-20'),
('9155fe9a-fbf5-4fea-b577-742efc9964d8', 'b87f11ea-011f-4726-b160-10d8ebd60337', 'Ana Patricia González', '(301) 555-3003', 'ana@email.com', '321 Elm Dr', 'Primera', '2024-01-10'),
('ce3a8588-e52c-442b-92ce-8f9e37f25b60', 'b2530f41-0f27-4ad5-8b61-aad9d5b98810', 'Robert Williams', '(240) 555-4004', 'rob@email.com', '654 Maple Ct', 'Empresarial', '2024-03-05');

-- Vehiculos
INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color, creado_en) VALUES
('c28f25a6-6e7a-4b08-8f5c-5f7bf6189185', '889b31b9-9f00-4180-9c26-c986a4392c7d', 'Toyota', 'Camry', 2021, '4T1B', 'MD-ABC1234', 'Blanco', '2023-06-15'),
('a4556402-b3ec-4aaa-87b8-f64f95991790', '889b31b9-9f00-4180-9c26-c986a4392c7d', 'Honda', 'CR-V', 2019, '5J6R', 'MD-DEF5678', 'Gris', '2023-06-15'),
('c0585bd3-4d59-4f0d-abc4-f236716e69e2', 'd8bf74c8-d6f4-40a5-adf4-35a6a3320c9f', 'Ford', 'F-150', 2022, '1FTF', 'MD-GHI9012', 'Azul', '2023-08-20'),
('849d26c0-c7bf-456b-8b68-5f58c9ac0a26', '9155fe9a-fbf5-4fea-b577-742efc9964d8', 'Chevrolet', 'Malibu', 2020, '1G1Z', 'MD-JKL3456', 'Rojo', '2024-01-10'),
('dc5ba6ca-77b6-43af-b0f9-9f4b9e8a0335', 'ce3a8588-e52c-442b-92ce-8f9e37f25b60', 'RAM', '1500', 2023, '1C6S', 'MD-MNO7890', 'Negro', '2024-03-05');

