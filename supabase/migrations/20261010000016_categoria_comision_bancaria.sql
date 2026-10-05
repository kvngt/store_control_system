-- ------------------------------------------------------------------------------------
-- Categoría de Finanzas: comisiones del banco y de la tarjeta
-- ------------------------------------------------------------------------------------
-- Decisión del taller (05/10/2026, docs/analisis-del-proceso-2026-10.md §C): cobran con
-- tarjeta por Clover, y el estado de cuenta trae cada mes "BANKCARD DISCOUNT FEE",
-- "BANKCARD FEE" y "CLOVER FEE". Sin una categoría propia esos cargos se mezclaban con los
-- gastos de operación y Finanzas no cuadraba con el banco.
--
-- Va sola en su migración: un valor nuevo de un enum no se puede usar en la misma
-- transacción que lo agrega, y el CLI corre cada archivo en una. La siguiente migración ya
-- lo usa.
-- ------------------------------------------------------------------------------------

ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'comision_bancaria';
