import { describe, it, expect } from 'vitest';
import { detectPushSupport, isIos, urlBase64ToUint8Array, type PushEnvironment } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    userAgent: ANDROID,
    maxTouchPoints: 5,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    standalone: false,
    vapidKey: 'BExampleKey',
    ...overrides,
  };
}

describe('isIos', () => {
  it('reconoce iPhone y el iPad que se anuncia como Mac', () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(isIos(IPAD_AS_MAC, 5)).toBe(true);
  });

  it('no confunde una Mac de escritorio ni Android', () => {
    expect(isIos(IPAD_AS_MAC, 0)).toBe(false);
    expect(isIos(ANDROID, 5)).toBe(false);
  });
});

describe('detectPushSupport', () => {
  it('pide instalar la app en un iPhone que la abrió desde Safari', () => {
    // Safari ni siquiera expone PushManager fuera de la app instalada: sin este
    // caso, la pantalla diría "no compatible" a un iPhone que sí lo es.
    expect(detectPushSupport(env({ userAgent: IPHONE, hasPushManager: false }))).toBe('needs-install');
  });

  it('está listo en un iPhone con la app instalada', () => {
    expect(detectPushSupport(env({ userAgent: IPHONE, standalone: true }))).toBe('supported');
  });

  it('está listo en Chrome de Android sin instalar nada', () => {
    expect(detectPushSupport(env())).toBe('supported');
  });

  it('dice no compatible cuando falta la API', () => {
    expect(detectPushSupport(env({ hasPushManager: false }))).toBe('unsupported');
  });

  it('dice sin configurar cuando la build no trae llave VAPID, antes que nada', () => {
    expect(detectPushSupport(env({ vapidKey: '', userAgent: IPHONE }))).toBe('not-configured');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url sin relleno', () => {
    // "hola" en base64url es "aG9sYQ"
    expect([...urlBase64ToUint8Array('aG9sYQ')]).toEqual([104, 111, 108, 97]);
  });

  it('traduce los caracteres propios de base64url', () => {
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });

  it('una llave VAPID pública decodifica a 65 bytes (punto P-256 sin comprimir)', () => {
    const key = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });
});
