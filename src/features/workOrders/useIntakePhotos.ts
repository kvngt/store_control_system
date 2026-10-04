import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compressImage } from '../../lib/media/image';
import type { PreparedMedia } from '../../types/database';

/** One intake photo held in the browser before the order exists to attach it to. */
export interface PhotoZone {
  key: string;
  label: string;
  /** Ya comprimida: 1920 px, JPEG, sin EXIF, con miniatura. */
  media: PreparedMedia;
  /** `blob:` URL for the thumbnail. Owned by this hook, which also revokes it. */
  preview: string;
}

/** The six angles every intake is expected to cover. */
export const ZONES: { key: string; label: string }[] = [
  { key: 'front', label: 'Frontal' },
  { key: 'rear', label: 'Trasera' },
  { key: 'left', label: 'Izquierda' },
  { key: 'right', label: 'Derecha' },
  { key: 'interior', label: 'Interior' },
  { key: 'fuel', label: 'Tablero' },
];

/**
 * The 360-degree intake photos — and, since October 2026, any extra photo, video or voice
 * note, captured with the same bar the order detail uses (`MediaCaptureBar`). The shop
 * asked for it: until then videos and voice notes could only be added once the order
 * existed.
 *
 * Deliberately outside React Hook Form: these are `File` objects with a
 * `blob:` URL each, and the thing that actually needs managing is not their
 * value but their **lifetime**. Nothing used to revoke those URLs, so closing
 * the dialog — or replacing a tile, or discarding a draft — stranded the
 * full-resolution image in memory for the life of the tab, all day on a shop
 * tablet that shoots six photos an order. Every URL created here is revoked
 * when its photo goes away, on reset, and on unmount.
 *
 * Cada foto se comprime en cuanto se elige, no al guardar la orden. Dos razones:
 * la vista previa ya es la versión liviana (seis fotos de 12 MP ocupaban más de
 * 200 MB decodificadas en un teléfono), y al crear la orden las fotos solo
 * entran a la cola de subida, sin trabajo pendiente que haga esperar al técnico.
 */
export function useIntakePhotos() {
  const [photos, setPhotos] = useState<Record<string, PhotoZone>>({});
  // Lo que se agrega con la barra: fotos sin zona, videos y notas de voz, ya procesados.
  // Sus miniaturas las dibuja (y libera) `DraftMediaStrip`.
  const [extraMedia, setExtraMedia] = useState<PreparedMedia[]>([]);
  const [processing, setProcessing] = useState(0);
  // La generación del borrador como estado, para que `addMedia` cambie de identidad con
  // cada reset (ver abajo).
  const [epoch, setEpoch] = useState(0);

  // Every object URL handed out, so none is left behind when the tab moves on.
  const objectUrls = useRef(new Set<string>());
  // Una compresión que termina después de descartar el borrador (o de cerrar el
  // diálogo) no debe resucitar la foto. Cada reset abre una generación nueva.
  const generation = useRef(0);
  const mounted = useRef(true);

  const trackUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  }, []);

  const releaseUrl = useCallback((url: string | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const urls = objectUrls.current;
    return () => {
      mounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  /** Comprime y devuelve null si el borrador cambió de generación entretanto. */
  const prepare = useCallback(async (file: Blob) => {
    const started = generation.current;
    setProcessing((n) => n + 1);
    try {
      const media = await compressImage(file);
      return mounted.current && started === generation.current ? media : null;
    } finally {
      if (mounted.current) setProcessing((n) => Math.max(0, n - 1));
    }
  }, []);

  const setZonePhoto = useCallback(
    async (zoneKey: string, file: File) => {
      const media = await prepare(file);
      if (!media) return;
      const label = ZONES.find((z) => z.key === zoneKey)?.label || zoneKey;
      const preview = trackUrl(media.thumb ?? media.blob);
      setPhotos((prev) => {
        releaseUrl(prev[zoneKey]?.preview);
        return { ...prev, [zoneKey]: { key: zoneKey, label, media, preview } };
      });
    },
    [prepare, releaseUrl, trackUrl]
  );

  // Lo que llega de la barra. Un video de galería tarda en convertirse: si mientras tanto se
  // descartó el borrador o se creó la orden y se cerró el diálogo, llamaría a esta función
  // después del reset y caería en la orden siguiente. La barra guarda la `onAdd` del render
  // en que empezó, así que cada generación tiene la suya y la de una generación vieja no
  // agrega nada.
  const addMedia = useCallback(
    (items: PreparedMedia[]) => {
      if (!mounted.current || epoch !== generation.current || !items.length) return;
      setExtraMedia((prev) => [...prev, ...items]);
    },
    [epoch]
  );

  const removeMedia = useCallback((index: number) => {
    setExtraMedia((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removePhoto = useCallback(
    (zoneKey: string) => {
      setPhotos((prev) => {
        releaseUrl(prev[zoneKey]?.preview);
        const next = { ...prev };
        delete next[zoneKey];
        return next;
      });
    },
    [releaseUrl]
  );

  const reset = useCallback(() => {
    generation.current += 1;
    setEpoch(generation.current);
    setPhotos((prev) => {
      Object.values(prev).forEach((photo) => releaseUrl(photo.preview));
      return {};
    });
    setExtraMedia([]);
  }, [releaseUrl]);

  const zonesCovered = useMemo(() => ZONES.filter((z) => photos[z.key]).length, [photos]);

  /** Lo que entra a la cola de subida una vez que la orden existe. */
  const toUploads = useCallback(
    () => [
      ...Object.values(photos).map((p) => ({ zone: p.key as string | null, media: p.media })),
      // Lo de la barra no tiene zona.
      ...extraMedia.map((media) => ({ zone: null, media })),
    ],
    [photos, extraMedia]
  );

  return {
    photos,
    extraMedia,
    zonesCovered,
    /** Hay algo capturado: descartar el borrador tiene que preguntar. */
    hasMedia: Object.keys(photos).length > 0 || extraMedia.length > 0,
    /** Fotos comprimiéndose ahora mismo. Crear la orden espera a que llegue a 0. */
    processing,
    setZonePhoto,
    addMedia,
    removeMedia,
    removePhoto,
    reset,
    toUploads,
  };
}

export type IntakePhotosApi = ReturnType<typeof useIntakePhotos>;
