/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import VinScannerModal from './VinScannerModal';
import { LanguageProvider } from '../../context/LanguageContext';
import * as barcodeDetectorModule from '../../lib/barcodeDetector';

describe('VinScannerModal', () => {
  const onDetected = vi.fn();
  const onScan = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal and close button, and clicking close calls onClose', () => {
    render(
      <LanguageProvider>
        <VinScannerModal onDetected={onDetected} onScan={onScan} onClose={onClose} />
      </LanguageProvider>
    );

    const closeBtn = screen.getAllByRole('button', { name: /cerrar|close/i })[0];
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows upload photo fallback option when getUserMedia fails or is unavailable', async () => {
    // Force getUserMedia to reject
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      writable: true,
      configurable: true,
    });

    render(
      <LanguageProvider>
        <VinScannerModal onDetected={onDetected} onScan={onScan} onClose={onClose} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no se pudo abrir la cámara|no hay acceso a la cámara|couldn't open|no camera access/i)).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /foto/i })).toBeDefined();
  });

  it('calls onDetected and onClose when a photo with a valid VIN is uploaded', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('No camera')),
      },
      writable: true,
      configurable: true,
    });

    vi.spyOn(barcodeDetectorModule, 'getVinDetector').mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ rawValue: 'I1HGCM82633A004352' }]),
    });

    window.createImageBitmap = vi.fn().mockResolvedValue({} as ImageBitmap);

    const { container } = render(
      <LanguageProvider>
        <VinScannerModal onDetected={onDetected} onScan={onScan} onClose={onClose} />
      </LanguageProvider>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(['fake-image'], 'vin.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onDetected).toHaveBeenCalledWith('1HGCM82633A004352');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onDetected and onClose when a valid VIN is detected from stream', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    vi.spyOn(barcodeDetectorModule, 'getVinDetector').mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ rawValue: 'I1HGCM82633A004352' }]),
    });

    // Mock HTMLMediaElement.prototype.play and readyState
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', {
      get: () => 4, // HAVE_ENOUGH_DATA
      configurable: true,
    });

    render(
      <LanguageProvider>
        <VinScannerModal onDetected={onDetected} onScan={onScan} onClose={onClose} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(onDetected).toHaveBeenCalledWith('1HGCM82633A004352');
      expect(onClose).toHaveBeenCalled();
    });
  });
});
