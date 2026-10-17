import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { getVinDetector } from '../../lib/barcodeDetector';
import { vinFromBarcode } from '../../lib/vinScan';

export interface VinScannerModalProps {
  onDetected: (vin: string) => void;
  onScan?: (vin: string) => void;
  onClose: () => void;
}

async function loadImg(file: File): Promise<HTMLImageElement> {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image load failed'));
  });
  URL.revokeObjectURL(objectUrl);
  return img;
}

export default function VinScannerModal({ onDetected, onScan, onClose }: VinScannerModalProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hasCameraError, setHasCameraError] = useState(false);
  const [loadingCamera, setLoadingCamera] = useState(true);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Una sola entrega aunque dos lecturas encuentren el mismo código.
  const doneRef = useRef(false);
  const handleDetectedVin = (vin: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopCamera();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch {
        // ignore
      }
    }
    onDetected(vin);
    onScan?.(vin);
    onClose();
  };

  // El efecto corre una vez: lee la versión más reciente del manejador por una ref.
  const detectedRef = useRef(handleDetectedVin);
  detectedRef.current = handleDetectedVin;

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function initScanner() {
      setLoadingCamera(true);
      setHasCameraError(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setHasCameraError(true);
          setLoadingCamera(false);
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const detector = await getVinDetector();

        // Una lectura a la vez, 250 ms después de la anterior: en un iPhone una lectura puede
        // tardar más que eso, y con setInterval se apilaban.
        const tick = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              const barcodes = await detector.detect(video);
              for (const barcode of barcodes) {
                const vin = vinFromBarcode(barcode.rawValue);
                if (vin) {
                  detectedRef.current(vin);
                  return;
                }
              }
            } catch {
              // Un cuadro que no se pudo leer: se intenta con el siguiente.
            }
          }
          if (!cancelled) timerId = setTimeout(() => void tick(), 250);
        };
        timerId = setTimeout(() => void tick(), 250);

        if (!cancelled) {
          setLoadingCamera(false);
        }
      } catch {
        if (!cancelled) {
          setHasCameraError(true);
          setLoadingCamera(false);
        }
      }
    }

    void initScanner();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      stopCamera();
    };
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingPhoto(true);
    setScanError(null);

    try {
      const detector = await getVinDetector();
      let source: ImageBitmapSource;
      if (typeof createImageBitmap === 'function') {
        try {
          source = await createImageBitmap(file);
        } catch {
          source = await loadImg(file);
        }
      } else {
        source = await loadImg(file);
      }

      const barcodes = await detector.detect(source);

      for (const barcode of barcodes) {
        const vin = vinFromBarcode(barcode.rawValue);
        if (vin) {
          handleDetectedVin(vin);
          return;
        }
      }

      setScanError(t('vehicles.scanNotFound'));
    } catch {
      setScanError(t('vehicles.scanNotFound'));
    } finally {
      setProcessingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 540, width: '100%', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vin-scanner-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="vin-scanner-title">
            {t('vehicles.scanTitle')}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
            {t('vehicles.scanHint')}
          </p>

          {scanError && (
            <div className="alert-error" style={{ marginBottom: 'var(--space-3)' }}>
              {scanError}
            </div>
          )}

          {hasCameraError ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
              <Camera size={44} style={{ color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' }} />
              <p style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
                {t('vehicles.scanNoCamera')}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ minHeight: '44px', margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={processingPhoto}
              >
                {processingPhoto ? <Loader2 size={18} className="spin" /> : <ImageIcon size={18} />}
                {t('vehicles.scanPhoto')}
              </button>
            </div>
          ) : (
            <div className="vin-scanner-view">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                
              />

              {loadingCamera ? (
                <div className="vin-scanner-loading">
                  <Loader2 size={24} className="spin" />
                  <span>{t('common.loading')}</span>
                </div>
              ) : (
                /* Recuadro guía */
                <div className="vin-scanner-guide" />
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {!hasCameraError && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: '44px', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={processingPhoto}
              >
                {processingPhoto ? <Loader2 size={16} className="spin" /> : <ImageIcon size={16} />}
                {t('vehicles.scanPhoto')}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '44px', marginLeft: 'auto' }}
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
