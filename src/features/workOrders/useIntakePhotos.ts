import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** One intake photo held in the browser before the order exists to attach it to. */
export interface PhotoZone {
  key: string;
  label: string;
  file: File;
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
 * The 360-degree intake photos.
 *
 * Deliberately outside React Hook Form: these are `File` objects with a
 * `blob:` URL each, and the thing that actually needs managing is not their
 * value but their **lifetime**. Nothing used to revoke those URLs, so closing
 * the dialog — or replacing a tile, or discarding a draft — stranded the
 * full-resolution image in memory for the life of the tab, all day on a shop
 * tablet that shoots six photos an order. Every URL created here is revoked
 * when its photo goes away, on reset, and on unmount.
 */
export function useIntakePhotos() {
  const [photos, setPhotos] = useState<Record<string, PhotoZone>>({});

  // Every object URL handed out, so none is left behind when the tab moves on.
  const objectUrls = useRef(new Set<string>());

  const trackUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  }, []);

  const releaseUrl = useCallback((url: string | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }, []);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const setZonePhoto = useCallback(
    (zoneKey: string, file: File) => {
      const label = ZONES.find((z) => z.key === zoneKey)?.label || zoneKey;
      const preview = trackUrl(file);
      setPhotos((prev) => {
        releaseUrl(prev[zoneKey]?.preview);
        return { ...prev, [zoneKey]: { key: zoneKey, label, file, preview } };
      });
    },
    [releaseUrl, trackUrl]
  );

  // Photos beyond the six fixed zones: damage close-ups, paperwork, anything
  // the six-tile grid can't anticipate. They're appended with generated keys
  // so the fixed zones keep their meaning.
  const addExtraPhotos = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const created = files.map((file) => ({ file, preview: trackUrl(file) }));
      setPhotos((prev) => {
        const next = { ...prev };
        let n = Object.keys(prev).filter((k) => k.startsWith('extra-')).length;
        created.forEach(({ file, preview }) => {
          n += 1;
          const key = `extra-${Date.now()}-${n}`;
          next[key] = { key, label: `Extra ${n}`, file, preview };
        });
        return next;
      });
    },
    [trackUrl]
  );

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
    setPhotos((prev) => {
      Object.values(prev).forEach((photo) => releaseUrl(photo.preview));
      return {};
    });
  }, [releaseUrl]);

  const extraPhotos = useMemo(
    () => Object.values(photos).filter((ph) => !ZONES.some((z) => z.key === ph.key)),
    [photos]
  );
  const zonesCovered = useMemo(() => ZONES.filter((z) => photos[z.key]).length, [photos]);

  /** What the service needs to upload once the order exists. */
  const toUploads = useCallback(
    () => Object.values(photos).map((p) => ({ zone: p.key, file: p.file })),
    [photos]
  );

  return {
    photos,
    extraPhotos,
    zonesCovered,
    hasPhotos: Object.keys(photos).length > 0,
    setZonePhoto,
    addExtraPhotos,
    removePhoto,
    reset,
    toUploads,
  };
}

export type IntakePhotosApi = ReturnType<typeof useIntakePhotos>;
