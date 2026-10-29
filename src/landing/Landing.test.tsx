// @vitest-environment jsdom
//
// La página de inicio de restorifyauto.net: lo que necesita un cliente para llamar, escribir o
// llegar, en inglés o en español, y que lo interactivo (lista de servicios, estudio de color,
// pestañas del portal) funcione también con el teclado.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Landing from './Landing';

beforeEach(() => {
  localStorage.clear();
  // jsdom no reproduce video: play y pause solo avisan con su evento, como haría el navegador.
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  };
});

const decoded = (link: HTMLElement) => decodeURIComponent(link.getAttribute('href') ?? '');

describe('Landing', () => {
  it('shows how to call, message and find the shop', () => {
    render(<Landing />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Repair\.\s*Restore\.\s*Perform\./);
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    for (const tel of ['tel:+12403551266', 'tel:+12026076126', 'tel:+13019099937']) expect(hrefs).toContain(tel);
    expect(hrefs.some((href) => href?.startsWith('https://wa.me/12403551266?text='))).toBe(true);
    expect(hrefs.some((href) => href?.startsWith('https://wa.me/12026076126?text='))).toBe(true);
    // La oficina no atiende WhatsApp.
    expect(hrefs.some((href) => href?.startsWith('https://wa.me/13019099937'))).toBe(false);
    expect(hrefs).toContain('mailto:restorifyauto@gmail.com');
    expect(hrefs).toContain('https://www.instagram.com/restorifyauto/');
    expect(hrefs).toContain('https://www.facebook.com/RestorifyAuto/');
    expect(hrefs).toContain('https://beacons.ai/restorify');
    expect(hrefs.some((href) => href?.startsWith('https://www.google.com/maps/dir/?api=1&destination='))).toBe(true);
    // La dirección como la escribe la tarjeta del taller.
    expect(document.querySelector('address')).toHaveTextContent(/5010 46th Ave\s*Ste C\s*Hyattsville, MD 20781/);
  });

  it('the hero call buttons say who answers and in which language', () => {
    render(<Landing />);
    const english = screen.getByRole('link', { name: /Jesus D\., in English/ });
    const spanish = screen.getByRole('link', { name: /Carlos G\., en español/ });
    expect(english).toHaveAttribute('href', 'tel:+12403551266');
    expect(english.querySelector('[lang="en"]')).not.toBeNull();
    expect(spanish).toHaveAttribute('href', 'tel:+12026076126');
    expect(spanish.querySelector('[lang="es"]')).not.toBeNull();
    // En inglés, la línea en inglés va primero (y en español, al revés).
    expect(english.compareDocumentPosition(spanish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('plays the shop’s intro video muted, in a loop and without controls', () => {
    render(<Landing />);
    const video = document.querySelector<HTMLVideoElement>('video.lp-hero__media')!;
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('playsinline');
    expect(video).not.toHaveAttribute('controls');
    expect(video.getAttribute('poster')).toBeTruthy();
    // La versión liviana en el teléfono y la de 720p en lo demás.
    expect([...video.querySelectorAll('source')].map((source) => source.getAttribute('src'))).toEqual([
      '/videos/rfiintro-480.mp4',
      '/videos/rfiintro-720.mp4',
    ]);
    // Sin botón de pausa (así lo pidió el taller).
    expect(screen.queryByRole('button', { name: /video/i })).toBeNull();
  });

  it('opens in English even when the browser asks for Spanish', () => {
    const languages = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['es-MX', 'es']);
    render(<Landing />);
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'What does your car need?' })).toBeInTheDocument();
    languages.mockRestore();
  });

  it('never promises a free estimate: the shop charges for estimates', async () => {
    render(<Landing />);
    expect(document.body.textContent).not.toMatch(/\bfree\b/i);
    const [message] = screen.getAllByRole('link', { name: 'Message us' });
    expect(message.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12403551266\?text=/);

    await userEvent.click(screen.getByRole('button', { name: /Español/ }));
    expect(document.body.textContent).not.toMatch(/\bgratis\b/i);
    const [escribanos] = screen.getAllByRole('link', { name: 'Escríbanos' });
    expect(escribanos.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12026076126\?text=/);
  });

  it('shows real work from the shop, with its before and after', () => {
    render(<Landing />);
    const work = screen.getByRole('region', { name: 'Work from our shop.' });
    expect(within(work).getByRole('img', { name: /Lexus in gray primer/ })).toBeInTheDocument();
    expect(within(work).getByRole('img', { name: /same Lexus, finished in gloss black/ })).toBeInTheDocument();
    expect(within(work).getAllByText('Before').length).toBe(within(work).getAllByText('After').length);
    expect(within(work).getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/restorifyauto/');
  });

  it('the service checklist writes the WhatsApp message, in each line’s language', async () => {
    render(<Landing />);
    const services = screen.getByRole('region', { name: 'What does your car need?' });
    expect(within(services).getByText('Nothing checked yet')).toBeInTheDocument();
    const send = within(services).getByRole('link', { name: 'Send to Jesus D. on WhatsApp' });
    expect(decoded(send)).toMatch(/^https:\/\/wa\.me\/12403551266\?text=Hi, Restorify! I have a question about my car/);

    await userEvent.click(within(services).getByRole('checkbox', { name: 'Brake repair' }));
    await userEvent.click(within(services).getByRole('checkbox', { name: 'A/C service' }));
    expect(within(services).getByText('2 checked')).toBeInTheDocument();
    expect(decoded(send)).toContain('My car needs: Brake repair, A/C service. Year, make and model:');

    // El enlace para la otra línea va en español, con los servicios en español.
    const other = within(services).getByRole('link', { name: 'En español, escríbale a Carlos G.' });
    expect(other).toHaveAttribute('lang', 'es');
    expect(decoded(other)).toMatch(/^https:\/\/wa\.me\/12026076126\?text=¡Hola, Restorify! Mi carro necesita: Frenos, Aire acondicionado\./);
  });

  it('lists some insurers, without anything moving', () => {
    render(<Landing />);
    const insurers = screen.getByRole('list', { name: 'Some of the insurers our customers have' });
    expect(within(insurers).getAllByRole('listitem')).toHaveLength(10);
    expect(insurers).toHaveTextContent(/GEICO.*State Farm/);
    // La franja de la tarjeta, al pie de la portada.
    expect(document.querySelector('.lp-band')).toHaveTextContent(/We work with all insurance companies/i);
  });

  it('keeps the staff entrance and the privacy notice in the footer, with the model credit', () => {
    render(<Landing />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /Staff login/ })).toHaveAttribute('href', '/login');
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacidad');
    // El modelo 3D es CC BY 4.0: su crédito no se quita.
    expect(footer).toHaveTextContent(/Car Concept.*CC BY 4\.0/);
    expect(within(footer).getByRole('link', { name: 'License' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  });

  it('switches to Spanish and remembers it', async () => {
    render(<Landing />);
    await userEvent.click(screen.getByRole('button', { name: /Español/ }));

    expect(screen.getByRole('heading', { name: '¿Qué necesita su carro?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Español/ })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('restorify_portal_lang')).toBe('es');
    // En español, la línea en español va primero.
    const [first] = screen.getAllByRole('link', { name: /Carlos G\., en español|Jesus D\., in English/ });
    expect(first).toHaveAttribute('href', 'tel:+12026076126');
    // La reseña sale traducida, avisando que es traducción, y con la original en inglés.
    expect(screen.getByText(/La calidad del trabajo es increíble/)).toBeInTheDocument();
    const original = screen.getByText(/The quality of the work is incredible/);
    expect(original.closest('[lang="en"]')).not.toBeNull();
    expect(screen.getByText(/Traducida del inglés/)).toBeInTheDocument();
  });

  it('opens in Spanish for someone who chose it before (also in their customer link)', () => {
    localStorage.setItem('restorify_portal_lang', 'es');
    render(<Landing />);
    expect(screen.getByRole('heading', { name: 'Estamos en Hyattsville.' })).toBeInTheDocument();
  });

  it('the color studio picks a color and a finish (also with the arrow keys) and sends them on WhatsApp', async () => {
    render(<Landing />);
    const colors = screen.getByRole('radiogroup', { name: /Color/ });
    const finishes = screen.getByRole('radiogroup', { name: 'Finish' });
    expect(within(colors).getAllByRole('radio')).toHaveLength(10);
    expect(within(finishes).getAllByRole('radio')).toHaveLength(4);

    await userEvent.click(within(colors).getByRole('radio', { name: 'Midnight blue' }));
    await userEvent.click(within(finishes).getByRole('radio', { name: 'Matte' }));
    expect(within(colors).getByRole('radio', { name: 'Midnight blue' })).toHaveAttribute('aria-checked', 'true');
    const cta = screen.getByRole('link', { name: /Ask for this color/ });
    expect(decoded(cta)).toMatch(/^https:\/\/wa\.me\/12403551266\?text=.*Midnight blue, Matte finish/);

    // Las flechas mueven la elección dentro del grupo y llevan el foco.
    const matte = within(finishes).getByRole('radio', { name: 'Matte' });
    fireEvent.keyDown(matte, { key: 'ArrowRight' });
    const gloss = within(finishes).getByRole('radio', { name: 'Gloss' });
    expect(gloss).toHaveAttribute('aria-checked', 'true');
    expect(gloss).toHaveFocus();
    // Sin WebGL (jsdom) queda la imagen fija, que también dice qué se eligió.
    expect(screen.getByRole('img', { name: '3D car painted Midnight blue, Gloss finish' })).toBeInTheDocument();
  });

  it('the portal demo changes screen with a click and with the arrow keys', async () => {
    render(<Landing />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Quote to authorize');
    // Marcar la línea que faltaba suma al total de la maqueta; autorizar deja el aviso.
    expect(panel).toHaveTextContent('$730.00');
    await userEvent.click(within(panel).getByRole('checkbox', { name: /Headlight polish/ }));
    expect(panel).toHaveTextContent('$820.00');
    await userEvent.click(within(panel).getByRole('button', { name: 'Authorize checked items' }));
    expect(within(panel).getByRole('status')).toHaveTextContent('Authorized');
    expect(within(panel).getByRole('checkbox', { name: /Headlight polish/ })).toBeDisabled();

    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[3]).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Next service');
  });

  it('says whether the shop is open, in Maryland time', () => {
    render(<Landing />);
    const status = document.querySelector('.lp-hero__meta .lp-status');
    expect(status?.textContent).toMatch(/^(Open now · until \d pm|Closed · opens .+ at 9 am)$/);
  });
});
