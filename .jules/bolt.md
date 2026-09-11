## 2024-03-20 - Kanban Board O(N) Array Re-filtering
**Learning:** Found multiple `O(N)` `Array.filter` loops over the same un-memoized array occurring on every render in the `KanbanBoard` for categorizing tickets into columns and calculating capacity.
**Action:** Always look for duplicate linear searches/filters over the same array that could be batched into a single `useMemo` reduced grouping object instead.
