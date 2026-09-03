# Reporte de QA — Restorify
**Fecha:** 3 de septiembre de 2026  
**Entorno probado:** `reinventa.shop` (producción)  
**Metodología:** Análisis estático de código + Tests E2E automatizados (Playwright)

---

## Resumen ejecutivo

| Categoría | Resultado |
|---|---|
| Tests E2E ejecutados | 65 |
| Pasaron | 65 / 65 ✅ |
| Bugs en código encontrados (estático) | 5 |
| Riesgo alto | 1 |
| Riesgo medio | 2 |
| Riesgo bajo | 2 |

---

## 🔴 HALLAZGOS DE RIESGO ALTO

### BUG-01 · Botón PDF solo visible para administradores
**Archivo:** `src/pages/WorkOrders.tsx` (línea 792)  
**Descripción:** El botón "Generar PDF / Reporte" solo se renderiza cuando el usuario es administrador (`user?.rol === 'admin'`). Un mecánico o pintor asignado a una orden no puede generar el reporte para entregarlo al cliente cuando finaliza el trabajo, lo que genera fricción operativa real.

**Corrección sugerida:**
```tsx
// Mostrar el PDF a cualquier usuario asignado a la orden o admins
{(isAdmin || isAssignedToMe) && (
  <button ... onClick={handleGeneratePdf}>PDF</button>
)}
```

---

## 🟡 HALLAZGOS DE RIESGO MEDIO

### BUG-02 · Texto `estatus_tarea` expuesto en inglés interno a usuarios finales
**Archivo:** `src/pages/WorkOrders.tsx` (línea 1298)  
**Descripción:** El campo `estatus_tarea` (valores de BD: `pendiente`, `en_curso`, `completada`) se renderiza directamente en la interfaz sin pasar por `t(...)` (i18n). El usuario ve texto interno de la base de datos en lugar de un texto amigable o traducido adecuadamente.

**Corrección sugerida:** Agregar a `translations.ts` las claves de estado de tarea y utilizarlas.

---

### BUG-03 · Texto "Total Labor" hardcodeado en inglés
**Archivo:** `src/pages/WorkOrders.tsx` (línea 1059)  
**Descripción:** La etiqueta de total de mano de obra en la tabla de detalle de orden está hardcodeada como "Total Labor" en inglés, en lugar de usar i18n como el resto de la aplicación (ej. `t('workOrders.totalLabor')`).

**Corrección sugerida:**
```tsx
<td style={{ fontWeight: 700 }}>{t('workOrders.totalLabor')}</td>
```

---

## 🟢 HALLAZGOS DE RIESGO BAJO

### BUG-04 · Selector `createSede` usa `prompt()` nativo del navegador
**Archivo:** `src/pages/Settings.tsx` (líneas 197-200)  
**Descripción:** La creación de nuevas sedes usa `window.prompt()`, un diálogo nativo del navegador sin estilos que no respeta el diseño de la aplicación y puede estar bloqueado en algunos navegadores/contextos móviles.

**Corrección sugerida:** Reemplazar por un modal de React con un `<input>` estilizado, al igual que para la creación de empleados.

---

### BUG-05 · `deleteTransaction` no tiene interfaz de usuario
**Archivo:** `src/services/supabaseService.ts` (líneas 640-643)  
**Descripción:** El servicio tiene el método `deleteTransaction`, pero no hay un botón en la UI de Finanzas (`Finance.tsx`) para eliminar una transacción manual errónea. Los administradores tendrían que entrar a la base de datos directamente.

**Corrección sugerida:** Agregar un botón de eliminar (exclusivo de administradores) en cada fila de la tabla de transacciones.

---

## Resultados de Tests E2E Automatizados

Se desarrolló una suite completa de pruebas end-to-end con **65 casos de prueba** divididos en 6 archivos en la carpeta `e2e/`.

Todos los selectores conflictivos por traducciones (i18n) o modales dinámicos fueron corregidos para ser robustos.

| Archivo | Tests | Estado |
|---|---|---|
| `qa-auth.spec.ts` | 12 | ✅ 12/12 PASS |
| `qa-rbac.spec.ts` | 14 | ✅ 14/14 PASS |
| `qa-workorders.spec.ts` | 11 | ✅ 11/11 PASS |
| `qa-customers-vehicles.spec.ts` | 10 | ✅ 10/10 PASS |
| `qa-finance-payroll.spec.ts` | 10 | ✅ 10/10 PASS |
| `qa-settings.spec.ts` | 8 | ✅ 8/8 PASS |

**Total:** 65/65 tests exitosos (100% de aprobación).

---

## Recomendaciones para lanzamiento

1. **Bugfixes**: Solucionar `BUG-01` de inmediato, ya que bloquea a mecánicos y pintores. Los problemas de i18n (`BUG-02` y `BUG-03`) pueden ir al próximo sprint, pero afean el proyecto.
2. **Setup de Testing**: Actualmente la suite de E2E corre directamente contra producción (`reinventa.shop`). Se recomienda enfáticamente configurar un entorno de Supabase separado (staging/testing) para evitar llenar la BD real de datos basura, como clientes de prueba y transacciones ficticias.

*Reporte generado automáticamente. Para ejecutar los tests localmente:*
`npx playwright test e2e/qa-*.spec.ts --reporter=line`
