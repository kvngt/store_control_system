## 2024-05-30 - useMemo optimization for O(N) array filtering
**Learning:** Found several top-level React components (`WorkOrders.tsx`, `Customers.tsx`, `Vehicles.tsx`, `Finance.tsx`) performing extensive array filtering (`.filter()`) mapping over `.toLowerCase()` string comparisons during each re-render. Given that these components have many states controlling modals or input values, these recalculations caused unneeded CPU cycles.
**Action:** When filtering array items derived from search inputs in complex React components with multiple state variables, always wrap the resulting array in a `useMemo` hook with proper dependency tracking to avoid computing them synchronously on each re-render, and extract expensive operations (like `.toLowerCase()`) to outside the loop.
## 2024-06-03 - O(5N) kanban column grouping refactor
**Learning:** `KanbanBoard.tsx` mapped over columns array, running a full `.filter()` over all orders on each iteration. For 5 columns, this caused 5 complete iterations over the entire list on every render (O(5N)).
**Action:** Use a single `useMemo` pass to group items by status into an object (O(N)), avoiding redundant loops in column rendering.
