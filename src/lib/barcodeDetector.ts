/**
 * Abstracción para detección de códigos de barras (Barcode Detection API nativa
 * con fallback dinámico a barcode-detector / zxing-wasm).
 */

export interface VinBarcodeDetector {
  detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

export const VIN_BARCODE_FORMATS = ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'] as const;

let cachedDetectorPromise: Promise<VinBarcodeDetector> | null = null;

/** Para pruebas unitarias: limpiar la caché del detector */
export function _resetVinDetectorCacheForTesting(): void {
  cachedDetectorPromise = null;
}

/**
 * Obtiene un detector de códigos de barras compatible con VINs automotrices (guardado en caché).
 * - Formatos: code_39, code_128, data_matrix, qr_code y pdf417.
 * - Si existe globalThis.BarcodeDetector nativo y getSupportedFormats() incluye code_39, usa el nativo.
 * - Si no, carga dinámicamente barcode-detector/ponyfill y zxing-wasm con prepareZXingModule.
 */
export function getVinDetector(): Promise<VinBarcodeDetector> {
  if (cachedDetectorPromise) {
    return cachedDetectorPromise;
  }

  cachedDetectorPromise = (async () => {
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
    const NativeDetector = (globalObj as unknown as {
      BarcodeDetector?: {
        new (options?: { formats?: readonly string[] }): VinBarcodeDetector;
        getSupportedFormats?: () => Promise<readonly string[]>;
      };
    }).BarcodeDetector;

    if (NativeDetector && typeof NativeDetector.getSupportedFormats === 'function') {
      try {
        const supported = await NativeDetector.getSupportedFormats();
        if (supported && supported.includes('code_39')) {
          const formats = VIN_BARCODE_FORMATS.filter((f) => supported.includes(f));
          return new NativeDetector({ formats });
        }
      } catch {
        // Fallback dinámico si falla la comprobación nativa
      }
    }

    // Fallback con import() dinámico para que no entre al bundle principal
    const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
    const { default: wasmUrl } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      },
    });

    return new BarcodeDetector({ formats: [...VIN_BARCODE_FORMATS] });
  })().catch((err: unknown) => {
    // Sin señal en el patio la descarga del lector falla: el siguiente intento empieza de cero.
    cachedDetectorPromise = null;
    throw err;
  });

  return cachedDetectorPromise;
}
