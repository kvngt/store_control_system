/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVinDetector, _resetVinDetectorCacheForTesting } from './barcodeDetector';

describe('getVinDetector', () => {
  const originalBarcodeDetector = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;

  beforeEach(() => {
    _resetVinDetectorCacheForTesting();
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    delete (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  afterEach(() => {
    _resetVinDetectorCacheForTesting();
    if (originalBarcodeDetector !== undefined) {
      (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = originalBarcodeDetector;
      (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = originalBarcodeDetector;
    } else {
      delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
      delete (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    }
  });

  it('uses native BarcodeDetector if available and supports code_39', async () => {
    const mockDetect = vi.fn().mockResolvedValue([{ rawValue: '1HGCM82633A004352' }]);
    class MockNativeBarcodeDetector {
      static getSupportedFormats = vi.fn().mockResolvedValue(['code_39', 'qr_code']);
      detect = mockDetect;
    }

    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = MockNativeBarcodeDetector;
    (globalThis as unknown as { BarcodeDetector: unknown }).BarcodeDetector = MockNativeBarcodeDetector;

    const detector = await getVinDetector();
    expect(detector).toBeDefined();
    expect(detector).toBeInstanceOf(MockNativeBarcodeDetector);
  });

  it('falls back to ponyfill when window.BarcodeDetector is not available', async () => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    delete (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;

    const detector = await getVinDetector();
    expect(detector).toBeDefined();
    expect(typeof detector.detect).toBe('function');
  });
});
