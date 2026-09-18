/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignatureCard from './SignatureCard';

// jsdom no tiene canvas y el pad real lo toca al montar.
vi.mock('react-signature-canvas', () => ({
  default: () => <canvas data-testid="signature-pad" />,
}));

vi.mock('../../context/language.context', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'es' }),
}));
vi.mock('../../context/toast.context', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../media/useSignedUrls', () => ({
  useSignedUrls: () => ({ urls: { 'sede/orden/firma-1.png': 'blob:firma-anterior' } }),
}));

const SIGNED = {
  signaturePath: 'sede/orden/firma-1.png',
  signedAt: '2026-09-01T00:00:00Z',
  customerName: 'PRUEBA Marta',
  saving: false,
  onSave: vi.fn(),
};

afterEach(cleanup);

describe('SignatureCard: volver a firmar', () => {
  it('no ofrece volver a firmar a quien no puede, aunque pueda editar', () => {
    render(<SignatureCard {...SIGNED} canEdit canResign={false} />);

    expect(screen.queryByText('workOrders.resign')).not.toBeInTheDocument();
    expect(screen.getByAltText('workOrders.customerSignature')).toBeInTheDocument();
  });

  it('volver a firmar abre el lienzo sin tocar la firma guardada', async () => {
    const onSave = vi.fn();
    render(<SignatureCard {...SIGNED} canEdit canResign onSave={onSave} />);

    await userEvent.click(screen.getByText('workOrders.resign'));

    expect(screen.getByTestId('signature-pad')).toBeInTheDocument();
    // El fallo reportado: pulsar el botón borraba la firma de inmediato.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancelar devuelve la firma anterior', async () => {
    render(<SignatureCard {...SIGNED} canEdit canResign />);

    await userEvent.click(screen.getByText('workOrders.resign'));
    await userEvent.click(screen.getByText('common.cancel'));

    expect(screen.getByAltText('workOrders.customerSignature')).toBeInTheDocument();
    expect(screen.queryByTestId('signature-pad')).not.toBeInTheDocument();
  });

  it('la primera captura no ofrece cancelar: no hay a qué volver', () => {
    render(<SignatureCard signaturePath={null} canEdit canResign saving={false} onSave={vi.fn()} />);

    expect(screen.getByTestId('signature-pad')).toBeInTheDocument();
    expect(screen.queryByText('common.cancel')).not.toBeInTheDocument();
  });
});
