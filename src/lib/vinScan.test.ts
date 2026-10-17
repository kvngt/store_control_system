import { describe, it, expect } from 'vitest';
import { vinFromBarcode } from './vinScan';

describe('vinFromBarcode', () => {
  it('extracts valid 17-char VIN directly', () => {
    expect(vinFromBarcode('1HGCM82633A004352')).toBe('1HGCM82633A004352');
  });

  it('removes leading "I" from 18-char Code 39 barcode (con "I" delante)', () => {
    expect(vinFromBarcode('I1HGCM82633A004352')).toBe('1HGCM82633A004352');
    expect(vinFromBarcode('i1hgcm82633a004352')).toBe('1HGCM82633A004352');
  });

  it('tolerates dashes and whitespace (con guiones)', () => {
    expect(vinFromBarcode('1HG-CM82633-A004352')).toBe('1HGCM82633A004352');
    expect(vinFromBarcode('I-1HG-CM82633-A004352')).toBe('1HGCM82633A004352');
    expect(vinFromBarcode('   1HGCM82633A004352  \n')).toBe('1HGCM82633A004352');
  });

  it('rejects VIN with 16 characters (de 16 caracteres)', () => {
    expect(vinFromBarcode('1HGCM82633A00435')).toBeNull();
  });

  it('rejects VIN containing forbidden character "O" (con "O" inválido)', () => {
    expect(vinFromBarcode('1HGCM82633O004352')).toBeNull();
  });

  it('rejects other invalid inputs and forbidden characters', () => {
    expect(vinFromBarcode('invalid')).toBeNull();
    expect(vinFromBarcode('')).toBeNull();
    expect(vinFromBarcode(null)).toBeNull();
    expect(vinFromBarcode(undefined)).toBeNull();
    // 17 characters ending with 'I'
    expect(vinFromBarcode('1HGCM82633A00435I')).toBeNull();
    // 17 characters with 'Q'
    expect(vinFromBarcode('1HGCM82633Q004352')).toBeNull();
  });
});
