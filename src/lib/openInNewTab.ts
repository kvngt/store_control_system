/**
 * Abre en otra pestaña algo que hay que pedir primero (una URL firmada de un comprobante).
 *
 * La pestaña se abre **dentro del clic**, antes del `await`: si se abre después, Safari en el
 * iPhone la bloquea porque ya no es un gesto de la persona (QA 19/10/2026; el sticker ya lo hace
 * igual con `openStickerWindow`). Si el navegador no deja abrirla, se navega en la misma pestaña
 * al terminar: es mejor ver el comprobante que no verlo. Si pedir la URL falla, la pestaña en
 * blanco se cierra y el error sube para que quien llama lo muestre.
 */
export async function openInNewTab(getUrl: () => Promise<string>): Promise<void> {
  let tab: Window | null = null;
  try {
    tab = window.open('', '_blank');
  } catch {
    tab = null;
  }
  let url: string;
  try {
    url = await getUrl();
  } catch (err) {
    tab?.close();
    throw err;
  }
  if (tab) {
    // La pestaña en blanco no puede abrirse con `noopener` (devolvería null): se corta el vínculo aquí.
    try {
      tab.opener = null;
    } catch {
      /* algunos navegadores no dejan escribirlo */
    }
    tab.location.href = url;
  } else {
    window.location.assign(url);
  }
}
