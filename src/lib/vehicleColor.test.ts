import { describe, it, expect } from 'vitest';
import { translateVehicleColor } from './vehicleColor';

describe('translateVehicleColor', () => {
  it('translates "Gris" to "Gray" in English', () => {
    expect(translateVehicleColor('Gris', 'en')).toBe('Gray');
  });

  it('translates "Gray" to "Gris" in Spanish', () => {
    expect(translateVehicleColor('Gray', 'es')).toBe('Gris');
  });

  it('tolerates uppercase, extra spaces, and accents', () => {
    expect(translateVehicleColor('  CAFÉ  ', 'en')).toBe('Brown');
    expect(translateVehicleColor('rojo', 'en')).toBe('Red');
    expect(translateVehicleColor('BLANCO', 'en')).toBe('White');
    expect(translateVehicleColor('púrpura', 'en')).toBe('Purple');
    expect(translateVehicleColor('VINO', 'en')).toBe('Maroon');
    expect(translateVehicleColor('guinda', 'en')).toBe('Maroon');
    expect(translateVehicleColor('azul marino', 'en')).toBe('Navy');
    expect(translateVehicleColor('champán', 'en')).toBe('Champagne');
    expect(translateVehicleColor('plateado', 'en')).toBe('Silver');
  });

  it('translates English colors back to Spanish', () => {
    expect(translateVehicleColor('Navy', 'es')).toBe('Azul marino');
    expect(translateVehicleColor('Maroon', 'es')).toBe('Vino');
    expect(translateVehicleColor('Champagne', 'es')).toBe('Champán');
    expect(translateVehicleColor('Silver', 'es')).toBe('Plata');
  });

  it('returns unknown colors unchanged', () => {
    expect(translateVehicleColor('Azul Medianoche Perla', 'en')).toBe('Azul Medianoche Perla');
    expect(translateVehicleColor('Custom Chameleon Pink', 'es')).toBe('Custom Chameleon Pink');
  });

  it('returns empty string for null, undefined, or empty color', () => {
    expect(translateVehicleColor(null, 'en')).toBe('');
    expect(translateVehicleColor(undefined, 'es')).toBe('');
    expect(translateVehicleColor('', 'en')).toBe('');
    expect(translateVehicleColor('   ', 'es')).toBe('');
  });
});
