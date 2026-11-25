import { describe, expect, it } from 'vitest';
import { pluralKey } from './plural';

describe('pluralKey', () => {
  it('usa One solo cuando n es 1 y Many para 0, negativos o mayores que 1', () => {
    expect(pluralKey('commission.taskCount', 1)).toBe('commission.taskCountOne');
    expect(pluralKey('commission.taskCount', 0)).toBe('commission.taskCountMany');
    expect(pluralKey('commission.taskCount', 2)).toBe('commission.taskCountMany');
    expect(pluralKey('commission.taskCount', 15)).toBe('commission.taskCountMany');
    expect(pluralKey('commission.taskCount', -1)).toBe('commission.taskCountMany');
  });
});
