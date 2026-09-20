-- ------------------------------------------------------------------------------------
-- Quitar los permisos que sobran en funciones internas
-- ------------------------------------------------------------------------------------
-- Postgres concede EXECUTE a PUBLIC al crear una función, y Supabase añade anon y
-- authenticated. La regla del proyecto (docs/ai-context.md §2.2) dice revocarlo siempre,
-- pero las funciones anteriores a esa regla nunca se limpiaron: el avisor de seguridad de
-- Supabase levanta 87 avisos por eso.
--
-- NINGUNO ES EXPLOTABLE, comprobado llamándolas con la clave anónima: PostgREST no publica
-- las funciones que devuelven `trigger` y responde 404. Se limpia igual, porque 87 avisos
-- falsos esconderían el verdadero el día que aparezca.
--
-- ------------------------------------------------------------------------------------
-- LO QUE NO SE TOCA, Y POR QUÉ
-- ------------------------------------------------------------------------------------
-- `is_admin()`, `current_user_role()`, `current_user_sede_id()` e `is_assigned_to_order()`
-- CONSERVAN su EXECUTE para `authenticated`. No es un descuido: las expresiones de una
-- política de RLS se evalúan con los permisos de QUIEN CONSULTA, no del dueño de la tabla.
--
-- Comprobado en la base local antes de escribir esto:
--
--     REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;
--     SET ROLE authenticated;  SELECT count(*) FROM clientes;
--     --> ERROR: permission denied for function is_admin
--
-- Es decir: revocarlas "por seguir la regla" dejaría la aplicación entera sin poder leer
-- nada. Tampoco filtran: sin sesión devuelven `false` y `null`.
--
-- El avisor va a seguir marcándolas. Es un falso positivo conocido y esta nota es la
-- respuesta.

REVOKE ALL ON FUNCTION public.cleanup_order_finance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_delivered_order_adjustment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_order_delivery_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_check_orden_sede() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_commission_payment_expense() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_commissions_on_amounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_commissions_on_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_commissions_on_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_commissions_on_rate_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_create_order_montos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_delivered_order_children() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_notificacion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_orden_media() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_order_money() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_order_montos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_perfil_privilegios() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_order_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_order_finished() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_order_delivery_reversal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_order_deposit_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_part_cost_follows_price() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_parts_expense_on_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_parts_expense_on_delivery() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recalc_labor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recalc_parts_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_set_numero_orden() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_set_part_subtotal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_set_progress_on_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_set_vehiculo_sede() FROM PUBLIC, anon, authenticated;

-- `app_schema_version()` le decía a cualquiera con la clave pública qué versión del esquema
-- está desplegada. La app la llama con sesión, así que basta con quitársela a `anon`.
REVOKE ALL ON FUNCTION public.app_schema_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_schema_version() TO authenticated;
