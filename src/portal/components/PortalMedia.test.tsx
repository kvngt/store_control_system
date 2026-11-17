// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFormatters } from '../format';
import type { PortalMedia } from '../portal.types';
import { portalStrings, type PortalLanguage } from '../strings';
import { PortalMediaGrid, PortalPhoto } from './PortalMedia';

function MediaHarness({ media, language = 'es' }: { media: PortalMedia[]; language?: PortalLanguage }) {
  const fmt = useFormatters(language);
  return <PortalMediaGrid media={media} s={portalStrings[language]} fmt={fmt} />;
}

const SAMPLE_MEDIA: PortalMedia[] = [
  {
    id: 'm1',
    tipo: 'foto',
    origen: 'recepcion',
    avance_id: null,
    zona: 'front',
    mime: 'image/jpeg',
    duracion_seg: null,
    ancho: 1200,
    alto: 900,
    creado_en: '2026-10-01T15:00:00Z',
    url: 'https://storage.example/photo-1.jpg',
    miniatura_url: 'https://storage.example/thumb-1.jpg',
  },
  {
    id: 'm2',
    tipo: 'video',
    origen: 'avance',
    avance_id: null,
    zona: null,
    mime: 'video/mp4',
    duracion_seg: 75,
    ancho: 1280,
    alto: 720,
    creado_en: '2026-10-01T16:00:00Z',
    url: 'https://storage.example/video-2.mp4',
    miniatura_url: 'https://storage.example/thumb-2.jpg',
  },
];

describe('PortalMedia', () => {
  it('cada miniatura lleva alt descriptivo y al fallar muestra el recuadro sin bloquear el visor', async () => {
    const user = userEvent.setup();
    render(<MediaHarness media={SAMPLE_MEDIA} />);

    const thumb1 = screen.getByAltText('Foto 1');
    const thumb2 = screen.getByAltText('Foto 2');
    expect(thumb1).toBeInTheDocument();
    expect(thumb2).toBeInTheDocument();

    fireEvent.error(thumb1);
    expect(screen.queryByAltText('Foto 1')).not.toBeInTheDocument();
    const fallback = screen.getByRole('img', { name: 'No se pudo cargar la foto' });
    expect(fallback).toHaveTextContent('No se pudo cargar la foto');

    // Al fallar la miniatura del video, conserva la insignia de duración.
    fireEvent.error(thumb2);
    expect(screen.getAllByText('No se pudo cargar la foto')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Video' })).toHaveTextContent('1:15');

    // El botón de la foto sigue abriendo el visor.
    await user.click(screen.getByRole('button', { name: 'Foto' }));
    const dialog = screen.getByRole('dialog');
    const fullImg = within(dialog).getByAltText('Foto 1');
    expect(fullImg).toHaveAttribute('src', 'https://storage.example/photo-1.jpg');

    fireEvent.error(fullImg);
    expect(within(dialog).getByRole('img', { name: 'No se pudo cargar la foto' })).toHaveTextContent('No se pudo cargar la foto');
  });

  it('en inglés muestra alt y mensaje de error en inglés', () => {
    render(<PortalPhoto src="https://storage.example/firma.png" alt="Customer signature" errorLabel={portalStrings.en.photoLoadError} />);

    const img = screen.getByAltText('Customer signature');
    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'Could not load the photo' })).toHaveTextContent('Could not load the photo');
  });
});
