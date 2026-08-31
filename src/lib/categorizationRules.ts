import type { CategorizationRule, TransactionCategory } from '../types/database';

// Descriptions matching these patterns are internal transfers between the
// business owner's own accounts (savings, personal checking, a second
// business), not real income or an expense — excluded from import by default
// regardless of which category rules match.
const INTERNAL_TRANSFER_PATTERNS = [
  'online transfer to',
  'online transfer from',
];

export function isLikelyInternalTransfer(descripcion: string): boolean {
  const lower = descripcion.toLowerCase();
  return INTERNAL_TRANSFER_PATTERNS.some((p) => lower.includes(p));
}

// Applies the admin-editable keyword rules (finanzas_reglas_categorizacion)
// to a transaction description. Returns null when nothing matches — the
// reviewer must then pick a category by hand before that row can be imported.
export function suggestCategory(descripcion: string, rules: CategorizationRule[]): TransactionCategory | null {
  const lower = descripcion.toLowerCase();
  for (const rule of rules) {
    if (!rule.activo) continue;
    if (lower.includes(rule.patron.toLowerCase())) return rule.categoria;
  }
  return null;
}
