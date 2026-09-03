// @vitest-environment jsdom
//
// The phone's bottom bar had a hardcoded Spanish label ("Órdenes"), so that one
// tab stayed in Spanish with the app switched to English. It also had no way to
// reach the Kanban board, which is shop-floor navigation and exactly what the
// phone is used for.

import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import BottomNav from './BottomNav';

beforeEach(() => {
  localStorage.clear();
});

describe('BottomNav', () => {
  it('links to the five day-to-day screens, Kanban included', () => {
    renderWithProviders(<BottomNav />);

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/work-orders', '/kanban', '/customers', '/vehicles']);
  });

  it('translates every label, including the orders tab', () => {
    // LanguageProvider reads the saved language once, on mount, so each language
    // gets its own render rather than a toggle.
    const spanish = renderWithProviders(<BottomNav />);
    expect(screen.getByText('Órdenes')).toBeVisible();
    expect(screen.getByText('Tablero')).toBeVisible();
    spanish.unmount();

    localStorage.setItem('restorify_lang', 'en');
    renderWithProviders(<BottomNav />);

    expect(screen.getByText('Orders')).toBeVisible();
    expect(screen.getByText('Board')).toBeVisible();
    // The bug this pins: one label stayed Spanish because it was hardcoded.
    expect(screen.queryByText('Órdenes')).toBeNull();
  });
});
