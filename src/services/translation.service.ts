// Translation service using the traducir-texto edge function.
import { invokeAdminFunction } from './users.service';

interface TranslationResponse {
  texto: string;
}

export const translationService = {
  translateText: async (texto: string, idioma: 'es' | 'en'): Promise<string> => {
    const data = await invokeAdminFunction<TranslationResponse>('traducir-texto', { texto, idioma });
    return data.texto;
  },
};

export async function translateText(texto: string, idioma: 'es' | 'en'): Promise<string> {
  return translationService.translateText(texto, idioma);
}
