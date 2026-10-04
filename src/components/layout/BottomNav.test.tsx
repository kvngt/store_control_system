// @vitest-environment jsdom
//
// The phone's bottom bar had a hardcoded Spanish label ("Órdenes"), so that one
// tab stayed in Spanish with the app switched to English. El tablero tuvo su pestaña hasta
// F7 (octubre 2026): ahora es una vista de Órdenes, que recuerda la última que se usó.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import BottomNav from './BottomNav';

const auth = vi.hoisted(() => ({ rol: 'admin' as 'admin' | 'mecanico' }));
vi.mock('../../context/auth.context', () => ({ useAuth: () => ({ user: { rol: auth.rol } }) }));

beforeEach(() => {
  localStorage.clear();
  auth.rol = 'admin';
});

describe('BottomNav', () => {
  it('links to the day-to-day screens; the board lives inside Órdenes', () => {
    renderWithProviders(<BottomNav />);

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/work-orders', '/customers', '/vehicles']);
  });

  // Reunión con el taller (sept. 2026): Clientes y Vehículos son de administración. Un
  // técnico ve el cliente y el vehículo dentro de sus órdenes.
  it('a technician gets no Customers or Vehicles tab', () => {
    auth.rol = 'mecanico';
    renderWithProviders(<BottomNav />);

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/work-orders']);
  });

  it('translates every label, including the orders tab', () => {
    // LanguageProvider reads the saved language once, on mount, so each language
    // gets its own render rather than a toggle.
    const spanish = renderWithProviders(<BottomNav />);
    expect(screen.getByText('Órdenes')).toBeVisible();
    expect(screen.getByText('Panel')).toBeVisible();
    spanish.unmount();

    localStorage.setItem('restorify_lang', 'en');
    renderWithProviders(<BottomNav />);

    expect(screen.getByText('Orders')).toBeVisible();
    expect(screen.getByText('Home')).toBeVisible();
    // The bug this pins: one label stayed Spanish because it was hardcoded.
    expect(screen.queryByText('Órdenes')).toBeNull();
  });
});
