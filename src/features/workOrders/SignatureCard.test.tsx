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
  it('no ofrece volver a firmar a quien no puede, aunque pueda firmar', () => {
    render(<SignatureCard {...SIGNED} canSign canResign={false} />);

    expect(screen.queryByText('workOrders.resign')).not.toBeInTheDocument();
    expect(screen.getByAltText('workOrders.customerSignature')).toBeInTheDocument();
  });

  it('volver a firmar abre el lienzo sin tocar la firma guardada', async () => {
    const onSave = vi.fn();
    render(<SignatureCard {...SIGNED} canSign canResign onSave={onSave} />);

    await userEvent.click(screen.getByText('workOrders.resign'));

    expect(screen.getByTestId('signature-pad')).toBeInTheDocument();
    // El fallo reportado: pulsar el botón borraba la firma de inmediato.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancelar devuelve la firma anterior', async () => {
    render(<SignatureCard {...SIGNED} canSign canResign />);

    await userEvent.click(screen.getByText('workOrders.resign'));
    await userEvent.click(screen.getByText('common.cancel'));

    expect(screen.getByAltText('workOrders.customerSignature')).toBeInTheDocument();
    expect(screen.queryByTestId('signature-pad')).not.toBeInTheDocument();
  });

  it('la primera captura no ofrece cancelar: no hay a qué volver', () => {
    render(<SignatureCard signaturePath={null} canSign canResign saving={false} onSave={vi.fn()} />);

    expect(screen.getByTestId('signature-pad')).toBeInTheDocument();
    expect(screen.queryByText('common.cancel')).not.toBeInTheDocument();
  });
});

// La reunión con el taller (sept. 2026): el técnico podía firmar en cualquier estado, y la
// primera firma aprueba lo cotizado. La firma la toma administración.
describe('SignatureCard: quien no firma', () => {
  it('sin firma todavía, ve el aviso y no el lienzo', () => {
    render(<SignatureCard signaturePath={null} canSign={false} canResign={false} saving={false} onSave={vi.fn()} />);

    expect(screen.queryByTestId('signature-pad')).not.toBeInTheDocument();
    expect(screen.getByText('workOrders.noSignature')).toBeInTheDocument();
  });

  it('con firma, la ve y no puede cambiarla', () => {
    render(<SignatureCard {...SIGNED} canSign={false} canResign={false} />);

    expect(screen.getByAltText('workOrders.customerSignature')).toBeInTheDocument();
    expect(screen.queryByText('workOrders.resign')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signature-pad')).not.toBeInTheDocument();
  });
});
