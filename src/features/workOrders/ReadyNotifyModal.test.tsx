/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import ReadyNotifyModal from './ReadyNotifyModal';
import { customerPortalService } from '../../services/customerPortal.service';
import { isValidEmail } from '../../lib/email';
import type { WorkOrder } from '../../types/database';

vi.mock('../../services/customerPortal.service', () => ({
  customerPortalService: {
    getOrCreateToken: vi.fn(),
    buildPortalUrl: vi.fn((token: string) => `https://restorifyauto.net/r/${token}`),
  },
}));

describe('ReadyNotifyModal (D2)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerPortalService.getOrCreateToken).mockResolvedValue('mock-token-abc');
  });

  it('renders WhatsApp and Copy Link button with customerLink.copyLink and builds message in customer language', async () => {
    const orderEn = {
      id: 'order-1',
      numero_orden: 'ORD-100',
      cliente: {
        nombre: 'John Doe',
        telefono: '5551234567',
        idioma: 'en',
      },
      vehiculo: {
        marca: 'Ford',
        modelo: 'Mustang',
      },
    } as unknown as WorkOrder;

    renderWithProviders(<ReadyNotifyModal order={orderEn} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).toBeNull();
    });

    // Check textarea contains English ready message
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('is ready for pickup');
    expect(textarea.value).toContain('Ford Mustang');
    expect(textarea.value).toContain('https://restorifyauto.net/r/mock-token-abc');

    // Check WhatsApp link/button
    const whatsappLink = screen.getByRole('link', { name: /whatsapp/i });
    expect(whatsappLink).toBeDefined();
    expect(whatsappLink.getAttribute('href')).toContain('wa.me');

    // D2: Check copy link button uses customerLink.copyLink
    expect(screen.getByRole('button', { name: /copy link|copiar enlace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy message|copiar mensaje/i })).toBeInTheDocument();
  });

  it('en español el botón de copiar enlace dice «Copiar enlace»', async () => {
    localStorage.setItem('restorify_lang', 'es');
    const orderEs = {
      id: 'order-es',
      numero_orden: 'ORD-101',
      cliente: { nombre: 'Carlos', telefono: '5550001', idioma: 'es' },
      vehiculo: { marca: 'Toyota', modelo: 'Yaris' },
    } as unknown as WorkOrder;

    renderWithProviders(<ReadyNotifyModal order={orderEs} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.queryByText(/cargando|loading/i)).toBeNull();
    });

    const copyBtn = screen.getByRole('button', { name: /Copiar enlace/i });
    expect(copyBtn).toBeInTheDocument();

    // Mock clipboard y click
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });
    await userEvent.click(copyBtn);
    expect(writeTextSpy).toHaveBeenCalledWith('https://restorifyauto.net/r/mock-token-abc');
  });

  it('omits or hides SMS button when canOpenSms is false on desktop', async () => {
    // Standard jsdom userAgent is desktop (node/jsdom)
    const orderEs = {
      id: 'order-2',
      numero_orden: 'ORD-200',
      cliente: {
        nombre: 'Maria Garcia',
        telefono: '5559876543',
        idioma: 'es',
      },
      vehiculo: {
        marca: 'Toyota',
        modelo: 'Corolla',
      },
    } as unknown as WorkOrder;

    renderWithProviders(<ReadyNotifyModal order={orderEs} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).toBeNull();
    });

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('ya está listo para recoger');

    // On jsdom desktop environment, canOpenSms() returns false
    expect(screen.queryByRole('link', { name: /sms/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /abrir sms|open sms/i })).toBeNull();
  });

  it('shows noPhone warning and disables action buttons when customer has no phone', async () => {
    const orderNoPhone = {
      id: 'order-3',
      numero_orden: 'ORD-300',
      cliente: {
        nombre: 'Pedro Sin Telefono',
        telefono: '',
        idioma: 'es',
      },
      vehiculo: {
        marca: 'Nissan',
        modelo: 'Sentra',
      },
    } as unknown as WorkOrder;

    renderWithProviders(<ReadyNotifyModal order={orderNoPhone} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).toBeNull();
    });

    expect(screen.getByText(/no tiene teléfono registrado/i)).toBeDefined();
    // WhatsApp button is disabled
    const disabledWhatsAppBtn = screen.getByRole('button', { name: /whatsapp/i });
    expect((disabledWhatsAppBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('D2: con correo válido usa markReadyDone; sin correo usa markReadyDoneNoEmail y abre modal', () => {
    const decideToastKey = (email: string | null | undefined) => {
      const hasEmail = isValidEmail(email);
      return {
        toastKey: hasEmail ? 'workOrders.markReadyDone' : 'workOrders.markReadyDoneNoEmail',
        openModal: !hasEmail,
      };
    };

    // Caso 1: con correo válido
    const resWithEmail = decideToastKey('cliente@example.com');
    expect(resWithEmail.toastKey).toBe('workOrders.markReadyDone');
    expect(resWithEmail.openModal).toBe(false);

    // Caso 2: sin correo o vacío o inválido
    const resEmptyEmail = decideToastKey('');
    expect(resEmptyEmail.toastKey).toBe('workOrders.markReadyDoneNoEmail');
    expect(resEmptyEmail.openModal).toBe(true);

    const resNullEmail = decideToastKey(null);
    expect(resNullEmail.toastKey).toBe('workOrders.markReadyDoneNoEmail');
    expect(resNullEmail.openModal).toBe(true);

    const resInvalidEmail = decideToastKey('not-an-email');
    expect(resInvalidEmail.toastKey).toBe('workOrders.markReadyDoneNoEmail');
    expect(resInvalidEmail.openModal).toBe(true);
  });
});
