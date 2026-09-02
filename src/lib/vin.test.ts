import { describe, it, expect } from 'vitest';
import {
  checkUsPlate,
  checkVin,
  localModelsForMake,
  normalizeVin,
  vinModelYear,
  yearOptions,
} from './vin';

// Real VINs with valid check digits, used across the automotive industry as
// reference values: a 2003 Honda Accord and a 1989 truck whose check digit is X.
const ACCORD_2003 = '1HGCM82633A004352';
const CHECK_DIGIT_X = '1M8GDM9AXKP042788';

describe('checkVin', () => {
  it('accepts a VIN whose check digit is correct', () => {
    expect(checkVin(ACCORD_2003)).toEqual({ level: 'ok', normalized: ACCORD_2003 });
  });

  it('accepts X as the check digit', () => {
    expect(checkVin(CHECK_DIGIT_X).level).toBe('ok');
  });

  it('normalizes spaces, dashes and lower case before checking', () => {
    expect(checkVin(' 1hgcm826-33a004352 ')).toEqual({ level: 'ok', normalized: ACCORD_2003 });
  });

  it('rejects a VIN that is not 17 characters', () => {
    expect(checkVin('1HGCM8263')).toMatchObject({ level: 'error', problem: 'LENGTH' });
  });

  it('rejects the letters I, O and Q, which VINs never use', () => {
    expect(checkVin('1HGCM8263IA004352')).toMatchObject({ level: 'error', problem: 'CHARSET' });
    expect(checkVin('1HGCM8263OA004352')).toMatchObject({ level: 'error', problem: 'CHARSET' });
    expect(checkVin('1HGCM8263QA004352')).toMatchObject({ level: 'error', problem: 'CHARSET' });
  });

  it('only warns on a bad check digit, since grey imports legitimately fail it', () => {
    // One digit of the serial changed, so the checksum no longer adds up.
    expect(checkVin('1HGCM82633A004353')).toMatchObject({ level: 'warn', problem: 'CHECKSUM' });
  });
});

describe('normalizeVin', () => {
  it('upper-cases and strips separators', () => {
    expect(normalizeVin('1hgcm826 33a-004352')).toBe(ACCORD_2003);
  });
});

describe('vinModelYear', () => {
  const now = new Date('2026-09-02');

  it('reads a pre-2010 year when position 7 is a digit', () => {
    expect(vinModelYear(ACCORD_2003, now)).toBe(2003);
    expect(vinModelYear(CHECK_DIGIT_X, now)).toBe(1989);
  });

  it('reads a post-2010 year when position 7 is a letter', () => {
    expect(vinModelYear('5YJ3E1EA7JF005339', now)).toBe(2018);
  });

  it('falls back to the older cycle rather than returning a future year', () => {
    // Position 7 is a letter, so the rule points at 2033 — which cannot be right.
    expect(vinModelYear('1HGCM8A633A004352', now)).toBe(2003);
  });

  it('returns null when there is no full VIN to read', () => {
    expect(vinModelYear('1HGCM8263', now)).toBeNull();
  });
});

describe('checkUsPlate', () => {
  it('accepts a plate that matches the format of its state', () => {
    expect(checkUsPlate('7ABC123', 'CA')).toMatchObject({ level: 'ok', normalized: '7ABC123' });
    expect(checkUsPlate('abc 1234', 'TX')).toMatchObject({ level: 'ok', normalized: 'ABC1234' });
  });

  it('accepts any plausible plate when no state is given', () => {
    expect(checkUsPlate('HELLO').level).toBe('ok');
  });

  it('warns, but does not block, when the format is unusual for the state', () => {
    // A New York vanity plate: legal, just not the standard AAA1234 series.
    expect(checkUsPlate('HELLO', 'NY')).toMatchObject({ level: 'warn', problem: 'UNUSUAL' });
  });

  it('rejects characters no US jurisdiction issues', () => {
    expect(checkUsPlate('ABC*123')).toMatchObject({ level: 'error', problem: 'CHARSET' });
  });

  it('rejects plates that are too short or too long', () => {
    expect(checkUsPlate('A')).toMatchObject({ level: 'error', problem: 'LENGTH' });
    expect(checkUsPlate('ABCD12345')).toMatchObject({ level: 'error', problem: 'LENGTH' });
    expect(checkUsPlate('')).toMatchObject({ level: 'error', problem: 'LENGTH' });
  });

  it('ignores the separators people type between groups', () => {
    expect(checkUsPlate('abc-1234', 'NY')).toMatchObject({ level: 'ok', normalized: 'ABC1234' });
  });
});

describe('yearOptions', () => {
  it('starts one year ahead of today and counts backwards', () => {
    const years = yearOptions(2020, new Date('2026-09-02'));
    expect(years).toEqual([2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  });
});

describe('localModelsForMake', () => {
  it('suggests models for a known brand, however it was typed', () => {
    expect(localModelsForMake('  toYOta ')).toContain('Camry');
  });

  it('returns nothing for a brand it has never heard of', () => {
    expect(localModelsForMake('Delorean')).toEqual([]);
  });
});
