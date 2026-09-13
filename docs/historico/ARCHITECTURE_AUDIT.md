# Auditoría de Arquitectura - Restorify (React 19 + TypeScript + Vite + Supabase)

Como Arquitecto de Software Senior, he revisado a fondo la base de código actual del proyecto Restorify. A continuación, presento un análisis detallado estructurado según los puntos solicitados, diseñado especialmente para facilitar tu transición desde el paradigma OOP de Python hacia las mejores prácticas funcionales del ecosistema moderno de React.

---

## 1. Auditoría de Modularidad y Separación de Responsabilidades

En React moderno, la separación de responsabilidades no se logra con clases (como en OOP), sino dividiendo la lógica de UI (componentes de presentación), la lógica de negocio/estado (Custom Hooks) y la capa de acceso a datos (servicios/APIs).

**Hallazgos Críticos:**
* **Componentes Monolíticos ("God Components"):**
  * El archivo `src/pages/WorkOrders.tsx` tiene más de 2,000 líneas de código. Contiene estados complejos (decenas de `useState`), lógica de carga, validaciones de formularios, interacción directa con servicios, cálculos y un renderizado masivo. Esto es el equivalente funcional al anti-patrón "God Object" en OOP.
  * `src/pages/Finance.tsx` (~500 líneas) y `src/pages/Dashboard.tsx` (~370 líneas) también muestran tendencias monolíticas.
* **Capa de Servicios Monolítica:**
  * `src/services/supabaseService.ts` es un archivo único de casi 900 líneas que maneja *absolutamente todas* las peticiones a la base de datos (clientes, vehículos, finanzas, usuarios, sedes). Esto dificulta el mantenimiento, la colaboración simultánea (conflictos de merge) y viola el Principio de Responsabilidad Única (SRP).
* **Falta de Componentes de Presentación ("Dumb Components"):**
  * La lógica de negocio está fuertemente acoplada a la vista. En `WorkOrders.tsx`, el formulario para crear/editar no está abstraído, haciendo imposible reutilizarlo o probarlo de forma aislada.

---

## 2. Estado y Flujo de Datos

**Hallazgos Críticos:**
* **Manejo Manual del "Server State":**
  * Estás utilizando el patrón `useEffect` + `useState` (`loading`, `error`, `data`) para cargar datos de la base de datos en los componentes. Este patrón es propenso a "race conditions", no tiene caché en memoria, y fuerza re-renderizados innecesarios.
* **Sobrecarga de Estado Local (Local State Hell):**
  * En `WorkOrders.tsx`, tener un estado para cada campo del formulario o para cada variable de control visual crea un componente inmanejable.
* **Uso de Contextos:**
  * El uso de contextos (`AuthContext`, `LanguageContext`, etc.) está bien implementado para configuraciones globales. Sin embargo, hay que tener cuidado: cualquier actualización en un Contexto renderiza de nuevo *todos* los componentes que lo consumen.

---

## 3. Estándares de Documentación y Tipado

**Hallazgos Críticos:**
* **Tipado de TypeScript (`src/types/database.ts`):**
  * Tienes un buen punto de partida. Las interfaces reflejan fielmente el modelo de base de datos. Sin embargo, tener todos los tipos en un solo archivo pronto será inmanejable.
  * Hay "Virtual fields from joins" mezclados con las entidades base.
* **Comentarios en el Código:**
  * Existen comentarios útiles que explican el *porqué* (ej. notas sobre RLS en el servicio), lo cual es excelente. Sin embargo, falta documentación estándar en funciones y componentes críticos.

**Estándar Ágil Propuesto (TSDoc):**
Usa el formato estándar `TSDoc` (similar a los Docstrings de Python) solo en las interfaces públicas, custom hooks complejos y funciones de utilidad, describiendo qué hace, sus parámetros y qué retorna.

```typescript
/**
 * Calcula el costo total de los repuestos y la mano de obra.
 * @param laborItems - Lista de trabajos realizados.
 * @param parts - Lista de repuestos utilizados.
 * @returns El monto total de la orden.
 */
```

---

## 4. Hoja de Ruta de Refactorización (Plan de Acción Paso a Paso)

Para erradicar el "código espagueti" sin romper el sistema, debemos usar una estrategia de refactorización progresiva (Strangler Fig Pattern), priorizando las órdenes de trabajo y finanzas.

### Fase 1: Capa de Acceso a Datos y "Server State" (Semanas 1-2)
* **Paso 1.1:** Instalar y configurar **TanStack Query (React Query)**. Esta librería es el estándar de la industria para manejar datos remotos, reemplazando los `useEffect` de carga de datos, proveyendo caché, reintentos e invalidación automática.
* **Paso 1.2:** Desacoplar `supabaseService.ts`. Dividirlo en módulos por dominio bajo una nueva carpeta `src/services/`:
  * `auth.service.ts`
  * `workOrders.service.ts`
  * `finance.service.ts`
  * `customer.service.ts`

### Fase 2: Refactorización de Órdenes de Trabajo (`WorkOrders.tsx`) (Semanas 3-4)
Este componente crítico debe desmantelarse.
* **Paso 2.1 (Estado):** Extraer la lógica compleja de estado a "Custom Hooks". Por ejemplo: `useWorkOrders()`, `useWorkOrderForm()`.
* **Paso 2.2 (Componentización):** Dividir la interfaz en componentes más pequeños en `src/features/workOrders/components/`:
  * `WorkOrderList.tsx` (Tabla principal)
  * `WorkOrderForm.tsx` (Modal de creación)
  * `Inspection360.tsx` (Componente de fotos)
  * `LaborAndPartsTable.tsx` (Grid de edición)
* **Paso 2.3:** Integrar React Query en los Custom Hooks para obtener las órdenes y mutaciones (crear, actualizar), eliminando los `useState` de `loading` y `error`.

### Fase 3: Refactorización de Finanzas (`Finance.tsx`) (Semana 5)
* **Paso 3.1:** Crear `src/features/finance/components/` y extraer `TransactionList`, `FinanceStats`, `ImportStatementModal` (actualmente importado perezosamente, lo cual está bien, pero el resto necesita estructurarse).
* **Paso 3.2:** Reemplazar las peticiones a `getTransactions` y `getDashboardStats` con React Query.

### Fase 4: Estructuración y Tipado (Semana 6)
* **Paso 4.1:** Dividir `database.ts` en dominios (`types/auth.types.ts`, `types/workOrder.types.ts`, etc.).
* **Paso 4.2 (Gestión de Formularios):** Implementar **React Hook Form** + **Zod** para el manejo de formularios complejos. Esto eliminará el 80% de los `useState` manuales vinculados a inputs y mejorará drásticamente la validación y el rendimiento.

### Conclusión para tu mentalidad OOP:
En lugar de crear "Clases Base" y heredar comportamientos, en este ecosistema creamos **Funciones (Hooks)** para abstraer la lógica y **Componentes Pequeños (UI)** que se componen unos dentro de otros. La inyección de dependencias y el estado global fluyen a través de Hooks y Contextos. Aplicando esta ruta, Restorify pasará de ser un prototipo monolítico a una aplicación de grado empresarial escalable y mantenible.