-- =====================================================================================
-- Crear el primer administrador (cuando no queda ninguno)
-- =====================================================================================
-- Si no hay ningún administrador, nadie puede entrar a Configuración → Personal para
-- crear cuentas, y el registro público está apagado a propósito. Esto lo resuelve
-- quien tenga acceso al panel de Supabase:
--
--   1. Panel → Authentication → Users → Add user → Create new user.
--      Correo y contraseña (mínimo 8) y marcar "Auto Confirm User".
--   2. Panel → SQL Editor: pegar esto, cambiar los tres valores y correrlo.
--   3. Entrar a la app con ese correo. Desde ahí se crean las demás cuentas.
--
-- Si no existe ninguna sede, crea una con el nombre indicado. Si la cuenta ya tiene
-- perfil, lo convierte en administrador. Probado contra el Supabase local.
--
-- Al final hay una variante para crear también la cuenta de Auth por SQL, si no se
-- quiere usar el panel.
-- =====================================================================================
DO $$
DECLARE
  v_email  TEXT := 'CAMBIAR-correo@ejemplo.com';   -- el de la cuenta creada en el paso 1
  v_nombre TEXT := 'CAMBIAR Nombre Apellido';
  v_sede   TEXT := 'CAMBIAR Nombre del taller';    -- solo se usa si no hay ninguna sede
  v_user   UUID;
  v_sede_id UUID;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No existe una cuenta con el correo %. Créala primero en Authentication → Users.', v_email;
  END IF;

  SELECT id INTO v_sede_id FROM sedes ORDER BY fecha_creacion NULLS LAST, nombre LIMIT 1;
  IF v_sede_id IS NULL THEN
    INSERT INTO sedes (nombre, direccion, telefono) VALUES (v_sede, '', '') RETURNING id INTO v_sede_id;
  END IF;

  INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email)
  VALUES (v_user, v_nombre, 'admin', v_sede_id, v_email)
  ON CONFLICT (id) DO UPDATE SET rol = 'admin';

  RAISE NOTICE 'Listo: % es administrador.', v_email;
END $$;


-- =====================================================================================
-- Variante: crear también la cuenta de Auth por SQL (en vez del paso 1 del panel)
-- =====================================================================================
-- Úsala solo si no puedes entrar al panel. Escribe la contraseña aquí abajo, corre el
-- bloque y **borra la contraseña del archivo** (el historial del editor la conserva).
-- Después entra a la app y cámbiala desde Configuración.
--
-- El detalle que hace fallar a casi todas las recetas que circulan: las columnas de
-- token de `auth.users` son de texto y Auth no sabe leerlas en NULL. Si se dejan sin
-- valor, iniciar sesión responde 500 "Database error querying schema". Van en cadena
-- vacía. La fila de `auth.identities` también es obligatoria: sin ella, Auth no
-- reconoce el inicio de sesión con correo. Probado contra el Supabase local.
/*
DO $$
DECLARE
  v_email TEXT := 'CAMBIAR-correo@ejemplo.com';
  v_pass  TEXT := 'CAMBIAR-contraseña';       -- mínimo 8 caracteres
  v_user  UUID := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_email)) THEN
    RAISE EXCEPTION 'Ya existe una cuenta con el correo %.', v_email;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    lower(v_email), extensions.crypt(v_pass, extensions.gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(),
    '', '', '', '', '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_user,
    jsonb_build_object('sub', v_user::text, 'email', lower(v_email), 'email_verified', true),
    'email', v_user::text, NOW(), NOW()
  );

  RAISE NOTICE 'Cuenta creada: %. Ahora corre el bloque de arriba para darle el perfil de admin.', v_email;
END $$;
*/
