import { describe, it, expect } from 'vitest';
import { isLikelyInternalTransfer, suggestCategory } from './categorizationRules';
import type { CategorizationRule } from '../types/database';

const RULES: CategorizationRule[] = [
  { id: '1', patron: 'autozone', categoria: 'compra_repuesto', activo: true },
  { id: '2', patron: 'monthly service fee', categoria: 'gasto_operativo', activo: true },
  { id: '3', patron: 'zelle from', categoria: 'pago_cliente', activo: true },
  { id: '4', patron: 'inactive rule', categoria: 'gasto_operativo', activo: false },
];

describe('isLikelyInternalTransfer', () => {
  it('flags transfers to another of the owner\'s own accounts', () => {
    expect(isLikelyInternalTransfer('Online Transfer to Godinez Gonzalez C Everyday Checking xxxxxx9319')).toBe(true);
  });

  it('flags transfers from another of the owner\'s own accounts', () => {
    expect(isLikelyInternalTransfer('Online Transfer from Savings')).toBe(true);
  });

  it('does not flag a real vendor purchase', () => {
    expect(isLikelyInternalTransfer('Purchase authorized on 06/02 Autozone 1844 4920 Annap')).toBe(false);
  });

  it('does not flag an inbound Zelle payment', () => {
    expect(isLikelyInternalTransfer('Zelle From Jesus Duran Mendoza on 06/03')).toBe(false);
  });
});

describe('suggestCategory', () => {
  it('matches a known vendor case-insensitively', () => {
    expect(suggestCategory('Purchase authorized on 06/02 AUTOZONE 1844 4920 Annap', RULES)).toBe('compra_repuesto');
  });

  it('matches a bank fee description', () => {
    expect(suggestCategory('Monthly Service Fee', RULES)).toBe('gasto_operativo');
  });

  it('matches an inbound Zelle as a client payment', () => {
    expect(suggestCategory('Zelle From Jesus Duran Mendoza on 06/03 Ref # Bacp90I3Dmuc', RULES)).toBe('pago_cliente');
  });

  it('returns null when nothing matches, forcing manual review', () => {
    expect(suggestCategory('Zelle to Carlos Gonzalez on 06/02', RULES)).toBeNull();
  });

  it('ignores rules marked inactive', () => {
    expect(suggestCategory('this is an inactive rule match', RULES)).toBeNull();
  });
});
