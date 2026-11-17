import { afterEach, describe, expect, it, vi } from 'vitest';
import { moduloActivo, modulosApagados } from './modulos';

describe('modulosApagados', () => {
  it('devuelve un conjunto vacío si la variable es undefined o vacía', () => {
    expect(modulosApagados(undefined).size).toBe(0);
    expect(modulosApagados('').size).toBe(0);
    expect(modulosApagados('   ,  , ').size).toBe(0);
  });

  it('reconoce la lista separada por comas e ignora espacios y duplicados', () => {
    const off = modulosApagados(' comisiones ,  inspeccion, reloj , comisiones ');
    expect(off).toEqual(new Set(['comisiones', 'inspeccion', 'reloj']));
  });

  it('ignora nombres desconocidos sin fallar', () => {
    const off = modulosApagados('comisiones, modulo_inexistente, indicadores, otro');
    expect(off).toEqual(new Set(['comisiones', 'indicadores']));
  });

  it('acepta los seis módulos configurables', () => {
    const off = modulosApagados(
      'comisiones,inspeccion,reloj,catalogo,estados_de_cuenta,indicadores'
    );
    expect(off.size).toBe(6);
  });
});

describe('moduloActivo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mantiene todos los módulos activos cuando VITE_MODULOS_APAGADOS no está definida', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', '');
    expect(moduloActivo('comisiones')).toBe(true);
    expect(moduloActivo('inspeccion')).toBe(true);
    expect(moduloActivo('reloj')).toBe(true);
    expect(moduloActivo('catalogo')).toBe(true);
    expect(moduloActivo('estados_de_cuenta')).toBe(true);
    expect(moduloActivo('indicadores')).toBe(true);
  });

  it('apaga solo los módulos incluidos en VITE_MODULOS_APAGADOS', () => {
    vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones, reloj , indicadores');
    expect(moduloActivo('comisiones')).toBe(false);
    expect(moduloActivo('reloj')).toBe(false);
    expect(moduloActivo('indicadores')).toBe(false);
    expect(moduloActivo('inspeccion')).toBe(true);
    expect(moduloActivo('catalogo')).toBe(true);
    expect(moduloActivo('estados_de_cuenta')).toBe(true);
  });
});
