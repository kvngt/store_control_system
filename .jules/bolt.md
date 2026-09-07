## 2024-05-30 - useMemo optimization for O(N) array filtering
**Learning:** Found several top-level React components (`WorkOrders.tsx`, `Customers.tsx`, `Vehicles.tsx`, `Finance.tsx`) performing extensive array filtering (`.filter()`) mapping over `.toLowerCase()` string comparisons during each re-render. Given that these components have many states controlling modals or input values, these recalculations caused unneeded CPU cycles.
**Action:** When filtering array items derived from search inputs in complex React components with multiple state variables, always wrap the resulting array in a `useMemo` hook with proper dependency tracking to avoid computing them synchronously on each re-render, and extract expensive operations (like `.toLowerCase()`) to outside the loop.

## 2026-09-07 - Kanban board filtering
**Learning:** KanbanBoard was doing 6 separate O(N) .filter passes on the whole orders array every render (one for capacity calculation, five for the columns). With drag-and-drop state updating rapidly, this meant 6 array allocations and 6 passes per drag event.
**Action:** Replaced multiple filters with a single pass grouped by status in useMemo. Always try to combine derived array transformations into a single loop to reduce allocations and work.
