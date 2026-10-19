import { translateText } from '../../services/translation.service';

/**
 * Traduce la nota de un sticker al idioma del sticker, con un timeout de 10 segundos.
 * Si no hay nota, no llama al servicio y devuelve { nota: null, fallo: false }.
 * Si la traducción falla o excede el tiempo, devuelve la nota original con fallo: true.
 */
export async function noteForSticker(
  nota: string | null | undefined,
  idioma: 'es' | 'en'
): Promise<{ nota: string | null; fallo: boolean }> {
  if (!nota || !nota.trim()) {
    return { nota: null, fallo: false };
  }

  const trimmed = nota.trim();

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ nota: string; fallo: boolean }>((_, reject) => {
    timerId = setTimeout(() => reject(new Error('Translation timeout')), 10000);
  });

  const translationPromise = translateText(trimmed, idioma)
    .then((traducido) => ({
      nota: traducido,
      fallo: false,
    }))
    .finally(() => {
      if (timerId !== undefined) clearTimeout(timerId);
    });

  try {
    return await Promise.race([translationPromise, timeoutPromise]);
  } catch {
    return { nota, fallo: true };
  }
}
